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
import { cardLabel, cardOrder, markerText, photoLabels, plainLabel, rocDateLong } from "./numbering";
import type { CardEntry } from "./photoCard";
import type { CameraBatch, PhotoRecord, ShotPoint, Signer } from "./types";
import { boardTitle } from "./whiteboard";

export type ExportInput = {
  batch: CameraBatch;
  points: readonly ShotPoint[];
  photos: readonly PhotoRecord[];
  signers: readonly Signer[];
  /** the sheet with the photo points painted on (PDF), or null when it could not be made */
  sheetPdf: Blob | null;
  /** sheet width in drawing units (sizes the DXF circles) */
  sheetWidth: number;
  withOriginals: boolean;
  onProgress?(done: number, total: number): void;
  now?: Date;
};

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "照片";

export async function exportBatch(input: ExportInput): Promise<{ blob: Blob; fileName: string }> {
  const { batch, points, photos } = input;
  const labels = photoLabels(points, photos);
  const placed = cardOrder(points, photos);
  const title = boardTitle(batch.project, batch.trade);
  const files: Zippable = {};
  const composed = new Map<string, Blob>(), bytes = new Map<string, Uint8Array>();
  const total = placed.length + 2;
  for (let i = 0; i < placed.length; i++) {
    const ph = placed[i], l = labels.get(ph.id)!;
    const original = await readPhotoOriginal(ph.id);
    const signer = ph.board.signerId ? input.signers.find((s) => s.id === ph.board.signerId) ?? null : null;
    const jpg = await composePhoto(original, ph.board, { title, no: cardLabel(l) }, signer);
    const data = new Uint8Array(await jpg.arrayBuffer());
    composed.set(ph.id, jpg); bytes.set(ph.id, data);
    files[`照片/${plainLabel(l)}.jpg`] = [data, { level: 0 }];
    if (input.withOriginals) files[`照片/原圖/${plainLabel(l)}.jpg`] = [new Uint8Array(await original.arrayBuffer()), { level: 0 }];
    input.onProgress?.(i + 1, total);
  }
  const heading = { company: batch.company, project: batch.project, date: batch.cardDate.trim() || rocDateLong(input.now ?? new Date()) };
  const entries: CardEntry[] = placed.map((ph) => ({
    label: cardLabel(labels.get(ph.id)!), description: [ph.board.item, ph.board.place].filter(Boolean), photoId: ph.id, width: ph.width, height: ph.height,
  }));
  const base = safe(batch.name);
  files[`照片保存卡/${base}.docx`] = [buildCardDocx(heading, entries, bytes), { level: 0 }];
  files[`照片保存卡/${base}.pdf`] = [await buildCardPdf(heading, entries, composed, base), { level: 0 }];
  input.onProgress?.(placed.length + 1, total);
  const sheet = safe(batch.drawingName.replace(/\.[^.]+$/, ""));
  const markerLabels = new Map(points.map((p) => [p.id, markerText(p, photos)]));
  if (input.sheetPdf) files[`對位圖/${sheet}.pdf`] = [new Uint8Array(await input.sheetPdf.arrayBuffer()), { level: 0 }];
  files[`對位圖/${sheet}-標記.dxf`] = strToU8(markerDxf(points, markerLabels, dxfRadius(input.sheetWidth, batch.markerScale ?? 1)));
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, (err, out) => (err ? reject(err) : resolve(out))));
  input.onProgress?.(total, total);
  return { blob: new Blob([data as BlobPart], { type: "application/zip" }), fileName: `${base}.zip` };
}
