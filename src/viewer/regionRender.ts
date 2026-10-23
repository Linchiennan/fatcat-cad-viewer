// Off-screen drawing of a region at a chosen pixel size, for PNG / PDF output (005 export, B part).
// Renders into WebGL render targets with its own camera, so the user's view never moves; regions bigger
// than the GPU allows are drawn in tiles and joined on a 2D canvas.
import { OrthographicCamera, SRGBColorSpace, WebGLRenderTarget, type Scene, type WebGLRenderer } from "three";
import type { DrawingBounds, DrawingPoint } from "../types/drawing";

/** Largest output in pixels before refusing (about 160 MB of RGBA); the caller retries smaller. */
export const EXPORT_PIXEL_LIMIT = 40_000_000;
/** Tiles are never larger than this, even on GPUs that allow more (keeps one tile's memory modest). */
export const TILE_CAP = 4096;

/** The output would not fit in memory, or the device refused the canvas. Code EXPORT_TOO_LARGE. */
export class ExportTooLargeError extends Error {
  readonly code = "EXPORT_TOO_LARGE" as const;
  constructor(readonly widthPx: number, readonly heightPx: number, readonly limitPx = EXPORT_PIXEL_LIMIT) {
    super(`Output of ${widthPx}x${heightPx} pixels is over the ${limitPx} pixel limit of this device.`);
    this.name = "ExportTooLargeError";
  }
}

export type Tile = { x: number; y: number; width: number; height: number };

/** Split width x height pixels into a grid of tiles no larger than `max` on either side (rows from the top). */
export function planTiles(width: number, height: number, max: number): Tile[] {
  const cols = Math.ceil(width / max), rows = Math.ceil(height / max), out: Tile[] = [];
  const edges = (total: number, parts: number) => Array.from({ length: parts + 1 }, (_, i) => Math.round((total * i) / parts));
  const xs = edges(width, cols), ys = edges(height, rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: xs[c], y: ys[r], width: xs[c + 1] - xs[c], height: ys[r + 1] - ys[r] });
  return out;
}

/** Drawing rectangle covered by a tile of a width x height picture of `bounds`. */
export function tileBounds(bounds: DrawingBounds, width: number, height: number, tile: Tile): DrawingBounds {
  const sx = (bounds.maxX - bounds.minX) / width, sy = (bounds.maxY - bounds.minY) / height;
  return {
    minX: bounds.minX + tile.x * sx, maxX: bounds.minX + (tile.x + tile.width) * sx,
    maxY: bounds.maxY - tile.y * sy, minY: bounds.maxY - (tile.y + tile.height) * sy,
  };
}

/** Largest tile side the renderer can draw and read back. */
export function maxTileSize(renderer: WebGLRenderer): number {
  const gl = renderer.getContext?.();
  let limit = renderer.capabilities?.maxTextureSize || TILE_CAP;
  try {
    if (gl) {
      limit = Math.min(limit, Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || limit);
      const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number> | null;
      if (dims) limit = Math.min(limit, dims[0] || limit, dims[1] || limit);
    }
  } catch { /* keep the texture limit */ }
  return Math.max(256, Math.min(limit, TILE_CAP));
}

export type RegionTarget = {
  renderer: WebGLRenderer;
  scene: Scene;
  origin: DrawingPoint;
  /** Lets screen-space strokes size themselves to the tile while it renders (null = the screen canvas). */
  setRenderSize(size: { width: number; height: number } | null): void;
  /** Redraw the screen afterwards. */
  redraw(): void;
};

export type RegionOptions = {
  /** Output canvas factory (tests). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  /** Override the tile size (tests). */
  maxTile?: number;
  /** Yield between tiles so the page stays responsive. */
  pause?: () => Promise<void>;
};

export type RegionResult = { canvas: HTMLCanvasElement; tiles: number; ms: number };

const defaultCanvas = (width: number, height: number) => {
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  return c;
};

/** Draw `bounds` (drawing coordinates) into a widthPx x heightPx canvas. */
export async function renderRegion(target: RegionTarget, bounds: DrawingBounds, widthPx: number, heightPx: number, options: RegionOptions = {}): Promise<RegionResult> {
  const start = performance.now();
  const width = Math.round(widthPx), height = Math.round(heightPx);
  if (!(width > 0 && height > 0) || ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite) || !(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY))
    throw new RangeError("renderRegion needs a non-empty range and a positive pixel size");
  if (width * height > EXPORT_PIXEL_LIMIT) throw new ExportTooLargeError(width, height);
  const canvas = (options.createCanvas ?? defaultCanvas)(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width !== width || canvas.height !== height) throw new ExportTooLargeError(width, height);

  const { renderer, scene, origin } = target;
  const tiles = planTiles(width, height, options.maxTile ?? maxTileSize(renderer));
  const pause = options.pause ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const previous = renderer.getRenderTarget();
  try {
    for (const tile of tiles) {
      const area = tileBounds(bounds, width, height, tile);
      const camera = new OrthographicCamera(area.minX - origin.x, area.maxX - origin.x, area.maxY - origin.y, area.minY - origin.y, 0.1, 2);
      camera.position.set(0, 0, 1);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const rt = new WebGLRenderTarget(tile.width, tile.height, { samples: renderer.capabilities?.isWebGL2 ? 4 : 0 });
      // Same encoding as the screen, so images keep their colours.
      rt.texture.colorSpace = SRGBColorSpace;
      const pixels = new Uint8Array(tile.width * tile.height * 4);
      try {
        target.setRenderSize({ width: tile.width, height: tile.height });
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(rt, 0, 0, tile.width, tile.height, pixels);
      } finally {
        target.setRenderSize(null);
        renderer.setRenderTarget(previous);
        rt.dispose();
      }
      // GL rows start at the bottom; canvas rows at the top.
      const image = ctx.createImageData(tile.width, tile.height), row = tile.width * 4;
      for (let y = 0; y < tile.height; y++) image.data.set(pixels.subarray((tile.height - 1 - y) * row, (tile.height - y) * row), y * row);
      ctx.putImageData(image, tile.x, tile.y);
      if (tiles.length > 1) await pause();
    }
  } finally {
    target.redraw();
  }
  return { canvas, tiles: tiles.length, ms: Math.round(performance.now() - start) };
}
