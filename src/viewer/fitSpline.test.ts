import { describe, expect, it } from "vitest";
import { fitSplineVertices } from "./fitSpline";

// W12--鑄鐵管固定方式 handle 40199: a SPLINE with four fit points and no control points (ZWCAD draws it).
const fit = [{ x: 3809.1967, y: 1703.3029 }, { x: 3786.8804, y: 1709.3038 }, { x: 3782.8067, y: 1707.7936 }, { x: 3761.1967, y: 1711.7362 }];

describe("SPLINE with fit points only", () => {
  it("draws a curve through every fit point, ends included", () => {
    const v = fitSplineVertices({ fitPoints: fit })!;
    expect(v.length).toBeGreaterThan(fit.length);
    for (const p of fit) expect(v.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)).toBe(true);
    expect(v[0].x).toBeCloseTo(fit[0].x, 6); expect(v[0].y).toBeCloseTo(fit[0].y, 6);
    expect(v.at(-1)).toEqual(fit[3]);
  });
  it("stays within the span of the fit points (ZWCAD's own box is the control polygon's, wider)", () => {
    const v = fitSplineVertices({ fitPoints: fit })!;
    const xs = v.map((p) => p.x), ys = v.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(3761.1967, 3);
    expect(Math.max(...xs)).toBeCloseTo(3809.1967, 3);
    expect(Math.min(...ys)).toBeGreaterThan(1702);
    expect(Math.max(...ys)).toBeLessThan(1713);
  });
  it("follows saved end tangents", () => {
    const v = fitSplineVertices({ fitPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }], startTangent: { x: 0, y: 1 }, endTangent: { x: 0, y: -1 } })!;
    expect(v[1].y).toBeGreaterThan(0);
    expect(v.at(-2)!.y).toBeGreaterThan(0);
  });
  it("leaves control-point splines and single points to the normal path", () => {
    expect(fitSplineVertices({ controlPoints: fit, fitPoints: fit })).toBeNull();
    expect(fitSplineVertices({ fitPoints: [fit[0]] })).toBeNull();
  });
});
