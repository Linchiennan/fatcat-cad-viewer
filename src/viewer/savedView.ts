// Saved CAD view ("原視角") registered when a DWG is converted (T13 8-5, T14 3.8).
// Owner: P4 group B. The point / bounds types are re-exported from the shared types file.
export type { DrawingPoint, DrawingBounds } from "../types/drawing";
import type { DrawingPoint } from "../types/drawing";

/** View saved in the drawing: centre (drawing units), view height (>0), optional aspect (>0) and twist (degrees, kept but not applied). */
export type SavedView = { center: DrawingPoint; viewHeight: number; aspect?: number; twist?: number };

const views = new WeakMap<File, SavedView>();

/** Valid copy of a view, or null (non-finite centre, height <= 0; a bad aspect / twist is dropped). */
export function normalizeSavedView(view: SavedView | null | undefined): SavedView | null {
  if (!view || !view.center) return null;
  const { x, y } = view.center, h = view.viewHeight;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(h) || h <= 0) return null;
  const out: SavedView = { center: { x, y }, viewHeight: h };
  if (view.aspect !== undefined && Number.isFinite(view.aspect) && view.aspect > 0) out.aspect = view.aspect;
  if (view.twist !== undefined && Number.isFinite(view.twist)) out.twist = view.twist;
  return out;
}

/** Register the saved view of a converted file; invalid views (non-finite centre, height <= 0) are ignored. */
export function registerSavedView(file: File, view: SavedView): void {
  const valid = normalizeSavedView(view);
  if (valid) views.set(file, valid);
}

/** The saved view registered for this file, or null. */
export function savedViewFor(file: File): SavedView | null {
  return views.get(file) ?? null;
}
