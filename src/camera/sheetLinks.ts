// 對位圖 PDF with its photos (用戶 2026-11-24：「匯出時的PDF上的箭頭能超連結到照片嗎?」→ 選 A「同檔加照片頁」):
// after the sheet, one page per photo (with its whiteboard); tapping an arrow on the sheet goes to its spot's first
// photo, and 「← 回對位圖」 at the top of a photo page goes back. Links inside one file work on a phone and survive
// being passed on (a link to another file does not).
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, type PDFPage, type PDFRef } from "pdf-lib";

/** A spot on the sheet picture, as fractions of the picture (0,0 top left); r: the arrow's reach, of the width. */
export type SheetMark = { pointId: string; fx: number; fy: number; fr: number };
/** One photo page: the photo with its board, its card label (001, 001-2) and place. */
export type PhotoPage = { pointId: string; jpg: Uint8Array; width: number; height: number; label: string; place: string };
/** A picture of the page's top band (number, place, 回對位圖), drawn by the caller (a browser canvas). */
export type HeaderPainter = (label: string, place: string, widthPt: number, heightPt: number) => Promise<Uint8Array | null>;

/**
 * Where the last picture on a page is drawn (the sheet picture is laid on last): the `cm` steps of its own q … Do
 * block, combined (pdf-lib writes translate, rotate, scale and skew as four of them).
 */
export function lastImagePlacement(content: string): { x: number; y: number; w: number; h: number } | null {
  const end = content.lastIndexOf(" Do");
  if (end < 0) return null;
  const start = Math.max(content.lastIndexOf("q\n", end), content.lastIndexOf("q ", end), 0);
  const block = content.slice(start, end);
  let m = [1, 0, 0, 1, 0, 0];
  const re = /(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+cm/g;
  let s: RegExpExecArray | null, any = false;
  while ((s = re.exec(block))) {
    const [a, b, c, d, e, f] = s.slice(1, 7).map(Number);
    // the new step applies first, then what was set before
    m = [a * m[0] + b * m[2], a * m[1] + b * m[3], c * m[0] + d * m[2], c * m[1] + d * m[3], e * m[0] + f * m[2] + m[4], e * m[1] + f * m[3] + m[5]];
    any = true;
  }
  return any ? { x: m[4], y: m[5], w: m[0], h: m[3] } : null;
}

/** A spot's tap area on the page (PDF points, y up), from its place on the picture. */
export function markRect(mark: SheetMark, at: { x: number; y: number; w: number; h: number }): [number, number, number, number] {
  const cx = at.x + mark.fx * at.w, cy = at.y + (1 - mark.fy) * at.h, r = Math.max(mark.fr * at.w, 6);
  return [cx - r, cy - r, cx + r, cy + r];
}

/** The page's drawing instructions as text (every content stream, decoded). */
function pageContent(page: PDFPage): string {
  const node = page.node.get(PDFName.of("Contents"));
  const refs = node instanceof PDFArray ? node.asArray() : node ? [node] : [];
  let out = "";
  for (const r of refs) {
    const s = page.doc.context.lookup(r);
    if (s instanceof PDFRawStream) out += new TextDecoder("latin1").decode(decodePDFRawStream(s).decode()) + "\n";
  }
  return out;
}

const link = (doc: PDFDocument, rect: [number, number, number, number], target: PDFRef) =>
  doc.context.register(doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: rect.map((v) => PDFNumber.of(Math.round(v * 100) / 100)), Border: [0, 0, 0],
    Dest: [target, PDFName.of("Fit")],
  }));

/** Long side of a photo page in points (A4's long side). */
const PHOTO_LONG = 842;
const HEADER = 40;

/** The sheet PDF with its photo pages and the links both ways; the sheet unchanged when there is nothing to link. */
export async function linkSheetToPhotos(sheetPdf: Uint8Array, marks: readonly SheetMark[], photos: readonly PhotoPage[], header?: HeaderPainter): Promise<Uint8Array> {
  if (!photos.length) return sheetPdf;
  const doc = await PDFDocument.load(sheetPdf);
  const sheet = doc.getPage(0);
  const firstOf = new Map<string, PDFRef>();
  for (const ph of photos) {
    const landscape = ph.width >= ph.height;
    const w = landscape ? PHOTO_LONG : (PHOTO_LONG * ph.width) / ph.height, h = landscape ? (PHOTO_LONG * ph.height) / ph.width : PHOTO_LONG;
    const page = doc.addPage([w, h + HEADER]);
    page.drawImage(await doc.embedJpg(ph.jpg), { x: 0, y: 0, width: w, height: h });
    const band = header ? await header(ph.label, ph.place, w, HEADER).catch(() => null) : null;
    if (band) page.drawImage(await doc.embedPng(band), { x: 0, y: h, width: w, height: HEADER });
    // the top band's right part goes back to the sheet
    page.node.addAnnot(link(doc, [w * 0.55, h, w, h + HEADER], sheet.ref));
    if (!firstOf.has(ph.pointId)) firstOf.set(ph.pointId, page.ref);
  }
  const at = lastImagePlacement(pageContent(sheet));
  if (at) for (const m of marks) { const to = firstOf.get(m.pointId); if (to) sheet.node.addAnnot(link(doc, markRect(m, at), to)); }
  return doc.save();
}

/** The top band of a photo page, drawn on a canvas: 001　主臥 on the left, ← 回對位圖 on the right. */
export const canvasHeader: HeaderPainter = async (label, place, widthPt, heightPt) => {
  if (typeof document === "undefined") return null;
  const k = 3, c = document.createElement("canvas");
  c.width = Math.round(widthPt * k); c.height = Math.round(heightPt * k);
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1f2a33"; g.textBaseline = "middle";
  g.font = `700 ${16 * k}px "FatCat Sans", sans-serif`;
  g.fillText(`${label}${place ? "　" + place : ""}`, 12 * k, c.height / 2);
  const back = "← 回對位圖";
  g.font = `700 ${15 * k}px "FatCat Sans", sans-serif`;
  const tw = g.measureText(back).width, bx = c.width - tw - 24 * k, by = c.height * 0.15, bh = c.height * 0.7;
  g.fillStyle = "#e8f0ff"; g.fillRect(bx - 10 * k, by, tw + 20 * k, bh);
  g.strokeStyle = "#2f6fd6"; g.lineWidth = 1.5 * k; g.strokeRect(bx - 10 * k, by, tw + 20 * k, bh);
  g.fillStyle = "#2f6fd6"; g.fillText(back, bx, c.height / 2);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};
