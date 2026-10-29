// Output engine (005 輸出成果): draws the chosen range off screen with the engine, lays the markups on
// top with the same projection, and makes a PNG or a one-page A4 / A3 PDF plus a thumbnail.
import { paintMarks, type Mark } from "../viewer/markup";
import {
  boxBounds, buildPdf, exportFileName, pictureProjector, planOutput, smallerSize, thumbSize, type OutputPlan,
} from "./exportPlan";
import { ExportError, type ExportEngine, type ExportRequest, type ExportResult } from "./types";
import type { DrawingPoint } from "../types/drawing";

type Canvas = HTMLCanvasElement;
export type ExportDeps = {
  /** New 2D canvas (tests pass a fake). */
  createCanvas?(width: number, height: number): Canvas;
  now?(): Date;
  /** The measuring marks, painted under the markups at the picture's projection (用戶 2026-10-29：分享要保留量測). */
  paintMeasures?(ctx: CanvasRenderingContext2D, project: (pts: readonly DrawingPoint[]) => DrawingPoint[], ppu: number, scale: number): void;
};

const isTooLarge = (e: unknown) => (e as { code?: string } | null)?.code === "EXPORT_TOO_LARGE";

function newCanvas(width: number, height: number): Canvas {
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  return c;
}

function toPng(canvas: Canvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ExportError("EXPORT_FAILED", "PNG encoding failed"))), "image/png");
  });
}

/** Range → drawing bounds and picture size. */
function plan(engine: ExportEngine, request: ExportRequest): OutputPlan {
  const ppu = engine.pixelsPerUnit();
  let p: OutputPlan | null;
  if (request.range === "view" && request.format === "png") p = planOutput("view", engine.viewBounds(), ppu);
  else {
    const bounds = request.range === "box" ? (request.box ? boxBounds(request.box, (x, y) => engine.screenToDrawing(x, y)) : null)
      : request.range === "sheet" ? engine.sheetBounds() : engine.viewBounds();
    p = planOutput("paper", bounds, ppu, request.paper ?? "A4");
  }
  if (!p) throw new ExportError(engine.viewBounds() ? "EXPORT_EMPTY_RANGE" : "EXPORT_NOT_READY");
  return p;
}

/** Draw the range, smaller and smaller while the device refuses the size. */
async function render(engine: ExportEngine, p: OutputPlan): Promise<{ canvas: Canvas; widthPx: number; heightPx: number; downscaled: boolean }> {
  let size: { widthPx: number; heightPx: number } | null = { widthPx: p.widthPx, heightPx: p.heightPx }, downscaled = false;
  while (size) {
    try {
      const canvas = await engine.renderRegion(p.bounds, size.widthPx, size.heightPx);
      return { canvas, ...size, downscaled };
    } catch (e) {
      if (!isTooLarge(e)) throw e;
      size = smallerSize(size.widthPx, size.heightPx);
      downscaled = true;
    }
  }
  throw new ExportError("EXPORT_TOO_LARGE");
}

/** Output the requested range with the sheet's markups (markups are in drawing coordinates). */
export async function exportDrawing(engine: ExportEngine, request: ExportRequest, marks: readonly Mark[], deps: ExportDeps = {}): Promise<ExportResult> {
  const make = deps.createCanvas ?? newCanvas;
  const p = plan(engine, request);
  const drawn = await render(engine, p);
  const { widthPx, heightPx } = drawn;
  // Picture: the drawing, then the markups at the same projection (strokes scaled like the picture).
  const out = make(widthPx, heightPx);
  const ctx = out.getContext("2d");
  if (!ctx) throw new ExportError("EXPORT_FAILED", "2D canvas unavailable");
  ctx.drawImage(drawn.canvas, 0, 0, widthPx, heightPx);
  const scale = p.markScale * (widthPx / p.widthPx);
  const w = widthPx / scale, h = heightPx / scale, project = pictureProjector(p.bounds, w, h), ppu = w / (p.bounds.maxX - p.bounds.minX);
  deps.paintMeasures?.(ctx, project, ppu, scale);
  if (marks.length) paintMarks(ctx, marks, project, ppu, scale);
  const png = await toPng(out);
  const t = thumbSize(widthPx, heightPx), thumbCanvas = make(t.width, t.height), tctx = thumbCanvas.getContext("2d");
  if (!tctx) throw new ExportError("EXPORT_FAILED", "2D canvas unavailable");
  tctx.drawImage(out, 0, 0, t.width, t.height);
  const thumbnail = await toPng(thumbCanvas);
  const when = deps.now?.() ?? new Date();
  const dpi = Math.round(p.dpi * (widthPx / p.widthPx));
  if (request.format === "png") {
    return { blob: png, mime: "image/png", fileName: exportFileName(request.title, request.sheet, "png", when), widthPx, heightPx, dpi, downscaled: drawn.downscaled, thumbnail };
  }
  const bytes = await buildPdf(new Uint8Array(await png.arrayBuffer()), p.widthPx, p.heightPx, request.paper ?? "A4", p.landscape, request.title);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  return { blob, mime: "application/pdf", fileName: exportFileName(request.title, request.sheet, "pdf", when), widthPx, heightPx, dpi, downscaled: drawn.downscaled, thumbnail };
}
