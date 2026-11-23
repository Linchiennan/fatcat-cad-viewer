import { describe, expect, it } from "vitest";
import { batchName } from "./numbering";

describe("批次名稱＝建立日期＋施工項目（用戶 2026-11-23）", () => {
  it("ROC date of the day it was made, then the item", () => {
    expect(batchName(new Date(2026, 10, 23, 9, 30).getTime(), " 輕隔間配管 ")).toBe("115.11.23 輕隔間配管");
  });
  it("no item yet: the date alone", () => {
    expect(batchName(new Date(2026, 0, 5).getTime(), "")).toBe("115.01.05");
  });
});
