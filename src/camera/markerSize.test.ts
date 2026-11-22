import { describe, expect, it } from "vitest";
import { markerUnitRadius } from "./alignment";
import { MARKER_RADIUS_PX, screenMarkerScale } from "./PhotoMarkerLayer";

describe("定位符號跟著圖面縮放（用戶 2026-11-22：建築圖縮小，他沒跟著縮小）", () => {
  it("screen radius = drawing radius × pixels per unit, so it halves when the drawing halves", () => {
    const w = 7885, r = markerUnitRadius(w);
    for (const ppu of [0.05, 0.1, 0.4]) expect(MARKER_RADIUS_PX * screenMarkerScale(w, ppu)).toBeCloseTo(r * ppu, 9);
    expect(screenMarkerScale(w, 0.05) / screenMarkerScale(w, 0.1)).toBeCloseTo(0.5, 9);
  });
  it("slider multiplies the drawing size", () => {
    expect(screenMarkerScale(7885, 0.1, 2)).toBeCloseTo(2 * screenMarkerScale(7885, 0.1), 9);
  });
  it("8F example: about the user's own block (r 53)", () => {
    expect(markerUnitRadius(7885)).toBeGreaterThan(53 * 0.8);
    expect(markerUnitRadius(7885)).toBeLessThan(53 * 1.5);
  });
  it("falls back to the fixed screen size before the sheet is known", () => {
    expect(screenMarkerScale(0, 0.1, 1.5)).toBe(1.5);
    expect(screenMarkerScale(undefined, 0.1)).toBe(1);
  });
});
