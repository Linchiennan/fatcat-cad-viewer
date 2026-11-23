// 對位圖 of a PDF base (用戶 2026-11-23：「底圖如果用PDF呢?」→ 選 B 支援 PDF). The spots are in page points of the page
// as shown, y up from its bottom left (pdf/PdfViewer.tsx). 彩色 keeps the original page (its own size and vector
// lines) and lays the spots over it at the export dpi; 黑白 is the page drawn at the export dpi in grey with the spots
// in their own red on top ("只保留箭頭原色", the same rule as a CAD sheet).
import type { ExportRequest } from "../export/types";

/** Same signature as the CAD sheet's paint (export/types.ts exportWithOverlay). */
export type SheetPaint = (ctx: CanvasRenderingContext2D, project: (pts: readonly { x: number; y: number }[]) => { x: number; y: number }[],
  ppu: number, scale: number, sheetWidth: number) => void;

/** Largest picture drawn for one page: a big sheet at 300 dpi would not fit a phone's memory. */
const MAX_SIDE = 12000, MAX_PIXELS = 48e6;

/** Pixels per page point for `dpi`, lowered so the picture stays within MAX_SIDE / MAX_PIXELS. */
export function pageRasterScale(width: number, height: number, dpi: number, maxPixels = MAX_PIXELS): number {
  let k = dpi / 72;
  k = Math.min(k, MAX_SIDE / Math.max(width, height, 1));
  k = Math.min(k, Math.sqrt(maxPixels / Math.max(width * height, 1)));
  return k;
}

/** Grey by luminance, in place (the spots are painted after, in colour). */
export function toGrey(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

const toPng = (c: HTMLCanvasElement) => new Promise<Uint8Array>((resolve, reject) => c.toBlob((b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x)), reject) : reject(new Error("png"))), "image/png"));

/**
 * One PDF page with the spots, as a one-page PDF. `page` is 1-based. Returns the page width in points as the sheet
 * width, which sizes the markers as on screen.
 */
/** `maxPixels`: lower on an iPhone / iPad, whose canvas stops at about 16 MP. */
export async function exportPdfPage(file: File, page: number, paint: SheetPaint, mode: ExportRequest["whitePaper"], dpi: number, maxPixels = MAX_PIXELS): Promise<{ blob: Blob; sheetWidth: number; dpi: number; downscaled: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { loadPdfJs, runtimeUrl } = await import("../pdf/PdfViewer");
  const pdfjs = await loadPdfJs();
  const loading = pdfjs.getDocument({
    data: bytes.slice(), cMapUrl: runtimeUrl("cmaps/"), cMapPacked: true, standardFontDataUrl: runtimeUrl("standard_fonts/"),
    wasmUrl: runtimeUrl("wasm/"), iccUrl: runtimeUrl("iccs/"), enableXfa: false,
  });
  const doc = await loading.promise;
  try {
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const W = base.width, H = base.height, k = pageRasterScale(W, H, dpi, maxPixels);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
    const g = c.getContext("2d");
    if (!g) throw new Error("canvas");
    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    // the original page kept as it is, the spots laid over it: only for an upright page (a turned page's own
    // coordinates run another way; it is drawn whole like 黑白 instead)
    const keep = mode === "color" && !(((p.rotate ?? 0) % 360));
    if (!keep) {
      await p.render({ canvas: c, viewport: p.getViewport({ scale: k }), background: "#ffffff" }).promise;
      if (mode === "mono") { const img = g.getImageData(0, 0, c.width, c.height); toGrey(img.data); g.putImageData(img, 0, 0); }
    }
    // picture units are CSS px (96 per inch), as for a CAD sheet; `scale` turns them into canvas pixels
    const unit = 96 / 72, scale = k / unit;
    paint(g, (pts) => pts.map((q) => ({ x: q.x * unit, y: (H - q.y) * unit })), unit, scale, W);
    const png = await out.embedPng(await toPng(c));
    if (keep) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const [copied] = await out.copyPages(src, [page - 1]);
      out.addPage(copied);
      const box = copied.getCropBox();
      copied.drawImage(png, { x: box.x, y: box.y, width: box.width, height: box.height });
    } else {
      out.addPage([W, H]).drawImage(png, { x: 0, y: 0, width: W, height: H });
    }
    const saved = await out.save();
    return { blob: new Blob([saved.slice().buffer], { type: "application/pdf" }), sheetWidth: W, dpi, downscaled: k < dpi / 72 - 1e-9 };
  } finally {
    void loading.destroy().catch(() => {});
  }
}

/** A run of text in page points (y up): start and end along x, baseline y, height. */
type Run = { text: string; x0: number; x1: number; y: number; h: number; level: boolean };

/**
 * Join runs on one line that touch (a PDF made from CAD often writes 主臥 as 主 and 臥 apart), then give each piece's
 * middle. Only level text is joined.
 */
export function joinRuns(runs: readonly Run[]): { text: string; x: number; y: number }[] {
  const level = runs.filter((r) => r.level).sort((p, q) => (Math.abs(p.y - q.y) > Math.max(p.h, q.h) * 0.4 ? q.y - p.y : p.x0 - q.x0));
  const joined: Run[] = [];
  for (const r of level) {
    const last = joined[joined.length - 1];
    if (last && Math.abs(r.y - last.y) <= Math.max(r.h, last.h) * 0.4 && r.x0 - last.x1 <= Math.max(r.h, last.h) * 0.6) {
      joined[joined.length - 1] = { ...last, text: last.text + r.text, x1: Math.max(last.x1, r.x1), h: Math.max(last.h, r.h) };
    } else joined.push({ ...r });
  }
  return [...joined, ...runs.filter((r) => !r.level)].map((r) => ({ text: r.text, x: (r.x0 + r.x1) / 2, y: r.y + r.h / 2 }));
}

/**
 * Text on a page (for the place name: 主臥, 浴室 …) at its position in the same page points as the spots; empty for a
 * scanned page.
 */
export async function pdfPageTexts(pdfPage: { getTextContent(): Promise<{ items: unknown[] }>; getViewport(o: { scale: number }): { height: number; convertToViewportPoint(x: number, y: number): number[] } }): Promise<{ text: string; x: number; y: number }[]> {
  const vp = pdfPage.getViewport({ scale: 1 });
  const content = await pdfPage.getTextContent();
  const runs: Run[] = [];
  for (const raw of content.items) {
    const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
    const s = it.str?.trim();
    if (!s || !it.transform) continue;
    const [a, b, , , e, f] = it.transform, len = Math.hypot(a, b) || 1, w = it.width ?? 0;
    const [sx, sy] = vp.convertToViewportPoint(e, f), [ex, ey] = vp.convertToViewportPoint(e + (a / len) * w, f + (b / len) * w);
    const h = it.height || len;
    // level on the page as shown (a turned page turns its text too)
    runs.push({ text: s, x0: Math.min(sx, ex), x1: Math.max(sx, ex), y: vp.height - sy, h, level: Math.abs(ey - sy) < h * 0.2 });
  }
  return joinRuns(runs);
}
