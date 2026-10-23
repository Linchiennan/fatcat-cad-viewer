// Pure parts of the output engine (005): range, picture size, paper, file name, PDF building.
import { PDFDocument } from "pdf-lib";
import type { DrawingBounds, DrawingPoint } from "../types/drawing";
import type { PaperSize, ScreenBox } from "./types";

export const OUTPUT_DPI = 200;
/** A PNG of the view is twice the screen. */
export const VIEW_SCALE = 2;
/** CSS pixels per inch: markup strokes keep their screen look at 200 dpi (scale 200 / 96). */
const CSS_DPI = 96;
export const THUMB_MAX = 240;
/** Each retry after "too large" shrinks the picture to this share; stop below the floor. */
export const DOWNSCALE_STEP = 0.7;
export const MIN_SIDE_PX = 200;

/** Paper in millimetres, portrait. */
const PAPER_MM: Record<PaperSize, [number, number]> = { A4: [210, 297], A3: [297, 420] };
const MM_PER_INCH = 25.4, PT_PER_INCH = 72;

/** Paper size in points, turned to landscape when the range is wider than tall. */
export function paperPoints(paper: PaperSize, landscape: boolean): { width: number; height: number } {
  const [w, h] = PAPER_MM[paper].map((mm) => (mm / MM_PER_INCH) * PT_PER_INCH);
  return landscape ? { width: h, height: w } : { width: w, height: h };
}

const validBounds = (b: DrawingBounds | null): b is DrawingBounds =>
  !!b && [b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) && b.maxX > b.minX && b.maxY > b.minY;

/** Drawing rectangle of a box dragged on screen (canvas px, y down). Null when it has no area. */
export function boxBounds(box: ScreenBox, toDrawing: (x: number, y: number) => DrawingPoint): DrawingBounds | null {
  const a = toDrawing(box.x0, box.y0), b = toDrawing(box.x1, box.y1);
  const r = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
  return validBounds(r) ? r : null;
}

export type OutputPlan = {
  bounds: DrawingBounds;
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Markup scale against the screen (stroke widths, text). */
  markScale: number;
  landscape: boolean;
};

/** View: twice its screen size. Sheet / box: fitted into the paper at 200 dpi, keeping its shape. */
export function planOutput(kind: "view" | "paper", bounds: DrawingBounds | null, pixelsPerUnit: number, paper: PaperSize = "A4"): OutputPlan | null {
  if (!validBounds(bounds)) return null;
  const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY, landscape = w >= h;
  if (kind === "view") {
    if (!(pixelsPerUnit > 0)) return null;
    return { bounds, widthPx: Math.max(1, Math.round(w * pixelsPerUnit * VIEW_SCALE)), heightPx: Math.max(1, Math.round(h * pixelsPerUnit * VIEW_SCALE)),
      dpi: CSS_DPI * VIEW_SCALE, markScale: VIEW_SCALE, landscape };
  }
  const page = paperPoints(paper, landscape), pagePx = { w: (page.width / PT_PER_INCH) * OUTPUT_DPI, h: (page.height / PT_PER_INCH) * OUTPUT_DPI };
  const fit = Math.min(pagePx.w / w, pagePx.h / h);
  return { bounds, widthPx: Math.max(1, Math.round(w * fit)), heightPx: Math.max(1, Math.round(h * fit)), dpi: OUTPUT_DPI, markScale: OUTPUT_DPI / CSS_DPI, landscape };
}

/** Next smaller size after a "too large" refusal, or null below the floor. */
export function smallerSize(widthPx: number, heightPx: number): { widthPx: number; heightPx: number } | null {
  const w = Math.floor(widthPx * DOWNSCALE_STEP), h = Math.floor(heightPx * DOWNSCALE_STEP);
  return Math.min(w, h) < MIN_SIDE_PX ? null : { widthPx: w, heightPx: h };
}

/** Thumbnail size: longest side 240 px (never larger than the picture). */
export function thumbSize(widthPx: number, heightPx: number): { width: number; height: number } {
  const k = Math.min(1, THUMB_MAX / Math.max(widthPx, heightPx));
  return { width: Math.max(1, Math.round(widthPx * k)), height: Math.max(1, Math.round(heightPx * k)) };
}

/** 圖名_圖紙_YYYYMMDD-HHmm.ext with characters a file system refuses replaced by "_". */
export function exportFileName(title: string, sheet: string, ext: "png" | "pdf", when = new Date()): string {
  const clean = (s: string) => s.replace(/\.[^./\\]+$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 60) || "圖面";
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}`;
  return `${clean(title)}_${clean(sheet)}_${stamp}.${ext}`;
}

/** Drawing → output pixel mapping (y up in the drawing, down in the picture). */
export function pictureProjector(bounds: DrawingBounds, widthPx: number, heightPx: number) {
  const sx = widthPx / (bounds.maxX - bounds.minX), sy = heightPx / (bounds.maxY - bounds.minY);
  return (pts: readonly DrawingPoint[]) => pts.map((p) => ({ x: (p.x - bounds.minX) * sx, y: (bounds.maxY - p.y) * sy }));
}

/** One-page PDF with the PNG centred on A4 / A3 at its 200 dpi size (shrunk only if it would not fit). */
export async function buildPdf(png: Uint8Array, widthPx: number, heightPx: number, paper: PaperSize, landscape: boolean, title = ""): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  doc.setCreator("大肥貓CAD看圖");
  const page = paperPoints(paper, landscape);
  const p = doc.addPage([page.width, page.height]);
  const image = await doc.embedPng(png);
  let w = (widthPx / OUTPUT_DPI) * PT_PER_INCH, h = (heightPx / OUTPUT_DPI) * PT_PER_INCH;
  const k = Math.min(1, page.width / w, page.height / h);
  w *= k; h *= k;
  p.drawImage(image, { x: (page.width - w) / 2, y: (page.height - h) / 2, width: w, height: h });
  return doc.save();
}
