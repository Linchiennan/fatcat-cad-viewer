// DWG diagnostics and failure classes (T13 3.3, 3.4, 5.2). Pure functions shared by the worker and the main thread.
import type { DwgDiagnostics, DwgErrorCode } from "../types/errors";

/** Header release number → AutoCAD release it first appeared in (T13 3.3-2). */
const RELEASE_OF: [number, string][] = [
  [1009, "R11/R12"], [1012, "R13"], [1014, "R14"], [1015, "2000"], [1018, "2004"],
  [1021, "2007"], [1024, "2010"], [1027, "2013"], [1032, "2018 format"],
];

/** "AC1018 (AutoCAD 2004)", the six header characters when printable ASCII, else UNKNOWN. */
export function dwgVersionLabel(head: Uint8Array): string {
  const six = head.subarray(0, 6);
  const text = String.fromCharCode(...six);
  const known = /^AC(\d{4})$/.exec(text) ? RELEASE_OF.find(([n]) => n === Number(text.slice(2))) : undefined;
  if (known) return `${text} (AutoCAD ${known[1]})`;
  if (six.length === 6 && [...six].every((b) => b >= 0x20 && b <= 0x7e)) return text;
  return "UNKNOWN";
}

/** Engine error bits in order (T13 3.4). */
export const ENGINE_FLAGS: [number, string][] = [
  [1, "WRONGCRC"], [2, "NOTYETSUPPORTED"], [4, "UNHANDLEDCLASS"], [8, "INVALIDTYPE"], [16, "INVALIDHANDLE"],
  [32, "INVALIDEED"], [64, "VALUEOUTOFBOUNDS"], [128, "CLASSESNOTFOUND"], [256, "SECTIONNOTFOUND"],
  [512, "PAGENOTFOUND"], [1024, "INTERNALERROR"], [2048, "INVALIDDWG"], [4096, "IOERROR"], [8192, "OUTOFMEM"],
];

/** Flag names joined by "|"; 0 → OK; unknown bits only → LIBREDWG_ERROR_<n>. */
export function engineCodeName(error: number): string {
  if (!error) return "OK";
  const names = ENGINE_FLAGS.filter(([bit]) => (error & bit) !== 0).map(([, name]) => name);
  return names.length ? names.join("|") : `LIBREDWG_ERROR_${error}`;
}

/** Errors after which the object reader's data cannot be used. */
export const FATAL_READ_ERRORS = 1024 | 2048 | 4096 | 8192;

/** Below this a DWG cannot really exhaust the engine's memory (it may grow to 4 GB). */
export const SMALL_DWG_BYTES = 32 * 1024 * 1024;

/**
 * Code for a non-zero engine error value (T13 5.2-2..4). The engine also says "out of memory" when bad data asks
 * it for an absurd allocation (惠宇 E03, 222 KB): for a small file that is unreadable data, not a memory limit.
 */
export function classifyEngineError(error: number, size = 0): DwgErrorCode {
  if (error & 8192) return size > 0 && size < SMALL_DWG_BYTES ? "DWG_PARSE_FAILED" : "DWG_MEMORY_LIMIT";
  if (error & (1 | 8 | 16 | 32 | 64 | 2048)) return "DWG_CORRUPT_OR_ENCRYPTED";
  return "DWG_PARSE_FAILED";
}

/** "Looks like out of memory" (T13 5.2-9); a wasm "memory access out of bounds" is bad data, not memory. */
export function looksLikeMemory(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => {
    if (!t) return false;
    const s = t.toLowerCase().replaceAll("memory access out of bounds", "");
    return /out of memory|cannot enlarge memory|allocation failed|oom/.test(s);
  });
}

/** Diagnostics table data for an error screen (T13 3.3-4). */
export function dwgDiagnostics(head: Uint8Array, bytes: number, engineError?: number, dgnObjects?: number): DwgDiagnostics {
  const out: DwgDiagnostics = { engine: "libredwg", version: dwgVersionLabel(head), bytes };
  if (engineError) out.engineCode = engineCodeName(engineError);
  if (dgnObjects && dgnObjects > 0) out.dgnObjects = dgnObjects;
  return out;
}

/**
 * From this many DGN linestyle objects the error screen says to clean the drawing in desktop CAD. 上晴 竣工圖 that did
 * not open carried 17–47 萬 (插座圖 474,827 entries); a drawing that merely uses a MicroStation linetype has a handful.
 */
export const DGN_JUNK_OBJECTS = 10_000;

/** DXF names of the DGN linestyle classes (AcDbLSDefinition and its components). */
export const isDgnLinestyleClass = (dxfname: string) => /^LS(DEFINITION|[A-Z]*COMPONENT)$/.test(dxfname);
