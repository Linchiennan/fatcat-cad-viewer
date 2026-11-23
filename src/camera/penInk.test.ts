import { describe, expect, it } from "vitest";
import { nibWidth, penOutline, speedWidth } from "./penInk";

describe("鋼筆筆觸（用戶 2026-11-23）", () => {
  it("slow strokes swell, fast ones thin out, within 0.5–1.3", () => {
    expect(speedWidth(0)).toBeCloseTo(1.3, 9);
    expect(speedWidth(0.005)).toBeGreaterThan(speedWidth(0.05));
    expect(speedWidth(10)).toBe(0.5);
  });
  it("wider across the 45° nib than along it", () => {
    expect(nibWidth(-Math.PI / 4)).toBeGreaterThan(nibWidth(Math.PI / 4));
    expect(nibWidth(Math.PI / 4)).toBeCloseTo(0.78, 9);
  });
  it("smoothed, tapered at both ends, never wider than 1.3 × base", () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: i * 4, y: Math.sin(i / 2) * 10 }));
    const line = penOutline(pts, 100, 4);
    expect(line.length).toBeGreaterThan(pts.length); // curve points added between samples
    const mid = line[Math.floor(line.length / 2)].w;
    expect(line[0].w).toBeLessThan(mid);
    expect(line.at(-1)!.w).toBeLessThan(mid);
    for (const p of line) { expect(p.w).toBeGreaterThan(0); expect(p.w).toBeLessThanOrEqual(1.3 * 4 + 1e-9); }
    expect(line[0]).toMatchObject({ x: 0, y: 0 });
    expect(line.at(-1)).toMatchObject(pts.at(-1)!);
  });
  it("a single tap is a dot", () => {
    expect(penOutline([{ x: 5, y: 5 }], 100, 4)).toEqual([{ x: 5, y: 5, w: 4 }]);
  });
});
