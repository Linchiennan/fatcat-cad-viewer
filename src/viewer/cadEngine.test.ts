// Engine behaviour around a fake dxf-viewer (no WebGL in tests): load lifecycle, cancellation,
// camera, reading position, layer memory, measuring input and teardown (T14 9-1).
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveObjectURL } from "node:buffer";
import { AppError } from "../types/errors";
import { createCadEngine, LOAD_TIMEOUT_MS, type FatcatCadEngine } from "./cadEngine";
import { VIEWER_WORKER_FAILED } from "./workerMessages";
import { registerSavedView } from "./savedView";
import type { MeasurementSettings } from "./measurementGeometry";

type Any = any;

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

class FakeCanvas extends EventTarget {
  width = 800; height = 600; clientWidth = 800; clientHeight = 600;
  rect = { left: 0, top: 0, width: 800, height: 600 };
  shell: Any = null;
  removed = false;
  getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
  closest() { return this.shell; }
  toDataURL() { return "data:image/png;base64,AAAA"; }
  remove() { this.removed = true; }
}

class FakeWorker extends EventTarget { terminated = false; terminate() { this.terminated = true; } postMessage() {} }

type Pending = { resolve: () => void; reject: (e: unknown) => void; url: string; worker: FakeWorker; text: Promise<string> };

class FakeViewer {
  options: Any = {};
  canvas = new FakeCanvas();
  canvasWidth = 800; canvasHeight = 600;
  layers = new Map<string, unknown>();
  controls = { enabled: true, update() {} };
  camera = { position: { x: 0, y: 0 }, left: -1, right: 1, top: 1, bottom: -1, zoom: 1, updateProjectionMatrix() {} };
  origin = { x: 0, y: 0 };
  bounds: Any = null;
  parsedDxf: Any = undefined;
  shown = new Map<string, boolean>();
  pending: Pending[] = [];
  cleared = 0; destroyed = false; lost = false; renders = 0; setViews = 0;
  constructor(readonly hasRenderer = true) {}
  HasRenderer() { return this.hasRenderer; }
  GetCanvas() { return this.canvas; }
  Subscribe(name: string, h: EventListener) { this.canvas.addEventListener("__dxf_" + name, h); }
  Unsubscribe(name: string, h: EventListener) { this.canvas.removeEventListener("__dxf_" + name, h); }
  Load(params: Any): Promise<void> {
    const worker = params.workerFactory() as FakeWorker;
    const blob = resolveObjectURL(params.url);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject, url: params.url, worker, text: blob ? blob.text() : Promise.resolve("") }));
  }
  /** Finish the oldest pending load as the real worker would. */
  finish(result: { dxf?: Any; bounds?: Any; origin?: Any } = {}) {
    const p = this.pending.shift()!;
    this.parsedDxf = result.dxf ?? sceneResult();
    this.bounds = result.bounds ?? { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    this.origin = result.origin ?? { x: 10, y: 5 };
    for (const l of this.parsedDxf.cadReport?.layers ?? []) this.layers.set(l.name, {});
    p.resolve();
    return p;
  }
  GetDxf() { return this.parsedDxf; }
  GetCamera() { return this.camera; }
  GetOrigin() { return this.origin; }
  GetBounds() { return this.bounds; }
  SetView(c: Any, width: number) {
    const h = width / (this.canvasWidth / this.canvasHeight);
    Object.assign(this.camera, { left: -width / 2, right: width / 2, top: h / 2, bottom: -h / 2, zoom: 1 });
    this.camera.position = { x: c.x, y: c.y };
    this.setViews++;
    this.canvas.dispatchEvent(new Event("__dxf_viewChanged"));
  }
  FitView(minX: number, maxX: number, minY: number, maxY: number, pad = 0.1) { this.SetView({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, Math.max(maxX - minX, (maxY - minY) * 800 / 600) * (1 + pad)); }
  Render() { this.renders++; }
  Clear() { this.cleared++; }
  Destroy() { this.destroyed = true; }
  ShowLayer(n: string, v: boolean) { this.shown.set(n, v); }
  GetScene() { return { children: [], add() {}, remove() {} }; }
  GetRenderer() { return { forceContextLoss: () => { this.lost = true; }, capabilities: { maxFragmentUniforms: 1024 } }; }
}

function sceneResult() {
  return {
    cadReport: { layers: [{ name: "A", color: 0xffffff, visible: true, originalVisible: true }, { name: "B", color: 0xff0000, visible: true, originalVisible: true }], warnings: [], xrefs: [], blockLayers: ["B"], entityCount: 1, buildMs: 1 },
    cadMeasurement: { unit: "drawing", entities: [{ kind: "LINE", layer: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], bounds: { minX: 0, minY: 0, maxX: 100, maxY: 0 }, length: 100, approximate: false }], snaps: [], limited: false, completeBounds: true, fitBounds: [], fitComplete: false },
  };
}

const jsonFile = (name = "plan.dxf", extra: Any = {}) => new File(["FATCAT-DXF-JSON\n" + JSON.stringify({ header: {}, tables: { layer: { layers: { A: { name: "A", color: 0xffffff } } } }, blocks: {}, cadLayouts: [{ name: "Model", order: 0 }], entities: [{ type: "LINE", handle: "1", layer: "A", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }], ...extra })], name);

let viewer: FakeViewer;
let workers: FakeWorker[];
let engine: FatcatCadEngine;
const make = (hasRenderer = true) => {
  viewer = new FakeViewer(hasRenderer);
  workers = [];
  return createCadEngine({ clientWidth: 800 } as unknown as HTMLElement, {
    baseUrl: "http://app.test/",
    createViewer: () => viewer,
    createWorker: () => { const w = new FakeWorker(); workers.push(w); return w as unknown as Worker; },
  });
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (test: () => boolean) => { for (let i = 0; i < 200 && !test(); i++) await tick(); if (!test()) throw new Error("timed out waiting"); };
const pointer = (type: string, props: Record<string, unknown>) => Object.assign(new Event(type), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0, ...props });

beforeEach(() => { (globalThis as Any).localStorage = new MemoryStorage(); });
afterEach(() => { vi.useRealTimers(); try { engine?.dispose(); } catch { /* already gone */ } });

describe("CAD engine", () => {
  it("refuses to start without WebGL", () => {
    expect(() => make(false)).toThrow(AppError);
    try { make(false); } catch (e) { expect((e as AppError).code).toBe("RENDER_FAILED"); }
  });

  it("decodes an old code page, hands JSON to dxf-viewer, then frees the URL and the worker", async () => {
    engine = make();
    const head = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$DWGCODEPAGE\n3\nANSI_950\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nTEXT\n5\n1\n8\n0\n10\n0\n20\n0\n40\n2\n1\n";
    const tail = "\n0\nENDSEC\n0\nEOF\n";
    const big5 = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5]); // 中文
    const file = new File([new TextEncoder().encode(head), big5, new TextEncoder().encode(tail)], "old.dxf");
    const load = engine.load(file, () => {});
    await until(() => viewer.pending.length === 1);
    const pending = viewer.pending[0];
    expect(await pending.text).toContain("中文");
    expect(viewer.options.fileEncoding).toBe("utf-8");
    viewer.finish();
    await load;
    expect(resolveObjectURL(pending.url)).toBeUndefined();
    expect(pending.worker.terminated).toBe(true);
    expect(viewer.parsedDxf).toBeUndefined(); // only the compact index is kept
    const index = engine.measurementIndex()!;
    expect(index.entities).toHaveLength(1);
    expect(index.viewKey).toBe(engine.viewKey());
    expect(index.report?.space).toBe("Model");
  });

  it("ends at once when cancelled even if the worker never answers", async () => {
    engine = make();
    const ctrl = new AbortController();
    const load = engine.load(jsonFile(), () => {}, "Model", ctrl.signal);
    await until(() => viewer.pending.length === 1);
    ctrl.abort();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0].terminated).toBe(true);
  });

  it("fails at once when the worker crashes or reports a failure, and frees the URL", async () => {
    engine = make();
    let load = engine.load(jsonFile(), () => {});
    await until(() => viewer.pending.length === 1);
    const url = viewer.pending[0].url;
    workers[0].dispatchEvent(Object.assign(new Event("error"), { message: "boom" }));
    await expect(load).rejects.toMatchObject({ code: "DXF_OPEN_FAILED" });
    expect(resolveObjectURL(url)).toBeUndefined();
    expect(viewer.cleared).toBeGreaterThan(0);

    load = engine.load(jsonFile(), () => {});
    await until(() => viewer.pending.length === 2);
    workers[1].dispatchEvent(new MessageEvent("message", { data: { type: VIEWER_WORKER_FAILED, message: "ArrayBuffer/ArrayBufferView size exceeds the supported range" } }));
    const error = await load.catch((e) => e);
    expect(error.code).toBe("DXF_OPEN_FAILED");
    expect(error.message).toContain("size exceeds");
  });

  it("times out after 180 s", async () => {
    engine = make();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const load = engine.load(jsonFile(), () => {});
    const caught = load.catch((e) => e);
    await vi.waitFor(() => expect(viewer.pending.length).toBe(1));
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS);
    const error = await caught;
    expect(error.code).toBe("DXF_OPEN_FAILED");
    expect(error.message).toBe("Drawing loading timed out.");
  });

  it("a new load cancels the old one without clearing the new drawing", async () => {
    engine = make();
    const first = engine.load(jsonFile("a.dxf"), () => {});
    await until(() => viewer.pending.length === 1);
    const second = engine.load(jsonFile("b.dxf"), () => {});
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await until(() => viewer.pending.length === 2);
    const cleared = viewer.cleared;
    viewer.pending.shift()!.resolve(); // the stale load finishing late
    viewer.finish();
    await second;
    expect(viewer.cleared).toBe(cleared);
    expect(engine.isReady()).toBe(true);
  });

  it("reports a lost WebGL context, during and after loading", async () => {
    engine = make();
    const load = engine.load(jsonFile(), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    await expect(load).rejects.toMatchObject({ code: "RENDER_FAILED" });
    viewer.pending.length = 0;

    const next = engine.load(jsonFile(), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await next;
    const errors: AppError[] = [];
    engine.onError((e) => errors.push(e));
    const lost = new Event("webglcontextlost", { cancelable: true });
    viewer.canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(errors.map((e) => e.code)).toEqual(["RENDER_FAILED"]);
  });

  it("opens with a full fit even with a CAD saved view; reset goes to the saved view", async () => {
    engine = make();
    const file = jsonFile("saved.dxf");
    registerSavedView(file, { center: { x: 40, y: 20 }, viewHeight: 30, aspect: 2 });
    const load = engine.load(file, () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    const fit = { x: viewer.camera.position.x + viewer.origin.x, w: viewer.camera.right - viewer.camera.left };
    expect(fit.x).toBeCloseTo(50, 6);
    expect(fit.w).toBeCloseTo(100 / (800 - 32) * 800, 6); // 16 px margins on the 800 px CSS canvas
    engine.command("reset");
    expect(viewer.camera.position.x + viewer.origin.x).toBeCloseTo(40, 9);
    expect(viewer.camera.right - viewer.camera.left).toBeCloseTo(30 * 2, 9);
    engine.command("home");
    expect(viewer.camera.position.x + viewer.origin.x).toBeCloseTo(50, 6);
  });

  it("finds the file bar and toolbar through the canvas wrappers", async () => {
    engine = make();
    const rect = (top: number, height: number, width = 800, left = 0) => ({ getBoundingClientRect: () => ({ left, top, width, height }) });
    viewer.canvas.shell = {
      querySelector: (s: string) => (s.includes("top") ? rect(0, 100) : s.includes("toolbar") ? rect(500, 100) : null),
      querySelectorAll: () => [],
    };
    const load = engine.load(jsonFile("shell.dxf"), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish({ bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } });
    await load;
    // free area 800 x 400 from y 100: height limits (100 / 368), and the drawing centre sits at canvas y 300
    const scale = 100 / (400 - 32);
    expect(viewer.camera.right - viewer.camera.left).toBeCloseTo(800 * scale, 6);
    expect(engine.project([{ x: 50, y: 50 }])[0].y).toBeCloseTo(300, 6);
  });

  it("returns to the reading position and keeps layer memory per sheet", async () => {
    engine = make();
    const file = jsonFile("memory.dxf");
    let load = engine.load(file, () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    engine.command("zoom-in");
    engine.panBy(40, 0);
    const before = engine.unproject(400, 300), width = engine.unproject(800, 0).x - engine.unproject(0, 0).x;
    expect(await engine.showLayer("A", false)).toBe(false);
    engine.dispose();

    engine = make();
    load = engine.load(file, () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    const after = engine.unproject(400, 300);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(engine.unproject(800, 0).x - engine.unproject(0, 0).x).toBeCloseTo(width, 6);
    expect(engine.report()!.layers.find((l) => l.name === "A")!.visible).toBe(false);
    expect(viewer.shown.get("A")).toBe(false);
    engine.panBy(100, 0);
    engine.command("home");
    expect(engine.unproject(400, 300).x).toBeCloseTo(before.x, 6);
  });

  it("rebuilds once for switches of layers used inside blocks", async () => {
    engine = make();
    const load = engine.load(jsonFile("blocks.dxf"), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    const a = engine.showLayer("B", false), b = engine.showLayer("B", true);
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(workers).toHaveLength(2);
  });

  it("turns a tap into drawing coordinates; drags and two fingers are not taps", async () => {
    engine = make();
    const load = engine.load(jsonFile(), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    const picks: Any[] = [];
    engine.onPick((p) => picks.push(p));
    const settings: MeasurementSettings = { enabled: true, mode: "distance", points: [], snap: false, snapKinds: [], info: false, kept: [] };
    engine.setMeasurement(settings);
    viewer.canvas.dispatchEvent(pointer("pointerdown", { clientX: 400, clientY: 300 }));
    viewer.canvas.dispatchEvent(pointer("pointerup", { clientX: 402, clientY: 301 }));
    expect(picks).toHaveLength(1);
    const expected = engine.unproject(402, 301);
    expect(picks[0].point.x).toBeCloseTo(expected.x, 9);
    expect(picks[0].canvasHeight).toBe(600);

    viewer.canvas.dispatchEvent(pointer("pointerdown", { clientX: 100, clientY: 100 }));
    viewer.canvas.dispatchEvent(pointer("pointermove", { clientX: 150, clientY: 100 }));
    viewer.canvas.dispatchEvent(pointer("pointerup", { clientX: 150, clientY: 100 }));
    viewer.canvas.dispatchEvent(pointer("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 }));
    viewer.canvas.dispatchEvent(pointer("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100 }));
    viewer.canvas.dispatchEvent(pointer("pointerup", { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 100 }));
    viewer.canvas.dispatchEvent(pointer("pointerup", { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 100 }));
    expect(picks).toHaveLength(1);

    const p0 = engine.project([{ x: 50, y: 25 }])[0];
    engine.panBy(30, -10);
    const p1 = engine.project([{ x: 50, y: 25 }])[0];
    expect(p1.x - p0.x).toBeCloseTo(30, 6);
    expect(p1.y - p0.y).toBeCloseTo(-10, 6);
  });

  it("stops delayed recentring and removes its listeners when disposed", async () => {
    engine = make();
    const load = engine.load(jsonFile("dispose.dxf"), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    const picks: Any[] = [];
    engine.onPick((p) => picks.push(p));
    engine.setMeasurement({ enabled: true, mode: "distance", points: [], snap: false, snapKinds: [], info: false, kept: [] });
    const views = viewer.setViews;
    engine.dispose();
    await new Promise((r) => setTimeout(r, 1300));
    expect(viewer.setViews).toBe(views);
    viewer.canvas.dispatchEvent(pointer("pointerdown", { clientX: 1, clientY: 1 }));
    viewer.canvas.dispatchEvent(pointer("pointerup", { clientX: 1, clientY: 1 }));
    expect(picks).toHaveLength(0);
    expect(viewer.destroyed).toBe(true);
    expect(viewer.lost).toBe(true);
    expect(viewer.canvas.removed).toBe(true);
    engine.dispose(); // twice is fine
  });

  it("captures the diagnostic screenshot only when ready", async () => {
    engine = make();
    expect(() => engine.captureDiagnostics()).toThrow("CAD解析尚未完成");
    const load = engine.load(jsonFile(), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    const shot = engine.captureDiagnostics();
    expect(shot.png).toMatch(/^data:image\/png/);
    expect(shot.view.textCandidateLimit).toBe(500);
    expect(shot.view.viewKey).toBe(engine.viewKey());
  });

  it("gives the sheet and view ranges for output, and refuses to draw before a drawing is shown", async () => {
    engine = make();
    expect(engine.sheetBounds()).toBeNull();
    expect(engine.viewBounds()).toBeNull();
    await expect(engine.renderRegion({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 10, 10)).rejects.toThrow();
    const load = engine.load(jsonFile("export.dxf"), () => {});
    await until(() => viewer.pending.length === 1);
    viewer.finish();
    await load;
    expect(engine.sheetBounds()).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
    const v = engine.viewBounds()!, a = engine.screenToDrawing(0, 0), b = engine.screenToDrawing(800, 600);
    expect(v.minX).toBeCloseTo(a.x, 9);
    expect(v.maxY).toBeCloseTo(a.y, 9);
    expect(v.maxX).toBeCloseTo(b.x, 9);
    expect(v.minY).toBeCloseTo(b.y, 9);
  });
});
