// 照片保存卡 as PDF (spec 009 定案 8): each page drawn on a canvas with the same layout as the .docx (phones have no
// Word to convert it), then put into an A4 PDF with pdf-lib. Text uses 標楷體 when the device has it, else the
// bundled font; the layout does not change.
import { PDFDocument } from "pdf-lib";
import { A4, CARD, CARD_TITLE, infoLine, pages, photoCell, type CardEntry, type CardHeading } from "./photoCard";

const FONT = '"DFKai-SB", "標楷體", "BiauKai", "FatCat Sans", serif';
const PX_PER_PT = 2; // 144 dpi pages: sharp text, photos still small

async function drawPage(heading: CardHeading, page: readonly CardEntry[], photos: ReadonlyMap<string, Blob>): Promise<Blob> {
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
  ctx.font = `${CARD.textPt}px ${FONT}`; ctx.fillText(infoLine(heading), CARD.left - 7, CARD.infoTop);
  for (let i = 0; i < page.length; i++) {
    const e = page[i], top = CARD.boxTops[i];
    const cell = photoCell(top);
    const blob = photos.get(e.photoId);
    if (blob) { const bmp = await createImageBitmap(blob); ctx.drawImage(bmp, cell.x, cell.y, cell.w, cell.h); bmp.close(); }
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
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("page encoding failed"))), "image/jpeg", 0.85));
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
    const jpg = await pdf.embedJpg(new Uint8Array(await (await drawPage(heading, page, photos)).arrayBuffer()));
    const p = pdf.addPage([A4.w, A4.h]);
    p.drawImage(jpg, { x: 0, y: 0, width: A4.w, height: A4.h });
  }
  return pdf.save();
}
