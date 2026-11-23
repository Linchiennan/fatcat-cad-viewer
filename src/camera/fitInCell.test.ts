// 保存卡照片保持比例（用戶 2026-11-23：「為啥發布的照片，白板會變形?」「白板都要固定尺寸!」）
import { describe, expect, it } from "vitest";
import { fitInCell } from "./photoCard";

const cell = { x: 144, y: 153, w: 405, h: 304 };
const ratio = (r: { w: number; h: number }) => r.w / r.h;

describe("a photo in its 保存卡 cell", () => {
  it("keeps 16:9, full width, centred top to bottom", () => {
    const r = fitInCell(cell, 3840, 2160);
    expect(ratio(r)).toBeCloseTo(16 / 9);
    expect(r.w).toBeCloseTo(405);
    expect(r.y - cell.y).toBeCloseTo(cell.y + cell.h - (r.y + r.h));
  });
  it("keeps an upright 3:4, full height, centred side to side", () => {
    const r = fitInCell(cell, 3000, 4000);
    expect(ratio(r)).toBeCloseTo(3 / 4);
    expect(r.h).toBeCloseTo(304);
    expect(r.x - cell.x).toBeCloseTo(cell.x + cell.w - (r.x + r.w));
  });
  it("fills a 4:3 cell with a 4:3 photo", () => {
    const r = fitInCell(cell, 4000, 3000);
    expect(r.w).toBeCloseTo(405, 0);
    expect(r.h).toBeCloseTo(303.75, 1);
  });
});
