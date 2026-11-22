// Photo numbering (spec 009 定案 4), as in the user's 請款 folders:
// - points are numbered 1, 2, … in a batch, without gaps;
// - one photo at a point is "N", several are "N-1", "N-2", … and the drawing says "Nx2";
// - 照片保存卡 shows two digits ("01", "01-1"); file names do not ("1.jpg", "1-1.jpg").
import type { PhotoRecord, ShotPoint } from "./types";

/** Points sorted by number. */
export const byNumber = (points: readonly ShotPoint[]): ShotPoint[] => [...points].sort((a, b) => a.no - b.no);

/** Number for a new point: one after the last. */
export const nextNumber = (points: readonly ShotPoint[]): number => points.reduce((m, p) => Math.max(m, p.no), 0) + 1;

/** After deleting a point, later points move up so there is no gap. Returns the points whose number changed. */
export function closeGap(points: readonly ShotPoint[], removedNo: number): ShotPoint[] {
  return points.filter((p) => p.no > removedNo).map((p) => ({ ...p, no: p.no - 1 }));
}

/**
 * Give a point another number: it moves to that place and the points in between shift by one, so numbers stay
 * 1..n without repeats. Returns every point whose number changed (the moved one included).
 */
export function moveToNumber(points: readonly ShotPoint[], id: string, target: number): ShotPoint[] {
  const list = byNumber(points);
  const from = list.findIndex((p) => p.id === id);
  if (from < 0) return [];
  const to = Math.min(Math.max(1, Math.round(target)), list.length) - 1;
  if (to === from) return [];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list.map((p, i) => ({ ...p, no: i + 1 })).filter((p, i) => points.find((q) => q.id === p.id)!.no !== i + 1);
}

/** Photos of one point in shooting order. */
export function photosOf(photos: readonly PhotoRecord[], pointId: string): PhotoRecord[] {
  return photos.filter((p) => p.pointId === pointId).sort((a, b) => a.takenAt - b.takenAt || a.id.localeCompare(b.id));
}

/** The number of every placed photo: "N" when alone at its point, else "N-k". Unplaced photos get none. */
export function photoLabels(points: readonly ShotPoint[], photos: readonly PhotoRecord[]): Map<string, { no: number; seq: number | null }> {
  const out = new Map<string, { no: number; seq: number | null }>();
  for (const point of points) {
    const list = photosOf(photos, point.id);
    list.forEach((p, i) => out.set(p.id, { no: point.no, seq: list.length > 1 ? i + 1 : null }));
  }
  return out;
}

/** "1-1" / "12" (file names). */
export const plainLabel = (l: { no: number; seq: number | null }): string => (l.seq ? `${l.no}-${l.seq}` : `${l.no}`);

/** "01-1" / "12" as on the 照片保存卡 (two-digit point number). */
export const cardLabel = (l: { no: number; seq: number | null }): string => {
  const n = String(l.no).padStart(2, "0");
  return l.seq ? `${n}-${l.seq}` : n;
};

/** Text inside the circle on the drawing: "21" or "21x2". */
export function markerText(point: ShotPoint, photos: readonly PhotoRecord[]): string {
  const n = photos.filter((p) => p.pointId === point.id).length;
  return n > 1 ? `${point.no}x${n}` : `${point.no}`;
}

/** Placed photos in card order (by number, then shot order). */
export function cardOrder(points: readonly ShotPoint[], photos: readonly PhotoRecord[]): PhotoRecord[] {
  return byNumber(points).flatMap((p) => photosOf(photos, p.id));
}

/** ROC date as on the whiteboard: 2020-10-15 → "109.10.15". */
export function rocDate(when: Date): string {
  return `${when.getFullYear() - 1911}.${String(when.getMonth() + 1).padStart(2, "0")}.${String(when.getDate()).padStart(2, "0")}`;
}

/** ROC date as on the 照片保存卡 heading: "109 年 10 月 21 日". */
export function rocDateLong(when: Date): string {
  return `${when.getFullYear() - 1911} 年 ${when.getMonth() + 1} 月 ${when.getDate()} 日`;
}

/** Arrow directions snap to 45° unless the user holds (定案 6/7). */
export function snapAngle(degrees: number, free = false): number {
  const a = ((degrees % 360) + 360) % 360;
  return free ? a : (Math.round(a / 45) * 45) % 360;
}
