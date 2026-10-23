import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { exportDrawing } from "./exportDrawing";
import { boxBounds, buildPdf, exportFileName, paperPoints, pictureProjector, planOutput, smallerSize, thumbSize } from "./exportPlan";
import type { ExportEngine } from "./types";
import type { DrawingBounds } from "../types/drawing";

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

/** Fake 2D canvas: records draw calls; toBlob gives a real (1×1) PNG so pdf-lib can embed it. */
function fakeCanvas(width: number, height: number) {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === "calls" ? calls : typeof k === "string" && ["save", "restore", "beginPath", "moveTo", "lineTo", "stroke", "rect", "ellipse", "fillText", "strokeText", "drawImage", "measureText"].includes(k)
      ? (...a: unknown[]) => { calls.push(`${k}:${a.filter((x) => typeof x === "number").map((x) => Math.round(x as number)).join(",")}`); return { width: 10 }; } : undefined),
    set: () => true,
  });
  return { width, height, calls, getContext: () => ctx, toBlob: (cb: (b: Blob) => void) => cb(new Blob([PNG], { type: "image/png" })) } as unknown as HTMLCanvasElement & { calls: string[] };
}

function engine(over: Partial<ExportEngine> & { refuseAbove?: number } = {}): ExportEngine & { asked: [number, number][] } {
  const asked: [number, number][] = [];
  return {
    asked,
    pixelsPerUnit: () => 2,
    viewBounds: () => ({ minX: 0, minY: 0, maxX: 400, maxY: 300 }),
    sheetBounds: () => ({ minX: -100, minY: -100, maxX: 900, maxY: 400 }),
    screenToDrawing: (x, y) => ({ x: x / 2, y: 300 - y / 2 }),
    async renderRegion(_b: DrawingBounds, w: number, h: number) {
      asked.push([w, h]);
      if (over.refuseAbove && w * h > over.refuseAbove) throw Object.assign(new Error("too large"), { code: "EXPORT_TOO_LARGE" });
      return fakeCanvas(w, h);
    },
    ...over,
  };
}

const canvases: (HTMLCanvasElement & { calls: string[] })[] = [];
const deps = { createCanvas: (w: number, h: number) => { const c = fakeCanvas(w, h); canvases.push(c); return c; }, now: () => new Date(2026, 9, 23, 14, 5) };

describe("output sizes (005 技術決定 1)", () => {
  it("view PNG is twice the screen; sheet fits A4 at 200 dpi keeping its shape", () => {
    expect(planOutput("view", { minX: 0, minY: 0, maxX: 400, maxY: 300 }, 2)).toMatchObject({ widthPx: 1600, heightPx: 1200, markScale: 2 });
    const a4 = planOutput("paper", { minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 2, "A4")!;
    expect(a4.landscape).toBe(true);
    expect(a4.widthPx).toBe(2339); // 297 mm at 200 dpi
    expect(a4.heightPx).toBe(1169);
    const a3 = planOutput("paper", { minX: 0, minY: 0, maxX: 100, maxY: 1000 }, 2, "A3")!;
    expect(a3.landscape).toBe(false);
    expect(a3.heightPx).toBe(3307); // 420 mm
    expect(planOutput("paper", { minX: 0, minY: 0, maxX: 0, maxY: 5 }, 2)).toBeNull();
  });

  it("paper points, box from screen corners, smaller retries, thumbnail and projection", () => {
    expect(paperPoints("A4", false).width).toBeCloseTo(595.28, 1);
    expect(paperPoints("A3", true).width).toBeCloseTo(1190.55, 1);
    expect(boxBounds({ x0: 200, y0: 0, x1: 0, y1: 100 }, (x, y) => ({ x: x / 2, y: 300 - y / 2 }))).toEqual({ minX: 0, minY: 250, maxX: 100, maxY: 300 });
    expect(boxBounds({ x0: 5, y0: 5, x1: 5, y1: 9 }, (x, y) => ({ x, y }))).toBeNull();
    expect(smallerSize(1000, 1000)).toEqual({ widthPx: 700, heightPx: 700 });
    expect(smallerSize(250, 250)).toBeNull();
    expect(thumbSize(2400, 1200)).toEqual({ width: 240, height: 120 });
    expect(pictureProjector({ minX: 0, minY: 0, maxX: 10, maxY: 5 }, 100, 50)([{ x: 10, y: 5 }, { x: 0, y: 0 }])).toEqual([{ x: 100, y: 0 }, { x: 0, y: 50 }]);
  });

  it("file name: 圖名_圖紙_YYYYMMDD-HHmm with bad characters replaced", () => {
    expect(exportFileName("A03--制水閥箱箱體圖.dwg", "模型", "pdf", new Date(2026, 9, 23, 9, 7))).toBe("A03--制水閥箱箱體圖_模型_20261023-0907.pdf");
    expect(exportFileName('a/b:c*?"<>|.dxf', "配置:1", "png", new Date(2026, 0, 2, 3, 4))).toBe("a_b_c_______配置_1_20260102-0304.png");
  });
});

describe("PDF (005 定案 3、4)", () => {
  it("A4 landscape page with the picture centred at 200 dpi", async () => {
    const bytes = await buildPdf(PNG, 2339, 1169, "A4", true, "T");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(595.28, 1);
    expect(doc.getTitle()).toBe("T");
  });
});

describe("exportDrawing", () => {
  it("view PNG at 2×, markups painted on top, thumbnail made", async () => {
    canvases.length = 0;
    const e = engine();
    const r = await exportDrawing(e, { range: "view", format: "png", title: "A03.dwg", sheet: "模型" },
      [{ kind: "pen", color: "#ff3b30", points: [{ x: 0, y: 0 }, { x: 400, y: 300 }] }], deps);
    expect(e.asked).toEqual([[1600, 1200]]);
    expect(r).toMatchObject({ mime: "image/png", widthPx: 1600, heightPx: 1200, downscaled: false, fileName: "A03_模型_20261023-1405.png" });
    // pen from the bottom-left corner to the top-right corner of the picture
    expect(canvases[0].calls).toContain("moveTo:0,1200");
    expect(canvases[0].calls).toContain("lineTo:1600,0");
    expect(canvases[1]).toMatchObject({ width: 240, height: 180 });
    expect(r.thumbnail.type).toBe("image/png");
  });

  it("sheet PDF on A3, downscaling when the device refuses the full size", async () => {
    const e = engine({ refuseAbove: 3_000_000 });
    const r = await exportDrawing(e, { range: "sheet", format: "pdf", paper: "A3", title: "t1", sheet: "模型" }, [], deps);
    expect(e.asked[0]).toEqual([3307, 1654]);
    expect(e.asked.length).toBeGreaterThan(1);
    expect(r.downscaled).toBe(true);
    expect(r.mime).toBe("application/pdf");
    const doc = await PDFDocument.load(await r.blob.arrayBuffer());
    expect(doc.getPage(0).getSize().width).toBeCloseTo(1190.55, 1);
  });

  it("box range uses the dragged rectangle; an empty box is an error", async () => {
    const e = engine();
    const r = await exportDrawing(e, { range: "box", format: "png", box: { x0: 0, y0: 0, x1: 200, y1: 100 }, title: "a", sheet: "b" }, [], deps);
    expect(r.widthPx / r.heightPx).toBeCloseTo(2, 2);
    await expect(exportDrawing(e, { range: "box", format: "png", box: { x0: 0, y0: 0, x1: 0, y1: 100 }, title: "a", sheet: "b" }, [], deps))
      .rejects.toMatchObject({ code: "EXPORT_EMPTY_RANGE" });
    await expect(exportDrawing(engine({ viewBounds: () => null }), { range: "view", format: "png", title: "a", sheet: "b" }, [], deps))
      .rejects.toMatchObject({ code: "EXPORT_NOT_READY" });
  });
});
