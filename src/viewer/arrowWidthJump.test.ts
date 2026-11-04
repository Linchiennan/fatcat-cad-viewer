import { describe, expect, it } from "vitest";
import { widePolyline } from "./widePolyline";

// 惠宇 003 制水閥箱：引線箭頭＝第一段寬 0→16、下一段寬 0；接角把箭頭外緣接到中心線，三角形被壓成一條線
describe("width jump at a vertex (polyline arrowhead)", () => {
  const area = (m: { vertices: { x: number; y: number }[]; indices: number[] }[]) => m.reduce((s, { vertices: v, indices: ix }) => {
    for (let i = 0; i < ix.length; i += 3) { const [a, b, c] = [v[ix[i]], v[ix[i + 1]], v[ix[i + 2]]]; s += Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2; }
    return s; }, 0);
  it("keeps the arrowhead triangle when the next segment is thinner", () => {
    const head = widePolyline([{ x: 0, y: 0, startWidth: 0, endWidth: 16 }, { x: 37, y: 38.7 }, { x: 116, y: 121 }], false, 0);
    // 三角形面積 ≈ ½ × 長 53.5 × 寬 16
    expect(area(head)).toBeGreaterThan(0.9 * 0.5 * Math.hypot(37, 38.7) * 16);
  });
  it("still mitres equal-width corners", () => {
    const m = widePolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false, 2);
    expect(m.flatMap((q) => q.vertices).some((p) => Math.abs(p.x - 11) < 1e-9 && Math.abs(p.y + 1) < 1e-9)).toBe(true);
  });
});
