import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_COLUMNS, nextExportColumns } from "./exportColumns";

// 用戶 2026-10-29：歷史輸出 X 左邊切換每排 2～5 張.
describe("cards per row in 歷史輸出", () => {
  it("starts at 4 and cycles 2 → 3 → 4 → 5 → 2", () => {
    expect(DEFAULT_EXPORT_COLUMNS).toBe(4);
    expect([2, 3, 4, 5].map(nextExportColumns)).toEqual([3, 4, 5, 2]);
  });
});
