// The CAD engine around dxf-viewer (T14). Owner: P4 group B.
// It puts our modules together in the fixed order of T14 3.3 / 8.1, owns the camera, the viewer worker,
// reading position and layer memory, and reports picks for measuring. One engine per canvas element.
import { DxfViewer } from "dxf-viewer";
import { Color, MOUSE } from "three";
import { AppError } from "../types/errors";
import { MODEL_SPACE, type CadSpace, type DiagnosticCapture, type DrawingBounds, type DrawingPoint, type EngineReport, type LoadProgress, type LoadStage, type ViewCommand } from "../types/drawing";
import type { CadEngine, MeasurePick, MeasurePreview } from "../types/engine";
import { buildMeasurementGeometry, type MeasurementGeometry, type MeasurementIndex, type MeasurementSettings, type MeasurableEntity } from "./measurementGeometry";
import type { Mark } from "./markup";
import { paintMarks } from "./markup";
import { labelHeight } from "./measureResults";
import { resolveMeasurePick, toleranceFor } from "../measure/resolvePick";
import { assertFileSize } from "../files/fileTypes";
import { parseCadFile } from "./xrefs";
import { selectCadSpace } from "./cadDocument";
import { collectRasters, installRasters, replaceRasterEntities } from "./rasterImages";
import { installScreenStrokes } from "./screenStrokes";
import { recordDiagnostic, getParseAudit } from "./parseAudit";
import { conversionWarnings } from "../dwg/convertDwg";
import { detectDxfEncoding } from "./dxfEncoding";
import { savedViewFor, type SavedView } from "./savedView";
import { drawingIdentity, loadPosition, readLayerMemory, saveLayerMemory, savePosition, sheetKey, type ReadingPosition } from "./readingPosition";
import { installXclipViewer, XCLIP_LAYER_PREFIX, xclipBaseLayer } from "./xclipScene";
import { VIEWER_WORKER_FAILED } from "./workerMessages";
import { attachDebug, detachDebug } from "./engineDebug";
import { renderRegion as drawRegion, type RegionOptions, type RegionResult } from "./regionRender";
import { fallbackPadding, fitInArea, freeArea, initialBounds, savedViewCamera, validBounds, type CameraView, type Rect, type ShellLayout } from "./viewGeometry";

type Any = any;

/** Load time limit (T14 6-1). */
export const LOAD_TIMEOUT_MS = 180_000;
/** Bundled fonts, in fallback order (T14 3.3-10). */
export const ENGINE_FONTS = ["fonts/LiberationSans-Regular.ttf", "fonts/NotoSansCJKtc-Regular.otf"];
/** Prefix of the assembled-document files our xrefs module writes. */
const JSON_PREFIX = "FATCAT-DXF-JSON\n";
const BACKGROUND = "#0b1118";
const ZOOM_MIN = 0.01, ZOOM_MAX = 1000;
const TAP_SLOP_PX = 8, TAP_MAX_MS = 1000, AIM_DELAY_MS = 350, AIM_TOUCH_LIFT_PX = 64;
const RECENTER_DELAYS = [150, 500, 1200];
const REBUILD_DELAY_MS = 300;
const TEXT_KINDS = new Set(["TEXT", "MTEXT", "ATTRIB", "ATTDEF"]);
const TEXT_CANDIDATE_LIMIT = 500;

/**
 * Elements of the viewer shell the fit avoids (T14 3.5-1a). The shell element carries
 * `data-viewer-shell`; inside it `data-fit="top"` (file name bar), `data-fit="toolbar"` (bottom bar or
 * side dock) and `data-fit="corner"` (drawing check strip, space switcher).
 */
export const SHELL_SELECTORS = { shell: "[data-viewer-shell]", top: '[data-fit="top"]', toolbar: '[data-fit="toolbar"]', corner: '[data-fit="corner"]' } as const;

export type CadEngineOptions = {
  /** Base URL fonts are resolved against (default: the page). */
  baseUrl?: string;
  /** Viewer worker factory (default: viewer.worker.ts as a module worker). */
  createWorker?: () => Worker;
  /** dxf-viewer factory (tests). */
  createViewer?: (container: HTMLElement, options: Any) => Any;
  /** Options for off-screen region drawing (tests). */
  region?: RegionOptions;
};

/** CadEngine plus an error channel for failures after the drawing is shown (WebGL loss, command errors). */
export type FatcatCadEngine = CadEngine & {
  onError(handler: (error: AppError) => void): () => void;
  /** Whether a drawing is on screen. */
  isReady(): boolean;
  /** Draw `bounds` (drawing coordinates) into a new widthPx x heightPx canvas without moving the view (005 export). Rejects with ExportTooLargeError (code EXPORT_TOO_LARGE). */
  renderRegion(bounds: DrawingBounds, widthPx: number, heightPx: number): Promise<HTMLCanvasElement>;
  /** Full extent of the sheet on screen, or null when it has nothing drawable. */
  sheetBounds(): DrawingBounds | null;
  /** What the canvas shows now, in drawing coordinates, or null before a drawing is shown. */
  viewBounds(): DrawingBounds | null;
  /** Canvas CSS px → drawing point (same as unproject). */
  screenToDrawing(x: number, y: number): DrawingPoint;
};

const abortError = () => new DOMException("The drawing load was cancelled.", "AbortError");
const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

let patched = false;
/** Global dxf-viewer patches: middle-button pan on every control rebuild, XCLIP materials. */
export function installViewerPatches(viewerClass: Any = DxfViewer): void {
  if (patched && viewerClass === DxfViewer) return;
  if (viewerClass === DxfViewer) patched = true;
  const p = viewerClass.prototype;
  if (!p.fatcatControlsPatched) {
    p.fatcatControlsPatched = true;
    const create = p._CreateControls;
    p._CreateControls = function () {
      create.call(this);
      if (this.controls) this.controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.PAN };
    };
  }
  installXclipViewer(viewerClass);
}

function defaultWorker(): Worker {
  return new Worker(new URL("./viewer.worker.ts", import.meta.url), { type: "module", name: "fatcat-dxf-worker" });
}

const STAGES: Record<string, LoadStage> = { font: "fonts", fetch: "loading", parse: "parsing", prepare: "preparing" };

type LoadTask = { serial: number; fail: (error: unknown) => void; worker: Worker | null; url: string | null };
type Pointer = { x: number; y: number };
type Tap = { id: number; x: number; y: number; time: number; touch: boolean };

/** Text heights of a sheet for measurement labels (our measureResults.labelHeight). */
function sheetLabelHeight(doc: Any): number | null {
  const heights: number[] = [], dims: number[] = [];
  const height = (e: Any) => Number(e.textHeight ?? e.height);
  const isText = (e: Any) => e.type === "TEXT" || e.type === "MTEXT";
  for (const e of doc.entities ?? []) {
    if (isText(e)) heights.push(height(e));
    if (e.type === "DIMENSION" && e.block) for (const d of doc.blocks?.[e.block]?.entities ?? []) if (isText(d)) dims.push(height(d));
  }
  for (const b of Object.values(doc.blocks ?? {}) as Any[]) {
    if (/^\*D/i.test(String(b.name ?? ""))) continue;
    for (const e of b.entities ?? []) if (isText(e)) heights.push(height(e));
  }
  return labelHeight(doc.header, heights, dims);
}

export class DxfCadEngine implements FatcatCadEngine {
  private readonly viewer: Any;
  private readonly canvas: HTMLCanvasElement;
  private readonly baseUrl: string;
  private readonly createWorker: () => Worker;
  private readonly regionOptions: RegionOptions;
  /** Tiles and time of the last renderRegion (for checks and the debug hook). */
  lastRegion: Omit<RegionResult, "canvas"> | null = null;
  private readonly cleanups: (() => void)[] = [];
  private disposed = false;
  private ready = false;
  private loadSerial = 0;
  private task: LoadTask | null = null;
  private file: File | null = null;
  private parsed: Any = null;
  private space = MODEL_SPACE;
  private spaceList: CadSpace[] = [{ name: MODEL_SPACE, order: 0 }];
  private key = "";
  private reportValue: EngineReport | null = null;
  private index: MeasurementIndex | null = null;
  private labelHeightValue: number | null = null;
  private rasters: { dispose: () => void; showLayer: (name: string, visible: boolean) => void; count: number } | null = null;
  private strokes: (() => void) | null = null;
  private saved: SavedView | null = null;
  private home: CameraView | null = null;
  private recenterTimers: ReturnType<typeof setTimeout>[] = [];
  private recenterFrame = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private rebuild: { timer: ReturnType<typeof setTimeout>; waiters: { resolve: (v: boolean) => void; reject: (e: unknown) => void }[] } | null = null;
  private measurement: MeasurementSettings | null = null;
  private readonly pointers = new Map<number, Pointer>();
  private tap: Tap | null = null;
  private aimTimer: ReturnType<typeof setTimeout> | null = null;
  private aiming: { id: number; touch: boolean } | null = null;
  private readonly pickHandlers = new Set<(pick: MeasurePick) => void>();
  private readonly previewHandlers = new Set<(preview: MeasurePreview) => void>();
  private readonly viewHandlers = new Set<() => void>();
  private readonly errorHandlers = new Set<(error: AppError) => void>();

  constructor(private readonly container: HTMLElement, options: CadEngineOptions = {}) {
    this.baseUrl = options.baseUrl ?? (typeof document !== "undefined" ? document.baseURI : "http://localhost/");
    this.createWorker = options.createWorker ?? defaultWorker;
    this.regionOptions = options.region ?? {};
    const viewerOptions = {
      autoResize: true, clearColor: new Color(BACKGROUND), clearAlpha: 1, antialias: true, pointSize: 3,
      colorCorrection: false, blackWhiteInversion: false, retainParsedDxf: true, preserveDrawingBuffer: false,
    };
    if (!options.createViewer) installViewerPatches();
    this.viewer = options.createViewer ? options.createViewer(container, viewerOptions) : new DxfViewer(container, viewerOptions as Any);
    // dxf-viewer returns a half-built object instead of throwing when WebGL is unavailable.
    if (!this.viewer?.HasRenderer?.()) throw new AppError("RENDER_FAILED", "WebGL could not be initialized.");
    this.canvas = this.viewer.GetCanvas();
    this.listen(this.canvas, "webglcontextlost", (e) => this.onContextLost(e));
    this.listen(this.canvas, "pointerdown", (e) => this.onPointerDown(e as PointerEvent));
    this.listen(this.canvas, "pointermove", (e) => this.onPointerMove(e as PointerEvent));
    this.listen(this.canvas, "pointerleave", () => { if (!this.aiming) this.emitPreview(null); });
    this.listen(this.canvas, "pointerup", (e) => this.onPointerUp(e as PointerEvent));
    this.listen(this.canvas, "pointercancel", (e) => this.onPointerCancel(e as PointerEvent));
    this.listen(this.canvas, "wheel", () => this.cancelRecenter(), { passive: true });
    // Middle button pans; stop the browser's autoscroll cursor.
    this.listen(this.canvas, "mousedown", (e) => { if ((e as MouseEvent).button === 1) e.preventDefault(); });
    const onView = () => this.onViewerViewChanged();
    this.viewer.Subscribe("viewChanged", onView);
    attachDebug(this);
    this.cleanups.push(() => { try { this.viewer.Unsubscribe("viewChanged", onView); } catch { /* viewer gone */ } });
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  // ---- loading ---------------------------------------------------------------------------------

  async load(file: File, onProgress: LoadProgress, space: string = MODEL_SPACE, signal?: AbortSignal): Promise<void> {
    if (this.disposed) throw abortError();
    if (signal?.aborted) throw abortError();
    this.flushPosition();
    this.cancelTask(abortError());
    this.cancelRecenter();
    this.releaseScene();
    this.ready = false;
    const task: LoadTask = { serial: ++this.loadSerial, fail: () => {}, worker: null, url: null };
    this.task = task;
    const interrupted = new Promise<never>((_, reject) => { task.fail = reject; });
    interrupted.catch(() => {});
    const guard = <T>(work: Promise<T>) => Promise.race([work, interrupted]);
    const current = () => this.task === task && !this.disposed;
    const onAbort = () => task.fail(abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => task.fail(new AppError("DXF_OPEN_FAILED", "Drawing loading timed out.")), LOAD_TIMEOUT_MS);
    const progress: LoadProgress = (stage, done, total) => { if (current()) { try { onProgress(stage, done, total); } catch { /* UI only */ } } };
    try {
      assertFileSize(file.size);
      if (this.file !== file) { this.file = file; this.parsed = null; }
      const saved = space === MODEL_SPACE ? savedViewFor(file) : null;
      const key = sheetKey(await guard(drawingIdentity(file)), space);
      const position = await guard(loadPosition(key));
      progress("loading", 0, 0);
      if (!this.parsed) this.parsed = await guard(parseCadFile(file));
      const parsed = this.parsed;
      this.spaceList = (parsed.cadLayouts ?? [{ name: MODEL_SPACE, order: 0 }]).map((l: Any) => ({ name: l.name, order: l.order, ...(l.owner ? { owner: l.owner } : {}) }));
      const doc = selectCadSpace(parsed, space);
      const memory = readLayerMemory(key);
      doc.cadLayerVisibility = memory;
      const rasterItems = collectRasters(doc);
      replaceRasterEntities(doc);
      const label = sheetLabelHeight(doc);
      const json = JSON_PREFIX + JSON.stringify(doc);
      const url = URL.createObjectURL(new Blob([json], { type: "application/dxf" }));
      task.url = url;
      this.viewer.options.fileEncoding = detectDxfEncoding(new TextEncoder().encode(json.slice(0, 65536)));
      const fonts = ENGINE_FONTS.map((f) => new URL(f, this.baseUrl).href);
      await guard(this.viewer.Load({
        url, fonts,
        progressCbk: (phase: string, done: number, total: number) => progress(STAGES[phase] ?? "preparing", Number(done) || 0, Number(total) || 0),
        workerFactory: () => this.workerFor(task),
      }));
      if (!current()) throw abortError();

      this.strokes = installScreenStrokes(this.viewer);
      const dxf = this.viewer.GetDxf?.() ?? null;
      const report: EngineReport = (dxf?.cadReport as EngineReport) ?? { layers: [], warnings: [], xrefs: [], entityCount: 0, buildMs: 0 };
      // No index from the worker (empty sheet): an index built from nothing, so picks and fits find nothing.
      const geometry: MeasurementGeometry = dxf?.cadMeasurement ?? buildMeasurementGeometry({ header: doc.header, entities: [], blocks: {} });
      const rasters = await guard(installRasters(this.viewer, rasterItems, report.warnings));
      if (!current()) { rasters.dispose(); throw abortError(); }
      this.rasters = rasters;
      report.images = rasterItems.filter((r) => !r.entity.cadOleImage && r.entity.handle !== "standalone-image").map((r) => ({ path: String(r.entity.imagePath ?? ""), handle: String(r.entity.handle ?? "") }));
      report.embeddedImageCount = rasterItems.filter((r) => r.entity.cadOleImage).length;
      report.space = space;
      report.shownImageCount = rasters.count;
      try { recordDiagnostic("font.selection", { fonts: report.fontDiagnostics ?? null }); } catch { /* diagnostics never block drawing */ }
      const diagnostics = conversionWarnings.get(file) ?? 0;
      if (diagnostics > 0) report.warnings.push(`DWG解析引擎傳回 ${diagnostics} 筆診斷；可能含缺件或資料越界，未視為完整`);
      this.index = { ...geometry, report, viewKey: key };
      this.reportValue = report;
      this.labelHeightValue = label;
      this.key = key;
      this.space = space;
      this.saved = saved;
      for (const layer of report.layers) {
        if (typeof memory[layer.name] === "boolean") layer.visible = memory[layer.name];
        this.applyLayer(layer.name, layer.visible);
      }
      if (this.viewer.parsedDxf) this.viewer.parsedDxf = undefined;
      this.openView(position);
      this.ready = true;
      this.savePositionNow();
      this.emitView();
    } catch (error) {
      if (current()) { try { this.viewer.Clear(); } catch { /* keep the original error */ } this.ready = false; }
      if (isAbort(error) || error instanceof AppError) throw error;
      throw new AppError("DXF_OPEN_FAILED", error instanceof Error ? error.message : String(error), { cause: error });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (this.task === task) {
        this.endWorker(task);
        this.task = null;
      }
    }
  }

  private workerFor(task: LoadTask): Worker {
    const worker = this.createWorker();
    task.worker = worker;
    const fail = (message: string) => task.fail(new AppError("DXF_OPEN_FAILED", message || "The drawing worker failed."));
    worker.addEventListener("error", (e: ErrorEvent) => fail(e?.message));
    worker.addEventListener("messageerror", () => fail("The drawing worker reply could not be read."));
    worker.addEventListener("message", (e: MessageEvent) => { if (e.data?.type === VIEWER_WORKER_FAILED) fail(String(e.data.message ?? "")); });
    return worker;
  }

  private endWorker(task: LoadTask): void {
    if (task.worker) { try { task.worker.terminate(); } catch { /* already gone */ } task.worker = null; }
    if (task.url) { URL.revokeObjectURL(task.url); task.url = null; }
  }

  private cancelTask(reason: unknown): void {
    const task = this.task;
    if (!task) return;
    this.task = null;
    this.endWorker(task);
    task.fail(reason);
  }

  /** Drop what belongs to the drawing on screen (strokes, images). */
  private releaseScene(): void {
    if (this.strokes) { try { this.strokes(); } catch { /* ignore */ } this.strokes = null; }
    if (this.rasters) { try { this.rasters.dispose(); } catch { /* ignore */ } this.rasters = null; }
  }

  // ---- spaces and layers -----------------------------------------------------------------------

  spaces(): CadSpace[] { return this.spaceList.map((s) => ({ ...s })); }
  currentSpace(): string { return this.space; }
  report(): EngineReport | null { return this.reportValue; }
  measurementIndex(): MeasurementIndex | null { return this.index; }
  viewKey(): string { return this.key; }
  measureLabelHeight(): number | null { return this.labelHeightValue; }
  isReady(): boolean { return this.ready && !this.disposed; }
  /** A load (open, space switch, rebuild) is running. */
  isLoading(): boolean { return this.task !== null || this.rebuild !== null; }
  /** Camera centre and visible width in drawing units, or null before a drawing is shown. */
  camera(): CameraView | null { return this.ready ? this.currentView() : null; }

  /** Objects with geometry in the scene and their vertex total (debug / survey). */
  sceneStats(): { meshes: number; verts: number } {
    let meshes = 0, verts = 0;
    this.viewer.GetScene?.()?.traverse?.((o: Any) => {
      const count = o.geometry?.getAttribute?.("position")?.count ?? 0;
      if (count > 0) { meshes++; verts += count; }
    });
    return { meshes, verts };
  }

  /** Show / hide a layer on the GPU (and the synthetic XCLIP layers made from it, and its images). */
  private applyLayer(name: string, visible: boolean): void {
    try { this.viewer.ShowLayer(name, visible); } catch { /* no such layer */ }
    for (const layer of this.viewer.layers?.keys?.() ?? []) {
      if (typeof layer === "string" && layer.startsWith(XCLIP_LAYER_PREFIX) && xclipBaseLayer(layer) === name) {
        try { this.viewer.ShowLayer(layer, visible); } catch { /* ignore */ }
      }
    }
    this.rasters?.showLayer(name, visible);
  }

  async showLayer(name: string, visible: boolean): Promise<boolean> {
    const report = this.reportValue;
    if (!report || !this.ready) return false;
    const layer = report.layers.find((l) => l.name === name);
    if (layer) layer.visible = visible;
    this.applyLayer(name, visible);
    saveLayerMemory(this.key, Object.fromEntries(report.layers.map((l) => [l.name, l.visible])));
    this.render();
    if (!report.blockLayers?.includes(name)) return false;
    // Block content was flattened at build time: rebuild, merging switches within 300 ms (T14 4.6-2).
    return new Promise<boolean>((resolve, reject) => {
      if (this.rebuild) clearTimeout(this.rebuild.timer);
      const waiters = [...(this.rebuild?.waiters ?? []), { resolve, reject }];
      const timer = setTimeout(() => {
        this.rebuild = null;
        const file = this.file;
        if (!file || this.disposed) { waiters.forEach((w) => w.resolve(false)); return; }
        this.load(file, () => {}, this.space).then(() => waiters.forEach((w) => w.resolve(true)), (e) => waiters.forEach((w) => w.reject(e)));
      }, REBUILD_DELAY_MS);
      this.rebuild = { timer, waiters };
    });
  }

  // ---- camera ----------------------------------------------------------------------------------

  private origin(): DrawingPoint {
    const o = this.viewer.GetOrigin?.();
    return o && Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: o.x, y: o.y } : { x: 0, y: 0 };
  }

  private canvasSize(): { width: number; height: number } {
    return { width: Number(this.viewer.canvasWidth) || this.canvas.clientWidth || 0, height: Number(this.viewer.canvasHeight) || this.canvas.clientHeight || 0 };
  }

  /** Visible window in drawing coordinates. */
  private frame(): { left: number; right: number; top: number; bottom: number } {
    const cam = this.viewer.GetCamera(), o = this.origin(), zoom = cam.zoom || 1;
    return {
      left: cam.position.x + cam.left / zoom + o.x, right: cam.position.x + cam.right / zoom + o.x,
      top: cam.position.y + cam.top / zoom + o.y, bottom: cam.position.y + cam.bottom / zoom + o.y,
    };
  }

  private currentView(): CameraView {
    const f = this.frame();
    return { center: { x: (f.left + f.right) / 2, y: (f.top + f.bottom) / 2 }, width: f.right - f.left };
  }

  private setView(view: CameraView): void {
    const o = this.origin();
    this.viewer.SetView({ x: view.center.x - o.x, y: view.center.y - o.y }, view.width);
  }

  unproject(x: number, y: number): DrawingPoint {
    const f = this.frame(), { width, height } = this.canvasSize();
    return { x: f.left + (x / (width || 1)) * (f.right - f.left), y: f.top - (y / (height || 1)) * (f.top - f.bottom) };
  }

  project(points: readonly DrawingPoint[]): DrawingPoint[] {
    const f = this.frame(), { width, height } = this.canvasSize();
    const sx = width / (f.right - f.left || 1), sy = height / (f.top - f.bottom || 1);
    return points.map((p) => ({ x: (p.x - f.left) * sx, y: (f.top - p.y) * sy }));
  }

  pixelsPerUnit(): number {
    const f = this.frame(), w = f.right - f.left;
    return w > 0 ? this.canvasSize().width / w : 0;
  }

  panBy(dx: number, dy: number): void {
    if (!this.ready) return;
    const ppu = this.pixelsPerUnit();
    if (!(ppu > 0)) return;
    const view = this.currentView();
    this.setView({ center: { x: view.center.x - dx / ppu, y: view.center.y + dy / ppu }, width: view.width });
    this.afterViewChange();
  }

  zoomAt(x: number, y: number, factor: number): void {
    if (!this.ready || !(factor > 0) || !Number.isFinite(factor)) return;
    const view = this.currentView(), p = this.unproject(x, y);
    const k = 1 / factor; // the point under (x, y) stays put
    this.setView({ center: { x: p.x + (view.center.x - p.x) * k, y: p.y + (view.center.y - p.y) * k }, width: view.width * k });
    this.afterViewChange();
  }

  /** Shell elements around the canvas, measured now. */
  private shellLayout(): ShellLayout {
    const shell = this.canvas.closest?.(SHELL_SELECTORS.shell);
    if (!shell) return {};
    const rect = (el: Element | null): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    return {
      topBar: rect(shell.querySelector(SHELL_SELECTORS.top)),
      toolbar: rect(shell.querySelector(SHELL_SELECTORS.toolbar)),
      corners: [...shell.querySelectorAll(SHELL_SELECTORS.corner)].map((el) => rect(el)!).filter(Boolean),
    };
  }

  /** Centre `range` in the free part of the canvas (T14 3.5); returns the camera, or null without a layout. */
  private fit(range: DrawingBounds): CameraView | null {
    const r = this.canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const canvas = { left: r.left, top: r.top, width: r.width, height: r.height };
      const view = fitInArea(range, canvas, freeArea(canvas, this.shellLayout()));
      this.setView(view);
      return view;
    }
    // No layout yet: let dxf-viewer fit with a margin that leaves room for the bars.
    const shell = this.shellLayout(), height = this.canvasSize().height;
    const bottomOf = (x: Rect | null | undefined) => (x ? x.top + x.height + 8 : 0);
    const reserve = Math.max(80, ...(shell.corners ?? []).map(bottomOf), bottomOf(shell.topBar), shell.toolbar && shell.toolbar.width > shell.toolbar.height ? shell.toolbar.height + 8 : 0);
    const o = this.origin();
    this.viewer.FitView(range.minX - o.x, range.maxX - o.x, range.minY - o.y, range.maxY - o.y, fallbackPadding(height, reserve));
    return null;
  }

  private allBounds(): DrawingBounds | null {
    const b = this.viewer.GetBounds?.();
    return validBounds(b) ? { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } : null;
  }

  private initialRange(): DrawingBounds | null {
    const all = this.allBounds(), index = this.index;
    return index ? initialBounds(all, index.fitBounds ?? [], !!index.fitComplete) : all;
  }

  private fitInitial(): void {
    const range = this.initialRange();
    if (range) this.fit(range);
  }

  /** First view after loading (T14 4.3). */
  private openView(position: ReadingPosition | null): void {
    if (position) {
      this.home = { center: { x: position.x, y: position.y }, width: position.width };
      this.setView(this.home);
      return;
    }
    this.home = null;
    if (!this.initialRange()) return;
    this.fitInitial();
    // The bars appear a moment later: fit again next frame and at 150 / 500 / 1200 ms unless the user acts.
    const again = () => { if (this.ready && !this.disposed) { this.fitInitial(); this.render(); this.savePositionNow(); this.emitView(); } };
    if (typeof requestAnimationFrame === "function") this.recenterFrame = requestAnimationFrame(again);
    this.recenterTimers = RECENTER_DELAYS.map((ms) => setTimeout(again, ms));
  }

  private cancelRecenter(): void {
    if (this.recenterFrame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.recenterFrame);
    this.recenterFrame = 0;
    this.recenterTimers.forEach(clearTimeout);
    this.recenterTimers = [];
  }

  command(command: ViewCommand): void {
    if (!this.ready || this.disposed) return;
    this.cancelRecenter();
    try {
      const cam = this.viewer.GetCamera();
      if (command === "zoom-in" || command === "zoom-out") {
        cam.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (cam.zoom || 1) * (command === "zoom-in" ? 1.25 : 0.8)));
        cam.updateProjectionMatrix();
        this.viewer.controls?.update?.();
      } else if (command === "fit") {
        const all = this.allBounds();
        if (all) this.fit(all);
      } else if (command === "reset") {
        const index = this.index, { width, height } = this.canvasSize();
        const range = index?.fitComplete ? this.initialRange() : this.allBounds();
        const camera = savedViewCamera(this.saved, range, height > 0 ? width / height : NaN);
        if (camera) this.setView(camera); else this.fitInitial();
      } else if (command === "home") {
        if (this.home) this.setView(this.home); else this.fitInitial();
      }
      this.afterViewChange();
    } catch (error) {
      this.emitError(new AppError("RENDER_FAILED", error instanceof Error ? error.message : String(error), { cause: error }));
    }
  }

  zoomTo(view: DrawingBounds, focus: DrawingBounds): { left: number; top: number; width: number; height: number } | null {
    if (!this.ready || !validBounds(view)) return null;
    this.cancelRecenter();
    const camera = this.fit(view);
    this.afterViewChange();
    if (!camera) return null;
    const [a, b] = this.project([{ x: focus.minX, y: focus.maxY }, { x: focus.maxX, y: focus.minY }]);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }

  private render(): void {
    try { this.viewer.Render(); } catch { /* lost context is reported by its own event */ }
  }

  private afterViewChange(): void {
    this.render();
    this.savePositionNow();
    this.emitView();
  }

  private onViewerViewChanged(): void {
    if (!this.ready) return;
    // Pans / zooms from the controls: save at most every 250 ms, always the last one.
    if (!this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = null; this.savePositionNow(); }, 250);
    this.emitView();
  }

  private emitView(): void {
    for (const h of this.viewHandlers) { try { h(); } catch { /* a listener error does not stop the others */ } }
  }

  private savePositionNow(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.ready || !this.key || !this.allBounds()) return;
    const v = this.currentView();
    if (![v.center.x, v.center.y, v.width].every(Number.isFinite) || !(v.width > 0)) return;
    savePosition(this.key, { x: v.center.x, y: v.center.y, width: v.width });
  }

  private flushPosition(): void {
    if (this.ready) this.savePositionNow();
  }

  // ---- measuring input (T14 4.9) ---------------------------------------------------------------

  setMeasurement(settings: MeasurementSettings): void {
    this.measurement = settings;
    if (!settings.enabled) this.resetGesture();
  }

  private measuring(): boolean { return !!this.measurement?.enabled && this.ready; }

  private resetGesture(): void {
    this.pointers.clear();
    this.tap = null;
    if (this.aimTimer) { clearTimeout(this.aimTimer); this.aimTimer = null; }
    if (this.aiming) { this.aiming = null; this.setPanEnabled(true); this.emitPreview(null); }
  }

  private setPanEnabled(enabled: boolean): void {
    const controls = this.viewer.controls;
    if (controls) controls.enabled = enabled;
  }

  private local(e: PointerEvent): Pointer {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown(e: PointerEvent): void {
    this.cancelRecenter();
    if (!this.measuring()) return;
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size > 1) { const keep = new Map(this.pointers); this.resetGesture(); keep.forEach((v, k) => this.pointers.set(k, v)); return; }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const at = this.local(e), touch = e.pointerType === "touch";
    this.tap = { id: e.pointerId, x: at.x, y: at.y, time: Date.now(), touch };
    this.aimTimer = setTimeout(() => {
      this.aimTimer = null;
      if (!this.tap || this.tap.id !== e.pointerId || this.pointers.size !== 1) return;
      this.aiming = { id: e.pointerId, touch };
      this.setPanEnabled(false);
      this.previewAt(at, touch);
    }, AIM_DELAY_MS);
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === "mouse" && !e.buttons && !this.pointers.size && this.measuring()) {
      this.previewAt(this.local(e), false);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    const at = this.local(e);
    this.pointers.set(e.pointerId, at);
    if (this.aiming?.id === e.pointerId) { this.previewAt(at, this.aiming.touch); return; }
    if (this.tap?.id === e.pointerId && Math.hypot(at.x - this.tap.x, at.y - this.tap.y) > TAP_SLOP_PX) {
      this.tap = null;
      if (this.aimTimer) { clearTimeout(this.aimTimer); this.aimTimer = null; }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const at = this.local(e);
    this.pointers.delete(e.pointerId);
    if (this.aiming?.id === e.pointerId) {
      const touch = this.aiming.touch;
      this.aiming = null;
      this.setPanEnabled(true);
      this.emitPreview(null);
      this.pickAt({ x: at.x, y: at.y - (touch ? AIM_TOUCH_LIFT_PX : 0) });
      this.tap = null;
      return;
    }
    const tap = this.tap;
    this.tap = null;
    if (this.aimTimer) { clearTimeout(this.aimTimer); this.aimTimer = null; }
    if (!tap || tap.id !== e.pointerId || this.pointers.size > 0) return;
    if (Math.hypot(at.x - tap.x, at.y - tap.y) > TAP_SLOP_PX || Date.now() - tap.time >= TAP_MAX_MS) return;
    this.pickAt(at);
  }

  private onPointerCancel(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.resetGesture();
  }

  /** Layers hidden right now, including the synthetic XCLIP layers made from them. */
  private hiddenLayers(): Set<string> {
    const hidden = new Set((this.reportValue?.layers ?? []).filter((l) => !l.visible).map((l) => l.name));
    if (hidden.size) for (const name of this.viewer.layers?.keys?.() ?? []) if (typeof name === "string" && name.startsWith(XCLIP_LAYER_PREFIX) && hidden.has(xclipBaseLayer(name))) hidden.add(name);
    return hidden;
  }

  private resolve(at: Pointer) {
    const settings = this.measurement;
    if (!settings) return null;
    const point = this.unproject(at.x, at.y);
    return resolveMeasurePick(this.index, settings, point, toleranceFor(this.pixelsPerUnit()), this.hiddenLayers());
  }

  private previewAt(at: Pointer, touch: boolean): void {
    const aim = { x: at.x, y: at.y - (touch ? AIM_TOUCH_LIFT_PX : 0) };
    const hit = this.resolve(aim);
    this.emitPreview(hit ? { point: hit.snap ? { x: hit.snap.x, y: hit.snap.y } : hit.point, snap: hit.snap?.kind ?? null } : null);
  }

  private pickAt(at: Pointer): void {
    const hit = this.resolve(at);
    if (!hit) return;
    const pick: MeasurePick = {
      point: hit.snap ? { x: hit.snap.x, y: hit.snap.y } : hit.point, snap: hit.snap?.kind ?? null, entity: hit.entity,
      screenY: at.y, canvasHeight: this.canvasSize().height,
    };
    for (const h of this.pickHandlers) { try { h(pick); } catch { /* ignore */ } }
  }

  private emitPreview(preview: MeasurePreview): void {
    for (const h of this.previewHandlers) { try { h(preview); } catch { /* ignore */ } }
  }

  onPick(handler: (pick: MeasurePick) => void): () => void { this.pickHandlers.add(handler); return () => this.pickHandlers.delete(handler); }
  onPreview(handler: (preview: MeasurePreview) => void): () => void { this.previewHandlers.add(handler); return () => this.previewHandlers.delete(handler); }
  onViewChanged(handler: () => void): () => void { this.viewHandlers.add(handler); return () => this.viewHandlers.delete(handler); }
  onError(handler: (error: AppError) => void): () => void { this.errorHandlers.add(handler); return () => this.errorHandlers.delete(handler); }

  private emitError(error: AppError): void {
    for (const h of this.errorHandlers) { try { h(error); } catch { /* ignore */ } }
  }

  private onContextLost(e: Event): void {
    e.preventDefault();
    if (this.disposed) return;
    this.ready = false;
    const error = new AppError("RENDER_FAILED", "The drawing's WebGL context was lost.");
    if (this.task) this.task.fail(error);
    else this.emitError(error);
  }

  // ---- output (005 export) ------------------------------------------------------------------

  sheetBounds(): DrawingBounds | null { return this.ready ? this.allBounds() : null; }

  viewBounds(): DrawingBounds | null {
    if (!this.ready) return null;
    const f = this.frame();
    return { minX: f.left, minY: f.bottom, maxX: f.right, maxY: f.top };
  }

  screenToDrawing(x: number, y: number): DrawingPoint { return this.unproject(x, y); }

  async renderRegion(bounds: DrawingBounds, widthPx: number, heightPx: number): Promise<HTMLCanvasElement> {
    if (!this.ready || this.disposed) throw new Error("The drawing is not ready for output.");
    const renderer = this.viewer.GetRenderer();
    const result = await drawRegion({
      renderer, scene: this.viewer.GetScene(), origin: this.origin(),
      setRenderSize: (size) => { this.viewer.fatcatRenderSize = size; },
      redraw: () => this.render(),
    }, bounds, widthPx, heightPx, this.regionOptions);
    this.lastRegion = { tiles: result.tiles, ms: result.ms };
    return result.canvas;
  }

  // ---- screenshots (T14 8.6) -------------------------------------------------------------------

  captureDiagnostics(): DiagnosticCapture {
    if (!this.ready || this.disposed) throw new Error("CAD解析尚未完成，不能截取其他畫面");
    const { width, height } = this.canvasSize();
    if (!(width > 0) || !(height > 0)) throw new Error("CAD畫布尺寸無效");
    // The drawing buffer is not preserved: redraw and read it in the same task.
    this.viewer.Render();
    const png = this.canvas.toDataURL("image/png");
    const view = this.currentView(), f = this.frame(), hidden = this.hiddenLayers();
    const candidates = (this.index?.entities ?? []).filter((e: MeasurableEntity) => TEXT_KINDS.has(e.kind) && !hidden.has(e.layer)
      && e.bounds.maxX >= f.left && e.bounds.minX <= f.right && e.bounds.maxY >= f.bottom && e.bounds.minY <= f.top);
    const audit = this.file ? getParseAudit(this.file) : null;
    return {
      png,
      capturedAt: new Date().toISOString(),
      view: {
        center: view.center, width: view.width, height: f.top - f.bottom, zoom: this.viewer.GetCamera().zoom ?? 1,
        canvasPixels: { width: this.canvas.width, height: this.canvas.height }, viewKey: this.key, loadSerial: this.loadSerial,
        textCandidateTotal: candidates.length, textCandidateLimit: TEXT_CANDIDATE_LIMIT,
        selection: "visible layer + world bounds overlap; not OCR, clipping/occlusion may differ",
      },
      textCandidates: candidates.slice(0, TEXT_CANDIDATE_LIMIT).map((e) => ({ kind: e.kind, layer: e.layer, bounds: e.bounds, ...(e.properties ? { properties: e.properties } : {}) })),
      fontDiagnostics: this.reportValue?.fontDiagnostics ?? null,
      source: audit ? { ...audit } : { sourceSHA256: "" },
    };
  }

  async shareImage(marks: readonly Mark[], caption: string): Promise<Blob> {
    const shot = this.captureDiagnostics();
    const image = new Image();
    image.src = shot.png;
    await image.decode();
    const cssWidth = this.container.clientWidth || this.canvasSize().width || image.width;
    const scale = image.width / cssWidth, band = Math.round(34 * scale);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height + band;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("無法建立圖片");
    ctx.drawImage(image, 0, 0);
    paintMarks(ctx, marks, (points) => this.project(points), this.pixelsPerUnit(), scale);
    ctx.fillStyle = "#101e2a";
    ctx.fillRect(0, image.height, canvas.width, band);
    ctx.fillStyle = "#ffffff";
    ctx.font = `${15 * scale}px "Noto Sans CJK TC","Noto Sans TC",sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(caption, 10 * scale, image.height + band / 2, canvas.width - 20 * scale);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("無法產生圖片");
    return blob;
  }

  // ---- teardown --------------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    detachDebug(this);
    if (this.aimTimer) { clearTimeout(this.aimTimer); this.aimTimer = null; }
    this.flushPosition();
    this.disposed = true;
    this.ready = false;
    this.cancelRecenter();
    if (this.rebuild) { clearTimeout(this.rebuild.timer); this.rebuild.waiters.forEach((w) => w.resolve(false)); this.rebuild = null; }
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.cancelTask(abortError());
    for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
    this.index = null;
    this.parsed = null;
    this.pickHandlers.clear(); this.previewHandlers.clear(); this.viewHandlers.clear(); this.errorHandlers.clear();
    this.releaseScene();
    const renderer = this.viewer.GetRenderer?.();
    try { this.viewer.Destroy(); } catch { /* still release the context below */ }
    // Android limits live WebGL contexts: always lose this one and take the canvas off the page.
    try { renderer?.forceContextLoss?.(); } catch { /* ignore */ }
    try { this.canvas.remove(); } catch { /* ignore */ }
  }
}

/** Create the engine in `container` (an empty element sized by the page). Throws AppError RENDER_FAILED without WebGL. */
export function createCadEngine(container: HTMLElement, options?: CadEngineOptions): FatcatCadEngine {
  return new DxfCadEngine(container, options);
}

export { ExportTooLargeError, EXPORT_PIXEL_LIMIT } from "./regionRender";
