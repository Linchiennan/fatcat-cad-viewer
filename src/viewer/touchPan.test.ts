import { describe, expect, it } from "vitest";
import { TOUCH } from "three";
import { applyTouchPan, setOneFingerPan, touchMap } from "./touchPan";
import { MIN_TEXT_PX, markerFont, markerLine } from "../camera/PhotoMarkerLayer";

describe("相機開著時底圖只用雙指移動（用戶 2026-11-22）", () => {
  it("one finger off: nothing; two fingers still zoom and pan", () => {
    expect(touchMap(false)).toEqual({ ONE: -1, TWO: TOUCH.DOLLY_PAN });
    expect(touchMap(true)).toEqual({ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN });
  });
  it("applies to live controls and to controls made later", () => {
    const a = { controls: {} as { touches?: { ONE: number; TWO: number } } };
    applyTouchPan(a);
    setOneFingerPan(false);
    expect(a.controls.touches?.ONE).toBe(-1);
    const b = { controls: {} as { touches?: { ONE: number; TWO: number } } };
    applyTouchPan(b); // a new drawing opened while the camera is open
    expect(b.controls.touches?.ONE).toBe(-1);
    setOneFingerPan(true);
    expect(a.controls.touches?.ONE).toBe(TOUCH.PAN);
    expect(b.controls.touches?.ONE).toBe(TOUCH.PAN);
  });
});

describe("符號縮小時形狀不糊掉（用戶 2026-11-22：形狀都跑掉了）", () => {
  it("line width in proportion to the marker", () => {
    expect(markerLine(1)).toBeCloseTo(2.5, 9);
    expect(markerLine(0.4)).toBeCloseTo(1, 9);
    expect(markerLine(0.05)).toBe(0.5);
  });
  it("number left out when it would be a blot, shown again when zoomed in", () => {
    expect(markerFont("2", 0.19)).toBeLessThan(MIN_TEXT_PX);
    expect(markerFont("2", 1)).toBeGreaterThanOrEqual(MIN_TEXT_PX);
  });
});
