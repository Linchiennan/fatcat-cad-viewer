import { describe, expect, it } from "vitest";
import { BOARD_ASPECT, boardRect, boardRows, boardTitle } from "./whiteboard";

const board = { item: "輕隔間配管", place: "8F-A 戶 主浴", date: "109.10.15", inspector: "大肥貓", x: 0.02, y: 0.6, width: 0.3 };

describe("whiteboard", () => {
  it("has the rows of the hand-held board plus the photo number", () => {
    expect(boardRows(board, { title: "PARK 23 水電工程", no: "01-1" }).map((r) => `${r.label}=${r.value}`)).toEqual([
      "施工項目=輕隔間配管", "施工位置=8F-A 戶 主浴", "查驗日期=109.10.15", "查驗現況=", "查驗人員=大肥貓", "照片編號=01-1",
    ]);
    const s = { id: "s", name: "大肥貓", aspect: 3, strokes: [], createdAt: 0 };
    expect(boardRows(board, { title: "", no: "1" }, s)[4].signature).toBe(s);
  });

  it("has the 施工前／中／後 boxes under 查驗日期, the chosen one ticked", () => {
    const ticks = (stage?: "before" | "during" | "after") => boardRows({ ...board, ...(stage ? { stage } : {}) }, { title: "", no: "1" })[3].checks!.map((c) => (c.on ? "☑" : "□") + c.label).join(" ");
    expect(ticks()).toBe("□施工前 □施工中 □施工後");
    expect(ticks("during")).toBe("□施工前 ☑施工中 □施工後");
  });

  it("keeps the board inside the picture", () => {
    const r = boardRect(board, 3264, 1840);
    expect(r.w).toBeCloseTo(979.2);
    expect(r.h).toBeCloseTo(979.2 * BOARD_ASPECT);
    expect(r.y + r.h).toBeLessThanOrEqual(1840);
    const corner = boardRect({ x: 0.95, y: 0.95, width: 0.3 }, 1000, 1000);
    expect(corner.x + corner.w).toBeLessThanOrEqual(1000);
    expect(corner.y + corner.h).toBeLessThanOrEqual(1000);
  });

  it("titles the board with project and trade", () => {
    expect(boardTitle("PARK 23 ", "水電工程")).toBe("PARK 23 水電工程");
    expect(boardTitle("PARK 23", "")).toBe("PARK 23");
  });
});
