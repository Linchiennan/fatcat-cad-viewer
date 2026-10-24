// Values shown while measuring: per-segment lengths placed on the drawing, horizontal / vertical
// components of a distance, and finished results kept for continuous measuring.
import { measuredAngle, pathLength, polygonArea, type KeptMeasurement, type SnapPoint } from "./measurementGeometry";
import type { DrawingPoint } from "./savedView";

export type SnapKind = SnapPoint["kind"];
export const SNAP_KINDS: { kind: SnapKind; label: string }[] = [
  { kind: "endpoint", label: "端點" },
  { kind: "midpoint", label: "中點" },
  { kind: "center", label: "圓心" },
  { kind: "quadrant", label: "四分點" },
  { kind: "intersection", label: "交點" },
  { kind: "perpendicular", label: "垂足" },
];

/** A finished measurement kept on screen while the next one is taken. */
export type MeasureResult = KeptMeasurement;

/** Segment lengths with the point where each label goes (midpoint); the area closes its outline. */
export function segmentLabels(points: readonly DrawingPoint[], closed: boolean): { at: DrawingPoint; length: number }[] {
  const segs: { at: DrawingPoint; length: number }[] = [];
  const n = points.length, last = closed && n >= 3 ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > 0) segs.push({ at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, length });
  }
  return segs;
}

/** Horizontal and vertical parts of a two-point distance (absolute values). */
export function distanceParts(points: readonly DrawingPoint[]): { dx: number; dy: number } | null {
  if (points.length < 2) return null;
  const [a, b] = points;
  return { dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y) };
}

/** The number a result stands for: length, area or angle in degrees; null while incomplete. */
export function resultValue(r: MeasureResult): number | null {
  if (r.mode === "object") return r.object?.length ?? null;
  if (r.mode === "distance") return r.points.length >= 2 ? pathLength(r.points.slice(0, 2)) : null;
  if (r.mode === "path") return r.points.length >= 2 ? pathLength(r.points) : null;
  if (r.mode === "area") return r.points.length >= 3 ? polygonArea(r.points) : null;
  return r.points.length >= 3 ? measuredAngle(r.points) : null;
}

/** Whether the current points make a result that can be kept. */
export const isComplete = (r: MeasureResult) => resultValue(r) !== null;

/** Sum of kept lengths (distances and total-length paths), for continuous measuring. */
export function lengthTotal(results: readonly MeasureResult[]): number {
  return results.reduce((s, r) => s + (r.mode === "distance" || r.mode === "path" ? resultValue(r) ?? 0 : 0), 0);
}

/**
 * Height in drawing units for measurement labels, so they sit on the drawing like its own text and
 * grow and shrink with zoom: the most common text height on the sheet, else the dimension text
 * height in the header ($DIMTXT × $DIMSCALE, often left at its 2.5 default); null when neither exists.
 */
export function labelHeight(header: Record<string, unknown> | undefined, textHeights: readonly number[], dimTextHeights: readonly number[] = []): number | null {
  // A measurement reads like a dimension: match the drawn height of the drawing's dimension numbers
  // (A03: style says 0.18, each dimension overrides it, "100" is drawn far larger).
  const dims = dimTextHeights.filter((h) => h > 0 && Number.isFinite(h)).sort((a, b) => a - b);
  if (dims.length) return dims[Math.floor(dims.length / 2)];
  const hs = textHeights.filter((h) => h > 0 && Number.isFinite(h));
  if (hs.length) {
    const counts = new Map<number, number>();
    for (const h of hs) { const k = Number(h.toPrecision(3)); counts.set(k, (counts.get(k) ?? 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  }
  const txt = Number(header?.$DIMTXT), scale = Number(header?.$DIMSCALE);
  return txt > 0 && Number.isFinite(txt) ? txt * (scale > 0 && Number.isFinite(scale) ? scale : 1) : null;
}
