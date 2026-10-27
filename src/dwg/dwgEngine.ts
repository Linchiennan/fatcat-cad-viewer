// DWG → DXF inside the conversion worker (T13 4.2). Kept free of worker plumbing so tests can run the
// real libredwg runtime in Node. Steps run in the fixed order of the spec.
import { LibreDwg, Dwg_File_Type, Dwg_Object_Type, dwgCodePageToEncoding } from "@mlightcad/libredwg-web";
import type { DwgErrorCode } from "../types/errors";
import type { SavedView } from "../viewer/savedView";
import { detectDxfEncoding } from "../viewer/dxfEncoding";
import { joinSplitChunks } from "./utf8Chunks";
import { headerArrowSize, missingBlockNames, needsTextRecovery, readerTexts, rebuildBlocks } from "./missingBlocks";
import { restoreLayerStates, type LayerState } from "./layerStates";
import { annotateDxfXclips } from "./xclipMetadata";
import { classifyEngineError, FATAL_READ_ERRORS, isDgnLinestyleClass, looksLikeMemory } from "./dwgDiagnostics";
import { containsAscii } from "./dxfLines";
import { MAX_DXF_BYTES, tooLargeMessage } from "../files/fileTypes";

type Any = any;

/** Largest DXF handed to the viewer (T13 3.2; 160 MB since 2026-10-27, see fileTypes). */
export { MAX_DXF_BYTES };
const INPUT = "/tmp/fatcat-input.dwg", OUTPUT = "/tmp/fatcat-output.dxf";

/** Output hooks of one engine instance (emscripten print / printErr). */
export type EngineHooks = { print: (line: string) => void; printErr: (line: string) => void };
/** Create a fresh libredwg runtime instance (each call = new wasm memory). */
export type EngineFactory = (hooks: EngineHooks) => Promise<Any>;

/** Failure with a T13 code; `engineError` is the libredwg error value when there was one. */
export class DwgFailure extends Error {
  /** DGN linestyle objects the reader counted before the failure (shown with a DGNPURGE hint). */
  dgnObjects?: number;
  constructor(readonly code: DwgErrorCode | "FILE_TOO_LARGE", message: string, readonly engineError?: number) {
    super(message);
    this.name = "DwgFailure";
  }
}

export type ConversionResult = {
  dxf: Uint8Array;
  savedView: SavedView | null;
  /** Engine diagnostics: stderr lines + a non-fatal reader error. */
  diagnostics: number;
  /** Fallback data as JSON (blocks / skipped / texts / error), or null when not needed. */
  fallback: string | null;
  /** External references saved unloaded (not resolved when the drawing was saved); CAD does not load them on open. */
  unloadedXrefs: string[];
};

type Metadata = { layers: Map<string, LayerState> | null; view: SavedView | null; nonFatal: boolean; unloadedXrefs: string[]; dgnObjects: number };
type ViewCandidate = SavedView & { active: boolean };

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/**
 * Objects of the DGN linestyle classes (LSDEFINITION, LS…COMPONENT). AutoCAD 2013–2014 copied them over and over in
 * drawings that ever met a MicroStation linetype; hundreds of thousands of them derail LibreDWG's reader (上晴 竣工圖:
 * 插座圖 had 27 萬, layers and *Model_Space were lost and the DXF came out empty). Never throws; 0 when unknown.
 */
export function countDgnObjects(module: Any, data: number): number {
  try {
    const dgn = new Set<number>();
    for (let i = 0, n = module.dwg_get_num_classes(data); i < n; i++) {
      const c = module.dwg_get_class(data, i);
      if (c && isDgnLinestyleClass(String(c.dxfname ?? ""))) dgn.add(Number(c.num));
    }
    if (!dgn.size) return 0;
    let count = 0;
    for (let i = 0, n = module.dwg_get_num_objects(data); i < n; i++) {
      const obj = module.dwg_get_object(data, i);
      if (obj && dgn.has(module.dwg_object_get_type(obj))) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/** First pass: layer states and the saved view from the object reader (T13 4.2-3). Never throws. */
export function readDwgMetadata(module: Any, path: string): Metadata {
  const none: Metadata = { layers: null, view: null, nonFatal: false, unloadedXrefs: [], dgnObjects: 0 };
  let data = 0;
  try {
    const read = module.dwg_read_file(path);
    data = read?.data ?? 0;
    const error = Number(read?.error ?? 0);
    if (data) none.dgnObjects = countDgnObjects(module, data);
    if (!data || (error & FATAL_READ_ERRORS)) return none;
    const lib: Any = LibreDwg.createByWasmInstance(module);
    try { lib.decoder = new TextDecoder(dwgCodePageToEncoding(module.dwg_get_codepage(data))); } catch { /* names stay as decoded by the engine */ }
    const field = (tio: number, name: string) => lib.dwg_dynapi_entity_value(tio, name)?.data;
    const layers = new Map<string, LayerState>(), views: ViewCandidate[] = [], unloadedXrefs: string[] = [];
    const count = module.dwg_get_num_objects(data);
    for (let i = 0; i < count; i++) {
      const obj = module.dwg_get_object(data, i);
      if (!obj) continue;
      const type = module.dwg_object_get_fixedtype(obj);
      if (type !== Dwg_Object_Type.DWG_TYPE_LAYER && type !== Dwg_Object_Type.DWG_TYPE_VPORT && type !== Dwg_Object_Type.DWG_TYPE_BLOCK_HEADER) continue;
      const tio = module.dwg_object_to_object_tio(obj);
      if (!tio) continue;
      const name = String(field(tio, "name") ?? "");
      if (type === Dwg_Object_Type.DWG_TYPE_BLOCK_HEADER) {
        // The DXF writer drops this state (flags 12 either way). 世舜 太原段 etc.: every xref saved unresolved stayed
        // unloaded in ZWCAD and every resolved one loaded (450 of 450 with the file present).
        if (name && num(field(tio, "blkisxref")) && !num(field(tio, "is_xref_resolved"))) unloadedXrefs.push(name);
        continue;
      }
      if (type === Dwg_Object_Type.DWG_TYPE_LAYER) {
        if (name) layers.set(name, { off: !!num(field(tio, "off")), frozen: !!num(field(tio, "frozen")), frozenInNew: !!num(field(tio, "frozen_in_new")) });
        continue;
      }
      const center = field(tio, "VIEWCTR"), height = num(field(tio, "VIEWSIZE"));
      if (!center || !Number.isFinite(num(center.x)) || !Number.isFinite(num(center.y)) || !(height > 0)) continue;
      const view: ViewCandidate = { center: { x: num(center.x), y: num(center.y) }, viewHeight: height, active: false };
      const aspect = num(field(tio, "aspect_ratio")), twist = num(field(tio, "view_twist"));
      if (Number.isFinite(aspect) && aspect > 0) view.aspect = aspect;
      if (Number.isFinite(twist)) view.twist = twist;
      const lo = field(tio, "lower_left"), hi = field(tio, "upper_right");
      view.active = name.trim().toUpperCase() === "*ACTIVE" || (num(lo?.x) === 0 && num(lo?.y) === 0 && num(hi?.x) === 1 && num(hi?.y) === 1);
      views.push(view);
    }
    const chosen = [...views].reverse().find((v) => v.active) ?? views[0] ?? null;
    let view: SavedView | null = null;
    if (chosen) { const { active: _active, ...rest } = chosen; void _active; view = rest; }
    return { layers, view, nonFatal: error !== 0, unloadedXrefs, dgnObjects: none.dgnObjects };
  } catch {
    return none;
  } finally {
    if (data) {
      try { module.dwg_free(data); } catch {
        try { module.dwg_abandon(data); } catch { /* reclaimed when the worker ends */ }
      }
    }
  }
}

/** Second engine instance reads blocks / texts the DXF writer lost (T13 4.5). Never throws. */
export async function readFallback(dxf: Uint8Array, encoding: string, dwg: Uint8Array, createEngine: EngineFactory): Promise<string | null> {
  let text: string;
  try { text = new TextDecoder(encoding).decode(dxf); } catch { return null; }
  const names = missingBlockNames(text), needText = needsTextRecovery(text);
  if (!names.length && !needText) return null;
  const empty = (error: string) => JSON.stringify({ blocks: {}, skipped: {}, error });
  try {
    const module = await createEngine({ print: () => {}, printErr: () => {} });
    const lib: Any = LibreDwg.createByWasmInstance(module);
    const data = lib.dwg_read_data(dwg, Dwg_File_Type.DWG);
    if (!data) return empty("備援讀取未取得圖面資料");
    try {
      const db = lib.convert(data);
      const rebuilt = rebuildBlocks(db, names, headerArrowSize(text));
      const out: Any = { blocks: rebuilt.blocks, skipped: rebuilt.skipped };
      if (needText) out.texts = readerTexts(db);
      return JSON.stringify(out);
    } finally {
      try { lib.dwg_free(data); } catch { /* ends with the worker */ }
    }
  } catch (error) {
    return empty(String(error instanceof Error ? error.message : error).slice(0, 200));
  }
}

function unlink(module: Any, path: string): void {
  try { if (module.FS.analyzePath(path, false).exists) module.FS.unlink(path); } catch { /* ignore */ }
}

/** Output check (T13 4.2-10): "SECTION" in the first 4 KB and "EOF" in the last 4 KB. */
export function validDxfOutput(dxf: Uint8Array): boolean {
  return dxf.length > 0 && containsAscii(dxf, "SECTION", 0, Math.min(4096, dxf.length)) && containsAscii(dxf, "EOF", Math.max(0, dxf.length - 4096));
}

/** Run the whole conversion. Throws DwgFailure. */
export async function convertDwgBytes(dwg: Uint8Array, createEngine: EngineFactory): Promise<ConversionResult> {
  let stderrLines = 0, lastErr = "";
  let module: Any;
  try {
    module = await createEngine({ print: () => {}, printErr: (line) => { stderrLines++; lastErr = String(line).slice(0, 512); } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DwgFailure(looksLikeMemory(message) ? "DWG_MEMORY_LIMIT" : "DWG_RUNTIME_MISSING", "DWG runtime failed to start: " + message);
  }
  let dgnObjects = 0;
  try {
    module.FS.writeFile(INPUT, dwg);
    const meta = readDwgMetadata(module, INPUT);
    dgnObjects = meta.dgnObjects;
    const error = Number(module.dwg_write_dxf(INPUT, OUTPUT));
    if (error !== 0) throw new DwgFailure(classifyEngineError(error, dwg.length), `libredwg returned ${error}`, error);
    const size = module.FS.stat(OUTPUT).size;
    // The limit rides in the message so the error screen can name it (shellText.errorReasonKey).
    if (size > MAX_DXF_BYTES) throw new DwgFailure("FILE_TOO_LARGE", tooLargeMessage(MAX_DXF_BYTES));
    let dxf: Uint8Array = module.FS.readFile(OUTPUT);
    const encoding = detectDxfEncoding(dxf.subarray(0, 65536));
    dxf = joinSplitChunks(dxf, encoding).bytes;
    dxf = restoreLayerStates(dxf, meta.layers, encoding);
    dxf = annotateDxfXclips(dxf);
    if (!validDxfOutput(dxf)) throw new DwgFailure("DWG_EXPORT_FAILED", "The DWG was read but the DXF output is not valid.");
    const fallback = await readFallback(dxf, encoding, dwg, createEngine);
    return { dxf, savedView: meta.view, diagnostics: stderrLines + (meta.nonFatal ? 1 : 0), fallback, unloadedXrefs: meta.unloadedXrefs };
  } catch (error) {
    const failure = error instanceof DwgFailure ? error : new DwgFailure(
      looksLikeMemory(error instanceof Error ? error.message : String(error), lastErr) ? "DWG_MEMORY_LIMIT" : "DWG_CONVERSION_FAILED",
      "DWG conversion failed: " + (error instanceof Error ? error.message : String(error)));
    if (dgnObjects) failure.dgnObjects = dgnObjects;
    throw failure;
  } finally {
    unlink(module, INPUT);
    unlink(module, OUTPUT);
  }
}
