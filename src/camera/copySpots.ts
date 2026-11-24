// 複製到另一張圖 (用戶 2026-11-24：一層樓 99 個箭頭，下一層想沿用、少數微調): the spots of a project laid on another
// drawing. Floors drawn on the same base point (0,0) line up as they are; otherwise one or two pairs of points
// (a spot → where it belongs here) move them, two pairs also turn and scale them (a PDF page of another size).
import type { DrawingPoint } from "../types/drawing";
import { basicSnap, type MeasurementGeometry, type SnapKind } from "../viewer/measurementGeometry";
import { advancedSnap } from "../viewer/engineering";
import { floorOf } from "./placeName";

/** p → (a + bi)·p + t, as complex numbers: a turn and a scale (a, b) and a move (tx, ty). */
export type SpotTransform = { a: number; b: number; tx: number; ty: number };
export const IDENTITY: SpotTransform = { a: 1, b: 0, tx: 0, ty: 0 };

export function applyTransform(t: SpotTransform, p: DrawingPoint): DrawingPoint {
  return { x: t.a * p.x - t.b * p.y + t.tx, y: t.b * p.x + t.a * p.y + t.ty };
}

/** The turn of a transform in degrees (counter-clockwise), added to each arrow's direction. */
export function transformTurn(t: SpotTransform): number {
  return (Math.atan2(t.b, t.a) * 180) / Math.PI;
}

/** One pair moves only; two pairs move, turn and scale so both land exactly. */
export function transformFromPairs(pairs: readonly { from: DrawingPoint; to: DrawingPoint }[]): SpotTransform {
  if (!pairs.length) return IDENTITY;
  if (pairs.length === 1 || Math.hypot(pairs[1].from.x - pairs[0].from.x, pairs[1].from.y - pairs[0].from.y) < 1e-9) {
    const [{ from, to }] = pairs;
    return { a: 1, b: 0, tx: to.x - from.x, ty: to.y - from.y };
  }
  const [p, q] = pairs;
  // (q.to - p.to) = z · (q.from - p.from), z = a + bi
  const fx = q.from.x - p.from.x, fy = q.from.y - p.from.y, gx = q.to.x - p.to.x, gy = q.to.y - p.to.y, d = fx * fx + fy * fy;
  const a = (gx * fx + gy * fy) / d, b = (gy * fx - gx * fy) / d;
  return { a, b, tx: p.to.x - (a * p.from.x - b * p.from.y), ty: p.to.y - (b * p.from.x + a * p.from.y) };
}

/**
 * 施工位置 on the new drawing: the room found there (客變 may have renamed it); without one, the old name with the old
 * floor turned into the new one ("8F 主臥" → "9F 主臥").
 */
export function copiedPlace(found: string, oldPlace: string, oldDrawing: string, newDrawing: string): string {
  const fromFloor = floorOf(oldDrawing), toFloor = floorOf(newDrawing);
  const room = (place: string, floor: string) => (floor ? place.split(floor).join("") : place).replace(/-?[A-Z] 戶/, "").trim();
  const foundRoom = found ? room(found, toFloor) : "", oldRoom = room(oldPlace, fromFloor);
  // the room found is only part of the old name (臥 of 臥室1): the old name is the better one
  const partOfOld = !!foundRoom && !!oldRoom && oldRoom !== foundRoom && oldRoom.includes(foundRoom);
  if (foundRoom && !partOfOld) return found;
  if (fromFloor && toFloor && oldPlace.includes(fromFloor)) return oldPlace.split(fromFloor).join(toFloor);
  return oldPlace || found;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Where copied spots start: as they are when most of them fall on the new drawing (the same base point); otherwise
 * fitted into it, centred at 80 % of its size (a CAD project onto a PDF page, in other units), to be lined up from there.
 */
export function startTransform(points: readonly DrawingPoint[], target: Box | null): SpotTransform {
  if (!points.length || !target || !(target.maxX > target.minX) || !(target.maxY > target.minY)) return IDENTITY;
  const inside = points.filter((p) => p.x >= target.minX && p.x <= target.maxX && p.y >= target.minY && p.y <= target.maxY).length;
  if (inside >= points.length / 2) return IDENTITY;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const lo = { x: Math.min(...xs), y: Math.min(...ys) }, hi = { x: Math.max(...xs), y: Math.max(...ys) };
  const w = Math.max(hi.x - lo.x, 1e-9), h = Math.max(hi.y - lo.y, 1e-9);
  const k = 0.8 * Math.min((target.maxX - target.minX) / w, (target.maxY - target.minY) / h);
  const cx = (lo.x + hi.x) / 2, cy = (lo.y + hi.y) / 2, tx = (target.minX + target.maxX) / 2, ty = (target.minY + target.maxY) / 2;
  return { a: k, b: 0, tx: tx - k * cx, ty: ty - k * cy };
}

/** First `first`, then `then`. */
export function composeTransform(first: SpotTransform, then: SpotTransform): SpotTransform {
  const o = applyTransform(then, { x: first.tx, y: first.ty });
  return { a: then.a * first.a - then.b * first.b, b: then.a * first.b + then.b * first.a, tx: o.x, ty: o.y };
}

const ALIGN_KINDS: SnapKind[] = ["endpoint", "intersection", "center", "midpoint"];

/** A tap while lining up, pulled onto a corner, crossing or centre nearby (as when measuring). */
export function alignSnap(index: MeasurementGeometry | null, at: DrawingPoint, tolerance: number): DrawingPoint & { kind: SnapKind | null } {
  if (!index || !(tolerance > 0)) return { ...at, kind: null };
  const s = basicSnap(index.snaps, at, tolerance, ALIGN_KINDS)
    ?? advancedSnap(index.entities.filter((e) => !e.propertiesOnly), at, tolerance);
  return s ? { x: s.x, y: s.y, kind: s.kind } : { ...at, kind: null };
}
