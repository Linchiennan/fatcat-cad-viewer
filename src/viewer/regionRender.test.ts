// Off-screen region drawing with a fake WebGL renderer and 2D canvas (no GPU in tests).
import { describe, expect, it } from "vitest";
import { EXPORT_PIXEL_LIMIT, ExportTooLargeError, planTiles, renderRegion, tileBounds, type RegionTarget } from "./regionRender";

type Any = any;

function fakeCanvas(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    width, height, data,
    getContext: () => ({
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img: Any, x: number, y: number) => {
        for (let r = 0; r < img.height; r++) data.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * width + x) * 4);
      },
    }),
  };
}

function fakeTarget() {
  const cameras: Any[] = [], sizes: Any[] = [];
  let current: Any = "screen", redraws = 0, tile = 0;
  const renderer: Any = {
    capabilities: { maxTextureSize: 16384, isWebGL2: false },
    getContext: () => null,
    getRenderTarget: () => current,
    setRenderTarget: (t: Any) => { current = t ?? "screen"; },
    clear: () => {},
    render: (_s: Any, cam: Any) => { cameras.push({ left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom }); },
    // R = tile number, G = GL row (0 = bottom row of the tile).
    readRenderTargetPixels: (_rt: Any, _x: number, _y: number, w: number, h: number, buf: Uint8Array) => {
      tile++;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { buf[(y * w + x) * 4] = tile; buf[(y * w + x) * 4 + 1] = y; buf[(y * w + x) * 4 + 3] = 255; }
    },
  };
  const target: RegionTarget = { renderer, scene: {} as Any, origin: { x: 100, y: 50 }, setRenderSize: (s) => sizes.push(s), redraw: () => { redraws++; } };
  return { target, cameras, sizes, current: () => current, redraws: () => redraws };
}

const options = (maxTile?: number) => ({ createCanvas: (w: number, h: number) => fakeCanvas(w, h) as unknown as HTMLCanvasElement, maxTile, pause: async () => {} });

describe("off-screen region drawing (005 export)", () => {
  it("plans a grid of tiles that covers the picture exactly", () => {
    const tiles = planTiles(3307, 2339, 1024);
    expect(tiles).toHaveLength(4 * 3);
    expect(tiles.reduce((s, t) => s + t.width * t.height, 0)).toBe(3307 * 2339);
    expect(Math.max(...tiles.map((t) => Math.max(t.width, t.height)))).toBeLessThanOrEqual(1024);
    expect(planTiles(800, 600, 4096)).toEqual([{ x: 0, y: 0, width: 800, height: 600 }]);
  });

  it("maps tiles to drawing rectangles from the top-left", () => {
    const b = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    expect(tileBounds(b, 200, 100, { x: 100, y: 0, width: 100, height: 50 })).toEqual({ minX: 50, maxX: 100, maxY: 50, minY: 25 });
  });

  it("draws one tile with a camera on the requested range, upright, and leaves the screen target as it was", async () => {
    const f = fakeTarget();
    const out = await renderRegion(f.target, { minX: 100, minY: 50, maxX: 140, maxY: 80 }, 4, 3, options());
    expect(f.cameras).toEqual([{ left: 0, right: 40, top: 30, bottom: 0 }]); // drawing range minus the scene origin
    const data = (out.canvas as Any).data;
    expect(data[1]).toBe(2); // top canvas row = last GL row
    expect(data[(2 * 4) * 4 + 1]).toBe(0); // bottom canvas row = first GL row
    expect(out.tiles).toBe(1);
    expect(f.current()).toBe("screen");
    expect(f.sizes).toEqual([{ width: 4, height: 3 }, null]);
    expect(f.redraws()).toBe(1);
  });

  it("splits large output into tiles and stitches them in place", async () => {
    const f = fakeTarget();
    const out = await renderRegion(f.target, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, 10, 10, options(4));
    expect(out.tiles).toBe(9);
    const data = (out.canvas as Any).data, px = (x: number, y: number) => data[(y * 10 + x) * 4];
    expect([px(0, 0), px(5, 0), px(9, 0), px(0, 5), px(9, 9)]).toEqual([1, 2, 3, 4, 9]);
    // camera of the middle tile covers its own slice of the drawing
    expect(f.cameras[4].left).toBeCloseTo(-100 + 3, 9);
  });

  it("refuses output over the memory limit before drawing", async () => {
    const f = fakeTarget();
    const side = Math.ceil(Math.sqrt(EXPORT_PIXEL_LIMIT)) + 1;
    const error = await renderRegion(f.target, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, side, side, options()).catch((e) => e);
    expect(error).toBeInstanceOf(ExportTooLargeError);
    expect(error.code).toBe("EXPORT_TOO_LARGE");
    expect(f.cameras).toHaveLength(0);
  });

  it("calls it too large when the device will not make the canvas", async () => {
    const f = fakeTarget();
    const refused = { createCanvas: () => ({ width: 0, height: 0, getContext: () => null }) as unknown as HTMLCanvasElement };
    await expect(renderRegion(f.target, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 100, 100, refused)).rejects.toMatchObject({ code: "EXPORT_TOO_LARGE" });
  });
});
