// Camera arithmetic of the engine (T14 3.5, 3.8, 4.4), free of DOM and WebGL so it can be tested alone.
import type { DrawingBounds, DrawingPoint } from "../types/drawing";
import type { SavedView } from "./savedView";

export type Rect = { left: number; top: number; width: number; height: number };
export type CameraView = { center: DrawingPoint; width: number };

const finite = (...n: number[]) => n.every(Number.isFinite);
export const validBounds = (b: DrawingBounds | null | undefined): b is DrawingBounds =>
  !!b && finite(b.minX, b.minY, b.maxX, b.maxY) && b.maxX >= b.minX && b.maxY >= b.minY;

/** Screen pieces around the canvas that hide part of it (CSS px rects from getBoundingClientRect). */
export type ShellLayout = { topBar?: Rect | null; toolbar?: Rect | null; corners?: Rect[] };

/** Part of the canvas not covered by the file bar, the toolbar and corner overlays (T14 3.5-1 a–c). */
export function freeArea(canvas: Rect, shell: ShellLayout): Rect {
  let top = canvas.top, bottom = canvas.top + canvas.height, left = canvas.left, right = canvas.left + canvas.width;
  if (shell.topBar && shell.topBar.height > 0) top = Math.max(top, shell.topBar.top + shell.topBar.height);
  const bar = shell.toolbar;
  if (bar && bar.width > 0 && bar.height > 0) {
    if (bar.width > bar.height) bottom = Math.min(bottom, bar.top);
    else right = Math.min(right, bar.left);
  }
  const corners = (shell.corners ?? []).filter((c) => c.width > 0 && c.height > 0 && c.top < bottom && c.top + c.height > top);
  if (corners.length) {
    const bandTop = Math.max(top, ...corners.map((c) => c.top + c.height));
    const columnRight = Math.min(right, ...corners.map((c) => c.left));
    const bandArea = Math.max(0, right - left) * Math.max(0, bottom - bandTop);
    const columnArea = Math.max(0, columnRight - left) * Math.max(0, bottom - top);
    if (bandArea >= columnArea) top = bandTop; else right = columnRight;
  }
  const free = { left, top, width: right - left, height: bottom - top };
  if (free.width < canvas.width * 0.2 || free.height < canvas.height * 0.2) return { ...canvas };
  return free;
}

/** Camera that puts `range` in the middle of the free area with 16 px margins (T14 3.5-1 d–e). */
export function fitInArea(range: DrawingBounds, canvas: Rect, free: Rect, margin = 16): CameraView {
  const w = range.maxX - range.minX, h = range.maxY - range.minY;
  const availW = Math.max(1, free.width - 2 * margin), availH = Math.max(1, free.height - 2 * margin);
  let scale = Math.max(w / availW, h / availH);
  if (!(scale > 0) || !Number.isFinite(scale)) scale = 1 / canvas.width;
  const cx = (range.minX + range.maxX) / 2, cy = (range.minY + range.maxY) / 2;
  const canvasCx = canvas.left + canvas.width / 2, canvasCy = canvas.top + canvas.height / 2;
  const freeCx = free.left + free.width / 2, freeCy = free.top + free.height / 2;
  return { center: { x: cx + (canvasCx - freeCx) * scale, y: cy + (freeCy - canvasCy) * scale }, width: canvas.width * scale };
}

/** FitView padding when the canvas has no layout yet (T14 3.5-2). */
export function fallbackPadding(canvasHeight: number, reserve: number): number {
  if (!(canvasHeight > 0) || !Number.isFinite(canvasHeight)) return 0.12;
  const clear = Math.max(canvasHeight * 0.2, canvasHeight - 2 * reserve);
  return Math.max(0.12, canvasHeight / clear - 1);
}

function union(items: readonly DrawingBounds[]): DrawingBounds {
  const out = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const b of items) {
    if (b.minX < out.minX) out.minX = b.minX;
    if (b.minY < out.minY) out.minY = b.minY;
    if (b.maxX > out.maxX) out.maxX = b.maxX;
    if (b.maxY > out.maxY) out.maxY = b.maxY;
  }
  return out;
}
const sizeOf = (b: DrawingBounds) => Math.max(b.maxX - b.minX, b.maxY - b.minY);
const gapBetween = (a: DrawingBounds, b: DrawingBounds) =>
  Math.max(0, a.minX - b.maxX, b.minX - a.maxX, a.minY - b.maxY, b.minY - a.maxY);

/**
 * Bounds for the first view: drops a few tiny far-away marks (base points, stray objects) so the
 * drawing does not open as a dot (T14 4.4). Falls back to `all` whenever a check fails.
 */
export function initialBounds(all: DrawingBounds | null, fits: readonly DrawingBounds[], fitComplete: boolean): DrawingBounds | null {
  if (!validBounds(all)) return null;
  if (!fitComplete) return all;
  const items = fits.filter(validBounds);
  const n = items.length, budget = Math.floor((n - 1) * 0.05);
  if (budget <= 0) return all;
  const asc = (k: keyof DrawingBounds) => items.map((b) => b[k]).sort((a, b) => a - b);
  const minXs = asc("minX"), maxXs = asc("maxX"), minYs = asc("minY"), maxYs = asc("maxY");
  const ref = Math.max(maxXs[n - 1 - budget] - minXs[budget], maxYs[n - 1 - budget] - minYs[budget]);
  if (!(ref > 0)) return all;
  const minGap = ref * 8, maxSize = ref * 0.01;

  let kept = items.slice();
  const excluded: DrawingBounds[] = [];
  for (let round = 0; round < 4 && excluded.length < budget; round++) {
    const left = budget - excluded.length;
    let best: { rest: DrawingBounds[]; out: DrawingBounds[]; area: number } | null = null;
    // For each end: sort outermost first; the first k are dropped. The gap is measured along the axis
    // between the dropped group's inner edge and the rest's near edge (suffix / prefix extremes, O(n)).
    const ends: { outward: (b: DrawingBounds) => number; inner: (b: DrawingBounds) => number; near: (b: DrawingBounds) => number; sign: number }[] = [
      { outward: (b) => -b.maxX, inner: (b) => b.maxX, near: (b) => b.minX, sign: 1 }, // far left
      { outward: (b) => b.minX, inner: (b) => b.minX, near: (b) => b.maxX, sign: -1 }, // far right
      { outward: (b) => -b.maxY, inner: (b) => b.maxY, near: (b) => b.minY, sign: 1 }, // far bottom
      { outward: (b) => b.minY, inner: (b) => b.minY, near: (b) => b.maxY, sign: -1 }, // far top
    ];
    for (const end of ends) {
      const sorted = kept.slice().sort((a, b) => end.outward(b) - end.outward(a)), m = sorted.length;
      const limit = Math.min(left, m - 1);
      if (limit < 1) continue;
      // Rest box and rest near edge for every split, from the inside out.
      const restBox: DrawingBounds[] = new Array(m), restNear: number[] = new Array(m);
      for (let i = m - 1; i >= 0; i--) {
        const b = sorted[i], next = i + 1 < m ? restBox[i + 1] : null;
        restBox[i] = next ? { minX: Math.min(next.minX, b.minX), minY: Math.min(next.minY, b.minY), maxX: Math.max(next.maxX, b.maxX), maxY: Math.max(next.maxY, b.maxY) } : { ...b };
        const v = end.sign * end.near(b);
        restNear[i] = i + 1 < m ? Math.min(restNear[i + 1], v) : v;
      }
      let outInner = -Infinity, outSize = 0;
      for (let k = 1; k <= limit; k++) {
        const b = sorted[k - 1];
        outInner = Math.max(outInner, end.sign * end.inner(b));
        outSize = Math.max(outSize, sizeOf(b));
        if (outSize > maxSize) break;
        if (restNear[k] - outInner < minGap) continue;
        const box = restBox[k], area = (box.maxX - box.minX) * (box.maxY - box.minY);
        if (!best || area < best.area) best = { rest: sorted.slice(k), out: sorted.slice(0, k), area };
      }
    }
    if (!best) break;
    kept = best.rest;
    excluded.push(...best.out);
  }
  if (!excluded.length) return all;
  const content = union(kept), indexBox = union(items), size = sizeOf(content);
  if (excluded.some((b) => sizeOf(b) > maxSize || gapBetween(b, content) < minGap)) return all;
  const tol = size * 1e-6;
  if (indexBox.minX < all.minX - tol || indexBox.minY < all.minY - tol || indexBox.maxX > all.maxX + tol || indexBox.maxY > all.maxY + tol) return all;
  const margins = { left: indexBox.minX - all.minX, bottom: indexBox.minY - all.minY, right: all.maxX - indexBox.maxX, top: all.maxY - indexBox.maxY };
  if (Object.values(margins).some((m) => m > size * 0.05)) return all;
  return {
    minX: content.minX - Math.max(0, margins.left), minY: content.minY - Math.max(0, margins.bottom),
    maxX: content.maxX + Math.max(0, margins.right), maxY: content.maxY + Math.max(0, margins.top),
  };
}

/** Camera for the CAD saved view ("原視角"), or null when it would be useless (T14 3.8). */
export function savedViewCamera(saved: SavedView | null, range: DrawingBounds | null, canvasAspect: number): CameraView | null {
  if (!saved || !validBounds(range) || !(canvasAspect > 0) || !Number.isFinite(canvasAspect)) return null;
  const { x, y } = saved.center;
  if (!finite(x, y, saved.viewHeight) || !(saved.viewHeight > 0)) return null;
  const aspect = saved.aspect && saved.aspect > 0 ? saved.aspect : canvasAspect;
  const width = saved.viewHeight * Math.max(aspect, canvasAspect), height = width / canvasAspect;
  const rect = { minX: x - width / 2, maxX: x + width / 2, minY: y - height / 2, maxY: y + height / 2 };
  if (rect.maxX < range.minX || rect.minX > range.maxX || rect.maxY < range.minY || rect.minY > range.maxY) return null;
  const fitWidth = Math.max(range.maxX - range.minX, (range.maxY - range.minY) * canvasAspect);
  if (fitWidth > 0 && width / fitWidth > 4) return null;
  return { center: { x, y }, width };
}
