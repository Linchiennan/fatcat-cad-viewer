import { describe, expect, it } from "vitest";
import { DOT_NUMBER_GAP, dotNumberAt } from "./MeasureOverlay";

// 用戶 2026-10-28 截圖：點 1 (259,395)、點 2 (153,429)，舊做法點號一律放右上 → 「2」落在往右上的線中段、貼著「3,230.2」數字框。
const p1 = { x: 259, y: 395 }, p2 = { x: 153, y: 429 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** Signed position along a→b: <0 before a, >1 past b. */
const along = (q: { x: number; y: number }, a: typeof p1, b: typeof p1) => ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / dist(a, b) ** 2;

describe("measure point numbers sit outside the line", () => {
  it("puts each end's number on the line's extension past that end, away from the length box", () => {
    const n1 = dotNumberAt([p1, p2], 0), n2 = dotNumberAt([p1, p2], 1);
    expect(dist(n1, p1)).toBeCloseTo(DOT_NUMBER_GAP, 6);
    expect(dist(n2, p2)).toBeCloseTo(DOT_NUMBER_GAP, 6);
    expect(along(n1, p1, p2)).toBeLessThan(0); // beyond point 1
    expect(along(n2, p1, p2)).toBeGreaterThan(1); // beyond point 2
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }; // where the length box is
    expect(dist(n2, mid)).toBeGreaterThan(dist(p2, mid));
  });

  it("puts a corner's number on the outer side and a straight run's above it", () => {
    const corner = dotNumberAt([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 1);
    expect(corner.x).toBeGreaterThan(100); expect(corner.y).toBeLessThan(0); // outside the L, up-right
    const straight = dotNumberAt([{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 200, y: 50 }], 1);
    expect(straight.x).toBeCloseTo(100, 6); expect(straight.y).toBeCloseTo(50 - DOT_NUMBER_GAP, 6);
    const single = dotNumberAt([{ x: 10, y: 10 }], 0);
    expect(single.x).toBeGreaterThan(10); expect(single.y).toBeLessThan(10); // first point alone: up-right as before
  });
});
