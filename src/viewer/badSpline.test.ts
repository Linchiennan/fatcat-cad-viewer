import { describe, expect, it } from "vitest";
import { DxfScene } from "dxf-viewer/src/DxfScene.js";
import { installEngineeringScene } from "./engineering";

installEngineeringScene(DxfScene);
const scene: any = Object.create((DxfScene as any).prototype);
const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("splines with a bad knot vector (PARK 1F 水電施工圖 hatch boundary)", () => {
  it("retries with standard knots instead of failing the drawing", () => {
    const p = scene._InterpolateSpline(0.5, 3, square, [0, 0, 1]); // far too few knots
    expect(p.every(Number.isFinite)).toBe(true);
    expect(scene.cadBadSplines).toBe(0); // counted once per curve, at t = 0
    scene._InterpolateSpline(0, 3, square, [0, 0, 1]);
    expect(scene.cadBadSplines).toBe(1);
  });

  it("follows the control polygon when even the degree does not fit", () => {
    const p = scene._InterpolateSpline(0.5, 0, [[0, 0], [10, 0]], [1]);
    expect(p).toEqual([5, 0]);
  });

  it("leaves good splines untouched", () => {
    const good = scene._InterpolateSpline(0.5, 1, [[0, 0], [10, 0]], [0, 0, 1, 1]);
    expect(good[0]).toBeCloseTo(5, 9);
  });
});
