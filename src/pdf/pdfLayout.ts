// PDF page sizing and paging rules (T17 2.2, 3.3). Pure, so they are tested without a browser.

export const ZOOM_STEP = 1.25;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 6;
/** Left + right padding of the scroll area. */
export const SIDE_PADDING = 36;
const MAX_PIXELS = 12_000_000;
const MAX_SIDE = 8192;

/** CSS scale of a page: fit the page width to the scroll area, times the zoom. */
export const pageScale = (scrollWidth: number, pageWidth: number, zoom: number) =>
  Math.max(0.05, (scrollWidth - SIDE_PADDING) / pageWidth) * zoom;

/** Canvas pixels per CSS pixel: device ratio, at most 2, about 12 million pixels and 8192 px a side. */
export function pixelRatio(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const area = cssWidth * cssHeight;
  return Math.min(devicePixelRatio || 1, 2, area > 0 ? Math.sqrt(MAX_PIXELS / area) : 2, MAX_SIDE / Math.max(cssWidth, cssHeight, 1));
}

/** Canvas pixel size for a page shown at cssWidth × cssHeight. */
export function canvasSize(cssWidth: number, cssHeight: number, devicePixelRatio: number) {
  const r = pixelRatio(cssWidth, cssHeight, devicePixelRatio);
  return { ratio: r, width: Math.max(1, Math.floor(cssWidth * r)), height: Math.max(1, Math.floor(cssHeight * r)) };
}

/** Page number typed in the box: whole number within 1…pages; empty or not a number → null (no change). */
export function typedPage(value: string, pages: number): number | null {
  if (!value.trim() || !(pages > 0)) return null;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(pages, Math.max(1, n));
}

export const zoomIn = (z: number) => Math.min(ZOOM_MAX, z * ZOOM_STEP);
export const zoomOut = (z: number) => Math.max(ZOOM_MIN, z / ZOOM_STEP);
export const zoomText = (z: number) => `${Math.round(z * 100)}%`;

/** Zoom multiplied by a gesture factor (pinch distance ratio, wheel steps), kept within ZOOM_MIN…ZOOM_MAX. */
export const zoomBy = (z: number, factor: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (Number.isFinite(factor) && factor > 0 ? factor : 1)));
/** Factor for one wheel event: up (negative deltaY) zooms in; a mouse notch (≈ 100) is about one ZOOM_STEP. */
export const wheelFactor = (deltaY: number) => Math.exp(-deltaY * (Math.log(ZOOM_STEP) / 100));
