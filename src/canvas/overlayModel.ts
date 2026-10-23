// What the measuring overlay draws, in canvas CSS pixels (T15 2.2). Pure, so it can be tested
// without a browser; MeasureOverlay turns it into SVG.
import type { DrawingBounds, DrawingPoint } from "../types/drawing";
import type { MeasurableEntity, MeasurementSettings, SnapKind } from "../viewer/measurementGeometry";
import { segmentLabels } from "../viewer/measureResults";

export const LABEL_MIN_PX = 14;
export const LABEL_MAX_PX = 400;
/** Gap around a search hit (px). */
export const SEARCH_PAD_PX = 6;

export type OverlayLabel = { x: number; y: number; text: string; size: number; stroke: number };
export type OverlayShape = { points: DrawingPoint[]; closed: boolean; labels: OverlayLabel[]; dots: DrawingPoint[] };
export type OverlayModel = {
  current: OverlayShape | null;
  kept: OverlayShape[];
  /** Outline of the picked object (object / info mode). */
  outline: DrawingPoint[] | null;
};

type Project = (points: readonly DrawingPoint[]) => DrawingPoint[];

/** Label size: measurement label height (drawing units) × px per unit, kept within 14–400 px; 14 px without a height. */
export function labelSize(labelHeight: number | null, pixelsPerUnit: number): number {
  if (!(labelHeight && labelHeight > 0) || !(pixelsPerUnit > 0) || !Number.isFinite(labelHeight * pixelsPerUnit)) return LABEL_MIN_PX;
  return Math.min(LABEL_MAX_PX, Math.max(LABEL_MIN_PX, labelHeight * pixelsPerUnit));
}

function shape(mode: MeasurementSettings["mode"], points: readonly DrawingPoint[], project: Project, size: number, label: (length: number) => string): OverlayShape {
  const closed = mode === "area" && points.length >= 3;
  const screen = project(points);
  const labels: OverlayLabel[] = mode === "angle" ? [] : segmentLabels(points, closed).map(({ at, length }) => {
    const [p] = project([at]);
    return { x: p.x, y: p.y - size * 0.35, text: label(length), size, stroke: Math.max(2, size / 5) };
  });
  return { points: screen, closed, labels, dots: screen };
}

export function overlayModel(args: {
  settings: MeasurementSettings;
  entity: MeasurableEntity | null;
  project: Project;
  labelPx: number;
  /** Text of a length label (number and unit, or the number alone for drawing units). */
  label(length: number): string;
}): OverlayModel {
  const { settings: s, entity, project, labelPx, label } = args;
  if (!s.enabled) return { current: null, kept: [], outline: null };
  const objectMode = s.info || s.mode === "object";
  const outline = objectMode && entity && entity.points.length ? project(entity.points) : null;
  if (s.info) return { current: null, kept: [], outline };
  const kept = s.kept.map((k) => shape(k.mode, k.points, project, labelPx, label));
  const current = !objectMode && s.points.length ? shape(s.mode, s.points, project, labelPx, label) : null;
  return { current, kept, outline };
}

/** Search box on the canvas: the projected hit bounds grown by 6 px. */
export function searchBox(bounds: DrawingBounds, project: Project): { left: number; top: number; width: number; height: number } {
  // The view is never rotated: two opposite corners give the screen rectangle.
  const [p, q] = project([{ x: bounds.minX, y: bounds.maxY }, { x: bounds.maxX, y: bounds.minY }]);
  const left = Math.min(p.x, q.x) - SEARCH_PAD_PX, top = Math.min(p.y, q.y) - SEARCH_PAD_PX;
  return { left, top, width: Math.abs(q.x - p.x) + 2 * SEARCH_PAD_PX, height: Math.abs(q.y - p.y) + 2 * SEARCH_PAD_PX };
}

/** Snap marker names (T15 2.2-7). */
export const SNAP_MARK_NAMES: Record<SnapKind, string> = {
  endpoint: "端點", midpoint: "中點", center: "圓心", quadrant: "四分點", intersection: "交點", perpendicular: "垂足",
};

/** SVG path of a snap marker centred on (x, y), radius 9 px. */
export function snapMarkPath(kind: SnapKind, x: number, y: number, r = 9): string {
  const f = (n: number) => n.toFixed(1);
  switch (kind) {
    case "endpoint": return `M${f(x - r)} ${f(y - r)}H${f(x + r)}V${f(y + r)}H${f(x - r)}Z`;
    case "midpoint": return `M${f(x)} ${f(y - r)}L${f(x + r)} ${f(y + 0.8 * r)}L${f(x - r)} ${f(y + 0.8 * r)}Z`;
    case "center": return `M${f(x - r)} ${f(y)}A${r} ${r} 0 1 0 ${f(x + r)} ${f(y)}A${r} ${r} 0 1 0 ${f(x - r)} ${f(y)}Z`;
    case "quadrant": return `M${f(x)} ${f(y - r)}L${f(x + r)} ${f(y)}L${f(x)} ${f(y + r)}L${f(x - r)} ${f(y)}Z`;
    case "intersection": return `M${f(x - r)} ${f(y - r)}L${f(x + r)} ${f(y + r)}M${f(x + r)} ${f(y - r)}L${f(x - r)} ${f(y + r)}`;
    case "perpendicular": return `M${f(x - r)} ${f(y + r)}H${f(x + r)}M${f(x)} ${f(y + r)}V${f(y - r)}`;
  }
}
