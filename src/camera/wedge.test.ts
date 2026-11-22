import { describe, expect, it } from "vitest";
import { ARROW_TIP, ARROW_WIDTH, wedgePieces } from "./PhotoMarkerLayer";

describe("對位箭頭外形（範例圖塊）", () => {
  it("tip at r√2, base corners r√2 to each side, fins end on the circle at ±90° and the tangent points", () => {
    const r = 53, [tip, finL, finR] = wedgePieces(0, 0, -1, 0, r, Math.SQRT2, Math.SQRT2); // block's own direction: tip at (-75, 0)
    expect(tip[0].x).toBeCloseTo(-r * Math.SQRT2, 6);
    expect(tip[1].x).toBeCloseTo(-r / Math.SQRT2, 6); // tangent point (-37.5, ∓37.5)
    expect(Math.abs(tip[1].y)).toBeCloseTo(r / Math.SQRT2, 6);
    for (const fin of [finL, finR]) {
      expect(fin[0].x).toBeCloseTo(0, 6); expect(Math.abs(fin[0].y)).toBeCloseTo(r * Math.SQRT2, 6); // base corner (0, ±75)
      expect(fin[1].x).toBeCloseTo(0, 6); expect(Math.abs(fin[1].y)).toBeCloseTo(r, 6); // circle at (0, ±53)
      const end = fin.at(-2)!; // last arc point = tangent point; then the tip
      expect(end.x).toBeCloseTo(-r / Math.SQRT2, 6); expect(Math.abs(end.y)).toBeCloseTo(r / Math.SQRT2, 6);
    }
    expect(Math.sign(finL[0].y)).not.toBe(Math.sign(finR[0].y));
  });
  it("app arrow: tip ARROW_TIP·r ahead, base ARROW_WIDTH·r to each side, tangent pieces meet at the tip", () => {
    const r = 17, [tip, finL, finR] = wedgePieces(0, 0, 1, 0, r);
    expect(tip[0].x).toBeCloseTo(ARROW_TIP * r, 6);
    const tp = tip[1], vx = tp.x - tip[0].x, vy = tp.y - tip[0].y;
    expect(vx * tp.x + vy * tp.y).toBeCloseTo(0, 6); // tangent from the tip
    for (const fin of [finL, finR]) {
      expect(Math.abs(fin[0].y)).toBeCloseTo(ARROW_WIDTH * r, 6); expect(fin[0].x).toBeCloseTo(0, 6);
      expect(fin.at(-1)!.x).toBeCloseTo(ARROW_TIP * r, 6);
    }
  });
});
