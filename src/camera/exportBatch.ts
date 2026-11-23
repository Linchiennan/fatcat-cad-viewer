// Export a batch (spec 009 定案 1/8/9/10) as one ZIP laid out like the user's 請款 folders:
//   對位圖/<圖名>.pdf, 對位圖/<圖名>-標記.dxf
//   照片/<編號>.jpg                (whiteboard drawn on, JPEG 0.85, original resolution)
//   照片/原圖/<編號>.jpg           (optional: the originals as taken)
//   照片保存卡/<批次名>.docx, .pdf
// Unplaced photos are left out (the panel warns first).
import { strToU8, zip, type Zippable } from "fflate";
import { readPhotoOriginal } from "./batchStore";
import { buildCardDocx } from "./cardDocx";
import { buildCardPdf } from "./cardPdf";
import { composePhoto } from "./composePhoto";
import { dxfRadius, markerDxf } from "./alignment";
import { arrowBlockLisp } from "./blockLisp";
import { cardLabel, cardOrder, markerText, photoLabels, plainLabel, rocDateLong } from "./numbering";
import type { CardEntry } from "./photoCard";
import type { CameraBatch, PhotoRecord, ShotPoint, Signer } from "./types";
import { boardTitle } from "./whiteboard";
import { canvasHeader, linkSheetToPhotos, type PhotoPage, type SheetMark } from "./sheetLinks";

/** What goes into the ZIP (用戶 2026-11-22：匯出的資料要能勾選). */
export type ExportParts = { sheetMono: boolean; sheetPdf: boolean; markerDxf: boolean; photos: boolean; originals: boolean; cardDocx: boolean; cardPdf: boolean; arrowLisp: boolean };
// all ticked by default (用戶 2026-11-23：對位圖黑白為預設；「右邊這幾樣預設打勾」= 彩色對位圖、LISP、原圖、保存卡 PDF)
export const ALL_PARTS: ExportParts = { sheetMono: true, sheetPdf: true, markerDxf: true, photos: true, originals: true, cardDocx: true, cardPdf: true, arrowLisp: true };

export type ExportInput = {
  batch: CameraBatch;
  points: readonly ShotPoint[];
  photos: readonly PhotoRecord[];
  signers: readonly Signer[];
  /** the sheet on white paper with the photo points painted on (PDF), 彩色 and 黑白; null when not wanted or not made */
  sheetPdf: Blob | null;
  sheetMonoPdf?: Blob | null;
  /** sheet width in drawing units (sizes the DXF circles) */
  sheetWidth: number;
  /** where the spots are on the sheet picture: the 對位圖 gets its photo pages and the arrows link to them (用戶 2026-11-24 選 A) */
  sheetMarks?: readonly SheetMark[];
  parts: ExportParts;
  onProgress?(done: number, total: number): void;
  now?: Date;
};

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "照片";

/** One ZIP of everything (「一鍵壓縮打包」). */
export async function exportBatch(input: ExportInput): Promise<{ blob: Blob; fileName: string }> {
  const { files, base, done } = await collectFiles(input);
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, (err, out) => (err ? reject(err) : resolve(out))));
  done();
  return { blob: new Blob([data as BlobPart], { type: "application/zip" }), fileName: `${base}.zip` };
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // DXF and LISP are text: as text/plain the phone's share sheet takes them
  dxf: "text/plain", lsp: "text/plain",
};

/** The file name of a ZIP path when the files go out one by one: its own name, or with its folder when that name is taken. */
export function looseNames(paths: readonly string[]): string[] {
  const last = paths.map((p) => p.split("/").pop()!);
  const count = new Map<string, number>();
  for (const n of last) count.set(n, (count.get(n) ?? 0) + 1);
  return paths.map((p, i) => {
    if (count.get(last[i]) === 1) return last[i];
    const parts = p.split("/");
    return parts.length > 2 ? `${parts.at(-2)}-${last[i]}` : `${parts[0]}-${last[i]}`;
  });
}

/** The files without one big ZIP (用戶 2026-11-22：匯出時可不包 ZIP), for sharing or saving one by one — except the photos
 * (with board) and originals: those go in one ZIP of their own, 照片/… inside (用戶 2026-11-23：「照片(含白板)跟原圖(沒白板)
 * 改成一大個壓縮檔，不要一張一張存」). */
export async function exportBatchFiles(input: ExportInput): Promise<{ fileName: string; blob: Blob; mime: string }[]> {
  const { files: all, base, done } = await collectFiles(input);
  const files: Zippable = {}, pictures: Zippable = {};
  for (const [p, v] of Object.entries(all)) (p.startsWith("照片/") ? pictures : files)[p] = v;
  const paths = Object.keys(files), names = looseNames(paths);
  const out: { fileName: string; blob: Blob; mime: string }[] = [];
  if (Object.keys(pictures).length) {
    const data = await new Promise<Uint8Array>((resolve, reject) => zip(pictures, (err, z) => (err ? reject(err) : resolve(z))));
    out.push({ fileName: `${base}-照片.zip`, blob: new Blob([data as BlobPart], { type: "application/zip" }), mime: "application/zip" });
  }
  done();
  return out.concat(paths.map((p, i) => {
    const v = files[p] as Uint8Array | [Uint8Array, unknown];
    const data = Array.isArray(v) ? v[0] : v, mime = MIME[p.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
    return { fileName: names[i], blob: new Blob([data as BlobPart], { type: mime }), mime };
  }));
}

async function collectFiles(input: ExportInput): Promise<{ files: Zippable; base: string; done(): void }> {
  const { batch, points, photos } = input;
  const labels = photoLabels(points, photos);
  const placed = cardOrder(points, photos);
  const title = boardTitle(batch.project, batch.trade);
  const files: Zippable = {};
  const composed = new Map<string, Blob>(), bytes = new Map<string, Uint8Array>();
  const { parts } = input;
  const linking = (parts.sheetMono || parts.sheetPdf) && !!input.sheetMarks?.length;
  const needComposed = parts.photos || parts.cardDocx || parts.cardPdf || linking;
  const total = placed.length + 2;
  for (let i = 0; i < placed.length; i++) {
    const ph = placed[i], l = labels.get(ph.id)!;
    const original = await readPhotoOriginal(ph.id);
    const signer = ph.board.signerId ? input.signers.find((s) => s.id === ph.board.signerId) ?? null : null;
    if (needComposed) {
      const jpg = await composePhoto(original, ph.board, { title, no: cardLabel(l) }, signer);
      const data = new Uint8Array(await jpg.arrayBuffer());
      composed.set(ph.id, jpg); bytes.set(ph.id, data);
      if (parts.photos) files[`照片/${plainLabel(l)}.jpg`] = [data, { level: 0 }];
    }
    if (parts.originals) files[`照片/原圖/${plainLabel(l)}.jpg`] = [new Uint8Array(await original.arrayBuffer()), { level: 0 }];
    input.onProgress?.(i + 1, total);
  }
  const heading = { company: batch.company, project: batch.project, date: batch.cardDate.trim() || rocDateLong(input.now ?? new Date()) };
  const entries: CardEntry[] = placed.map((ph) => ({
    label: cardLabel(labels.get(ph.id)!), description: [ph.board.item, ph.board.place].filter(Boolean), photoId: ph.id, width: ph.width, height: ph.height,
  }));
  const base = safe(batch.name);
  if (parts.cardDocx) files[`照片保存卡/${base}.docx`] = [buildCardDocx(heading, entries, bytes), { level: 0 }];
  if (parts.cardPdf) files[`照片保存卡/${base}.pdf`] = [await buildCardPdf(heading, entries, composed, base), { level: 0 }];
  input.onProgress?.(placed.length + 1, total);
  // a PDF page says which page it is (用戶 2026-11-24 自查)
  const page = /^PDF p\.(\d+)$/.exec(batch.space ?? "")?.[1];
  const sheet = safe(batch.drawingName.replace(/\.[^.]+$/, "") + (page ? `-第${page}頁` : ""));
  const markerLabels = new Map(points.map((p) => [p.id, markerText(p, photos)]));
  // each 對位圖 carries the photos after it, an arrow tapped goes to its spot's photo
  const pages: PhotoPage[] = linking ? placed.flatMap((ph) => { const jpg = bytes.get(ph.id); return jpg && ph.pointId ? [{ pointId: ph.pointId, jpg, width: ph.width, height: ph.height, label: cardLabel(labels.get(ph.id)!), place: ph.board.place ?? "" }] : []; }) : [];
  const sheetFile = async (pdf: Blob) => { const raw = new Uint8Array(await pdf.arrayBuffer()); return linking ? await linkSheetToPhotos(raw, input.sheetMarks!, pages, canvasHeader).catch(() => raw) : raw; };
  if (parts.sheetMono && input.sheetMonoPdf) files[`對位圖/${sheet}-黑白.pdf`] = [await sheetFile(input.sheetMonoPdf), { level: 0 }];
  if (parts.sheetPdf && input.sheetPdf) files[`對位圖/${sheet}-彩色.pdf`] = [await sheetFile(input.sheetPdf), { level: 0 }];
  if (parts.arrowLisp) files[`對位圖/${sheet}-插入對位箭頭.lsp`] = [strToU8(arrowBlockLisp(points, markerLabels, { scale: batch.markerScale ?? 1, title: batch.name })), { level: 0 }];
  if (parts.markerDxf) files[`對位圖/${sheet}-標記.dxf`] = strToU8(markerDxf(points, markerLabels, dxfRadius(input.sheetWidth, batch.markerScale ?? 1)));
  return { files, base, done: () => input.onProgress?.(total, total) };
}
