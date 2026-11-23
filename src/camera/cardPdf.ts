// 照片保存卡 as PDF (spec 009 定案 8): each page drawn on a canvas with the same layout as the .docx (phones have no
// Word to convert it), then put into an A4 PDF with pdf-lib. Text uses 標楷體 when the device has it, else the
// bundled font; the layout does not change.
import { PDFDocument } from "pdf-lib";
import { A4, CARD, CARD_TITLE, fitInCell, infoParts, pages, photoCell, type CardEntry, type CardHeading } from "./photoCard";

const FONT = '"DFKai-SB", "標楷體", "BiauKai", "FatCat Sans", serif';
// 用戶 2026-11-23：「這產出的PDF畫質很差」: the whole page used to be one 144 dpi JPEG, text included (soft, with JPEG
// smudges round the letters). Now the text and lines are a lossless 300 dpi layer and each photo goes on top as its own
// JPEG at 300 dpi of its printed size: sharp in print, and a long card stays a reasonable size.
const PX_PER_PT = 300 / 72;
const PHOTO_PX_PER_PT = 300 / 72;
const PHOTO_QUALITY = 0.9;

type Cell = { x: number; y: number; w: number; h: number };

/** The text and lines of a page (photo cells left white), as a PNG; and where each photo goes. */
async function drawPage(heading: CardHeading, page: readonly CardEntry[], photos: ReadonlyMap<string, Blob>): Promise<{ base: Blob; cells: { cell: Cell; blob: Blob }[] }> {
  const cells: { cell: Cell; blob: Blob }[] = [];
  const c = document.createElement("canvas");
  c.width = Math.round(A4.w * PX_PER_PT); c.height = Math.round(A4.h * PX_PER_PT);
  const ctx = c.getContext("2d")!;
  ctx.scale(PX_PER_PT, PX_PER_PT);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, A4.w, A4.h);
  ctx.fillStyle = "#000"; ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.font = `${CARD.companyPt}px ${FONT}`; ctx.fillText(heading.company, A4.w / 2, CARD.companyTop);
  ctx.font = `${CARD.titlePt}px ${FONT}`; ctx.fillText(CARD_TITLE, A4.w / 2, CARD.titleTop);
  ctx.textAlign = "left";
  ctx.font = `${CARD.textPt}px ${FONT}`;
  const info = infoParts(heading);
  ctx.fillText(info.project, CARD.left - 7, CARD.infoTop);
  ctx.textAlign = "right"; ctx.fillText(info.date, CARD.right, CARD.infoTop); ctx.textAlign = "left";
  for (let i = 0; i < page.length; i++) {
    const e = page[i], top = CARD.boxTops[i];
    const cell = photoCell(top);
    const blob = photos.get(e.photoId);
    if (blob) cells.push({ cell, blob });
    // label column rows and lines
    ctx.lineWidth = 0.8; ctx.strokeStyle = "#000";
    let y = top;
    const lw = CARD.labelRight - CARD.left;
    const rows = [...CARD.rows];
    const labels = ["照片編號", e.label, "施工說明"];
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `${CARD.textPt}px ${FONT}`;
    rows.forEach((h, r) => {
      ctx.fillText(labels[r], CARD.left + lw / 2, y + h / 2);
      y += h;
      ctx.beginPath(); ctx.moveTo(CARD.left, y); ctx.lineTo(CARD.labelRight, y); ctx.stroke();
    });
    ctx.textBaseline = "top";
    e.description.forEach((line, k) => wrap(ctx, line, lw - 6).forEach((part, j, all) => {
      const before = e.description.slice(0, k).reduce((n, l) => n + wrap(ctx, l, lw - 6).length, 0);
      ctx.fillText(part, CARD.left + lw / 2, y + 4 + (before + j) * (CARD.textPt + 4));
      void all;
    }));
    ctx.beginPath(); ctx.moveTo(CARD.labelRight, top); ctx.lineTo(CARD.labelRight, top + CARD.boxH); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeRect(CARD.left, top, CARD.right - CARD.left, CARD.boxH);
  }
  const base = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("page encoding failed"))), "image/png"));
  c.width = c.height = 0; // free the pixels on phones
  return { base, cells };
}

/** A photo resampled to 300 dpi of its cell (never enlarged), as JPEG, with its size. */
async function cellPhoto(blob: Blob, cell: Cell): Promise<{ jpg: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const k = Math.min(1, (cell.w * PHOTO_PX_PER_PT) / bmp.width, (cell.h * PHOTO_PX_PER_PT) / bmp.height);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("photo encoding failed"))), "image/jpeg", PHOTO_QUALITY));
    c.width = c.height = 0;
    return { jpg: out, w: bmp.width, h: bmp.height };
  } finally { bmp.close(); }
}

/** Break a description line to the label column width (CJK breaks anywhere). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (line && ctx.measureText(line + ch).width > max) { out.push(line); line = ch.trimStart(); } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

export async function buildCardPdf(heading: CardHeading, entries: readonly CardEntry[], photos: ReadonlyMap<string, Blob>, title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("大肥貓CAD看圖");
  for (const page of pages(entries)) {
    const { base, cells } = await drawPage(heading, page, photos);
    const p = pdf.addPage([A4.w, A4.h]);
    p.drawImage(await pdf.embedPng(new Uint8Array(await base.arrayBuffer())), { x: 0, y: 0, width: A4.w, height: A4.h });
    // PDF y runs upward from the bottom of the page
    for (const { cell, blob } of cells) {
      const photo = await cellPhoto(blob, cell), at = fitInCell(cell, photo.w, photo.h);
      const jpg = await pdf.embedJpg(new Uint8Array(await photo.jpg.arrayBuffer()));
      p.drawImage(jpg, { x: at.x, y: A4.h - at.y - at.h, width: at.w, height: at.h });
    }
  }
  return pdf.save();
}
