import { describe, expect, it } from "vitest";
import { fallbackPadding, fitInArea, freeArea, initialBounds, savedViewCamera } from "./viewGeometry";
import type { DrawingBounds } from "../types/drawing";

const box = (minX: number, minY: number, maxX: number, maxY: number): DrawingBounds => ({ minX, minY, maxX, maxY });

describe("free area of the canvas (T14 3.5-1)", () => {
  const canvas = { left: 0, top: 0, width: 1280, height: 900 };

  it("removes the file bar and a bottom toolbar", () => {
    const free = freeArea(canvas, { topBar: { left: 0, top: 0, width: 1280, height: 48 }, toolbar: { left: 0, top: 820, width: 1280, height: 80 } });
    expect(free).toEqual({ left: 0, top: 48, width: 1280, height: 772 });
  });

  it("does not take a vertical desktop dock as the bottom edge", () => {
    const free = freeArea(canvas, { toolbar: { left: 1200, top: 200, width: 80, height: 500 } });
    expect(free).toEqual({ left: 0, top: 0, width: 1200, height: 900 });
  });

  it("keeps a corner overlay out as a top band on a phone in portrait, as a side column in landscape", () => {
    const phone = { left: 0, top: 0, width: 390, height: 844 };
    const corner = { left: 250, top: 50, width: 140, height: 36 };
    expect(freeArea(phone, { topBar: { left: 0, top: 0, width: 390, height: 50 }, corners: [corner] }).top).toBe(86);
    const wide = { left: 0, top: 0, width: 844, height: 390 };
    const tall = { left: 700, top: 50, width: 144, height: 300 };
    const free = freeArea(wide, { topBar: { left: 0, top: 0, width: 844, height: 50 }, corners: [tall] });
    expect(free.width).toBe(700);
    expect(free.top).toBe(50);
  });

  it("falls back to the whole canvas when the free part collapses", () => {
    expect(freeArea(canvas, { topBar: { left: 0, top: 0, width: 1280, height: 850 } })).toEqual(canvas);
  });
});

describe("fit (T14 3.5)", () => {
  it("centres the range in the free area with 16 px margins", () => {
    const canvas = { left: 0, top: 0, width: 390, height: 844 }, free = { left: 0, top: 50, width: 390, height: 704 };
    const view = fitInArea(box(0, 0, 1000, 100), canvas, free);
    // wide drawing on a phone: the width limits, 16 px each side
    expect(view.width).toBeCloseTo(1000 / (390 - 32) * 390, 6);
    const scale = view.width / 390;
    // the free area is lower than the canvas centre by 5 px: the camera moves up by 5 px worth of units
    expect(view.center.x).toBeCloseTo(500, 9);
    expect(view.center.y).toBeCloseTo(50 + (50 + 352 - 422) * scale, 9);
  });

  it("does not fail on a single-point drawing", () => {
    const view = fitInArea(box(5, 5, 5, 5), { left: 0, top: 0, width: 400, height: 300 }, { left: 0, top: 0, width: 400, height: 300 });
    expect(view.width).toBeCloseTo(1, 9);
    expect(view.center).toEqual({ x: 5, y: 5 });
  });

  it("uses a safe padding without a layout", () => {
    expect(fallbackPadding(0, 80)).toBe(0.12);
    expect(fallbackPadding(800, 80)).toBeCloseTo(800 / 640 - 1, 9);
  });
});

describe("initial range (T14 4.4)", () => {
  const grid = (n: number, size = 10, step = 20) => Array.from({ length: n }, (_, i) => box((i % 10) * step, Math.floor(i / 10) * step, (i % 10) * step + size, Math.floor(i / 10) * step + size));

  it("drops one far-away tiny mark", () => {
    const items = [...grid(40), box(100000, 100000, 100000.5, 100000.5)];
    const all = box(0, 0, 100000.5, 100000.5);
    expect(initialBounds(all, items, true)).toEqual(box(0, 0, 190, 70));
  });

  it("keeps a second sheet drawn as one block, and sheets of similar size", () => {
    const sheet = grid(40), second = box(5000, 0, 5190, 70);
    expect(initialBounds(box(0, 0, 5190, 70), [...sheet, second], true)).toEqual(box(0, 0, 5190, 70));
    const twin = grid(40).map((b) => box(b.minX + 5000, b.minY, b.maxX + 5000, b.maxY));
    expect(initialBounds(box(0, 0, 5190, 70), [...sheet, ...twin], true)).toEqual(box(0, 0, 5190, 70));
  });

  it("does not drop anything with too few objects", () => {
    const all = box(0, 0, 100000, 100000);
    expect(initialBounds(all, [box(0, 0, 10, 10), box(100000, 100000, 100000, 100000)], true)).toEqual(all);
  });

  it("keeps the margins of geometry and text the index did not cover", () => {
    const items = [...grid(40), box(100000, 100000, 100000.5, 100000.5)];
    expect(initialBounds(box(-2, -3, 100000.5, 100000.5), items, true)).toEqual(box(-2, -3, 190, 70));
  });

  it("falls back when the index leaves the full range, or the range has a large unindexed part", () => {
    const items = [...grid(40), box(100000, 100000, 100000.5, 100000.5)];
    const inside = box(0, 0, 90000, 90000);
    expect(initialBounds(inside, items, true)).toEqual(inside);
    const larger = box(-500, 0, 100000.5, 100000.5);
    expect(initialBounds(larger, items, true)).toEqual(larger);
  });

  it("drops small marks on several sides within the budget", () => {
    const items = [...grid(60), box(100000, 0, 100000.5, 0.5), box(-100000, 0, -99999.5, 0.5)];
    expect(initialBounds(box(-100000, 0, 100000.5, 110), items, true)).toEqual(box(0, 0, 190, 110));
  });

  it("gives no view for an empty or invalid range, and uses the full range when the index is incomplete", () => {
    expect(initialBounds(null, [], true)).toBeNull();
    expect(initialBounds(box(NaN, 0, 1, 1), [], true)).toBeNull();
    const all = box(0, 0, 100000.5, 100000.5);
    expect(initialBounds(all, [...grid(40), box(100000, 100000, 100000.5, 100000.5)], false)).toEqual(all);
  });
});

describe("saved CAD view (T14 3.8)", () => {
  const range = box(0, 0, 3600, 1200);
  const saved = { center: { x: 1782.3, y: 584.95 }, viewHeight: 1246.47, aspect: 3.3605 };

  it("keeps the whole desktop rectangle on a narrow phone", () => {
    const view = savedViewCamera(saved, range, 390 / 700)!;
    expect(view.center).toEqual(saved.center);
    expect(view.width).toBeCloseTo(1246.47 * 3.3605, 6);
  });

  it("uses the canvas aspect when the canvas is wider", () => {
    expect(savedViewCamera(saved, range, 5)!.width).toBeCloseTo(1246.47 * 5, 6);
    expect(savedViewCamera({ center: saved.center, viewHeight: 100 }, range, 2)!.width).toBe(200);
  });

  it("is not usable outside the drawing, when invalid, or when it shrinks the drawing too far", () => {
    expect(savedViewCamera({ ...saved, center: { x: 1e6, y: 1e6 } }, range, 1.4)).toBeNull();
    expect(savedViewCamera({ ...saved, viewHeight: 0 }, range, 1.4)).toBeNull();
    expect(savedViewCamera(saved, null, 1.4)).toBeNull();
    expect(savedViewCamera(saved, range, NaN)).toBeNull();
    expect(savedViewCamera({ center: { x: 1800, y: 600 }, viewHeight: 20000 }, range, 1.4)).toBeNull();
  });

  it("keeps an ordinary margin around the drawing", () => {
    expect(savedViewCamera({ center: { x: 1800, y: 600 }, viewHeight: 1500 }, range, 3)).not.toBeNull();
  });
});
