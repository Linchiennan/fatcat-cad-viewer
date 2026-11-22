import { describe, expect, it } from "vitest";
import { BOARD_ASPECT, boardRect, boardRows, boardTitle } from "./whiteboard";

const board = { item: "輕隔間配管", place: "8F-A 戶 主浴", date: "109.10.15", inspector: "羅文彬", x: 0.02, y: 0.6, width: 0.3 };

describe("whiteboard", () => {
  it("has the rows of the hand-held board plus the photo number", () => {
    expect(boardRows(board, { title: "PARK 23 水電工程", no: "01-1" }).map((r) => `${r.label}=${r.value}`)).toEqual([
      "施工項目=輕隔間配管", "施工位置=8F-A 戶 主浴", "施工日期=109.10.15", "查驗人員=羅文彬", "照片編號=01-1",
    ]);
    const s = { id: "s", name: "羅文彬", aspect: 3, strokes: [], createdAt: 0 };
    expect(boardRows(board, { title: "", no: "1" }, s)[3].signature).toBe(s);
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
