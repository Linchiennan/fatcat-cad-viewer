import { describe, expect, it } from "vitest";
import { applyTransform, copiedPlace, IDENTITY, transformFromPairs, transformTurn } from "./copySpots";

describe("複製到另一張圖 (用戶 2026-11-24)", () => {
  it("leaves the spots where they are on a drawing with the same base point", () => {
    expect(applyTransform(IDENTITY, { x: 1200, y: 340 })).toEqual({ x: 1200, y: 340 });
    expect(transformTurn(transformFromPairs([]))).toBe(0);
  });

  it("moves every spot by one pair", () => {
    const t = transformFromPairs([{ from: { x: 10, y: 20 }, to: { x: 3010, y: 20 } }]);
    expect(applyTransform(t, { x: 500, y: 600 })).toEqual({ x: 3500, y: 600 });
    expect(transformTurn(t)).toBe(0);
  });

  it("moves, turns and scales by two pairs so both land exactly", () => {
    // a page turned 90° and drawn twice as large, then moved
    const t = transformFromPairs([{ from: { x: 0, y: 0 }, to: { x: 100, y: 50 } }, { from: { x: 10, y: 0 }, to: { x: 100, y: 70 } }]);
    const a = applyTransform(t, { x: 0, y: 0 }), b = applyTransform(t, { x: 10, y: 0 }), c = applyTransform(t, { x: 0, y: 5 });
    expect(a.x).toBeCloseTo(100); expect(a.y).toBeCloseTo(50);
    expect(b.x).toBeCloseTo(100); expect(b.y).toBeCloseTo(70);
    expect(c.x).toBeCloseTo(90); expect(c.y).toBeCloseTo(50);
    expect(transformTurn(t)).toBeCloseTo(90);
  });

  it("names a copied spot after the room on the new drawing, else the old name on the new floor", () => {
    expect(copiedPlace("9F 起居室", "8F 臥室2", "8F-平面.dwg", "9F-平面.dwg")).toBe("9F 起居室"); // 客變 renamed it
    expect(copiedPlace("9F", "8F 主臥", "8F-平面.dwg", "9F-平面.dwg")).toBe("9F 主臥");
    expect(copiedPlace("", "主臥", "平面.dwg", "平面2.dwg")).toBe("主臥");
    expect(copiedPlace("9F-A 戶", "8F-A 戶 主浴", "8F.dwg", "9F.dwg")).toBe("9F-A 戶 主浴");
    expect(copiedPlace("臥", "臥室1", "平面.dwg", "平面.dwg")).toBe("臥室1"); // only part of the old name was read
  });
});

describe("copied spots that miss the new drawing start fitted into it", async () => {
  const { startTransform, composeTransform } = await import("./copySpots");
  it("keeps spots that fall on the drawing, fits a CAD project into a PDF page", () => {
    expect(startTransform([{ x: 10, y: 10 }, { x: 50, y: 40 }], { minX: 0, minY: 0, maxX: 100, maxY: 100 })).toEqual(IDENTITY);
    const t = startTransform([{ x: 1000, y: 2000 }, { x: 9000, y: 6000 }], { minX: 0, minY: 0, maxX: 841, maxY: 595 });
    const a = applyTransform(t, { x: 1000, y: 2000 }), b = applyTransform(t, { x: 9000, y: 6000 });
    for (const q of [a, b]) { expect(q.x).toBeGreaterThan(0); expect(q.x).toBeLessThan(841); expect(q.y).toBeGreaterThan(0); expect(q.y).toBeLessThan(595); }
    expect((a.x + b.x) / 2).toBeCloseTo(420.5); expect((a.y + b.y) / 2).toBeCloseTo(297.5);
  });
  it("composes: first, then", () => {
    const first = { a: 2, b: 0, tx: 1, ty: 0 }, then = { a: 0, b: 1, tx: 0, ty: 5 }; // scale 2 + move, then turn 90° + move
    const c = composeTransform(first, then), p = { x: 3, y: 4 };
    const direct = applyTransform(then, applyTransform(first, p)), via = applyTransform(c, p);
    expect(via.x).toBeCloseTo(direct.x); expect(via.y).toBeCloseTo(direct.y);
  });
});
