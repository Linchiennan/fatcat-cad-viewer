// Tap resolution while measuring (T16 3.1, T14 4.9-4): tolerance, visible layers, snap order.
// The engine can use it for its onPick / onPreview; the canvas uses it to place the snap marker.
import { advancedSnap } from "../viewer/engineering";
import { basicSnap, nearestEntity, type MeasurableEntity, type MeasurementGeometry, type MeasurementSettings, type SnapPoint } from "../viewer/measurementGeometry";
import type { DrawingPoint } from "../types/drawing";

/** Snap / pick tolerance in screen pixels. */
export const PICK_TOLERANCE_PX = 18;

/** 18 px in drawing units: 18 × visible camera width ÷ canvas CSS width (equivalently 18 ÷ px per unit). */
export const toleranceFor = (pixelsPerUnit: number) => (pixelsPerUnit > 0 && Number.isFinite(pixelsPerUnit) ? PICK_TOLERANCE_PX / pixelsPerUnit : 0);

export type ResolvedPick = { point: DrawingPoint; snap: SnapPoint | null; entity: MeasurableEntity | null };

/** Only objects and snaps on layers shown right now (layers without a name in `hidden` count as shown). */
function visible<T extends { layer?: string }>(items: readonly T[], hidden: ReadonlySet<string>): readonly T[] {
  return hidden.size ? items.filter((x) => x.layer === undefined || !hidden.has(x.layer)) : items;
}

/**
 * Resolve a tap at `point` (drawing units): object / info mode → nearest object, no snap; snapping on →
 * basic snaps first, advanced (perpendicular from the previous point, intersection) only when none.
 */
export function resolveMeasurePick(index: MeasurementGeometry | null, settings: MeasurementSettings, point: DrawingPoint, tolerance: number,
  hiddenLayers: ReadonlySet<string> = new Set()): ResolvedPick | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !(tolerance >= 0) || !Number.isFinite(tolerance)) return null;
  const entities = index ? visible(index.entities, hiddenLayers) : [];
  if (settings.info || settings.mode === "object") return { point, snap: null, entity: nearestEntity(entities, point, tolerance) };
  if (!settings.snap || !index) return { point, snap: null, entity: null };
  const kinds = settings.snapKinds;
  let snap = basicSnap(visible(index.snaps, hiddenLayers), point, tolerance, kinds);
  if (!snap) {
    // Perpendicular foot from the previous point of this measurement.
    const anchor = settings.points.length ? settings.points[settings.points.length - 1] : undefined;
    const near = entities.filter((e) => !e.propertiesOnly);
    snap = advancedSnap(near as MeasurableEntity[], point, tolerance, anchor);
    if (snap && kinds.length && !kinds.includes(snap.kind)) snap = null;
  }
  return snap ? { point: { x: snap.x, y: snap.y }, snap, entity: null } : { point, snap: null, entity: null };
}
