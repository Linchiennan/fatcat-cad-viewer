import { describe, expect, it } from "vitest";
import { cardLabel, cardOrder, closeGap, markerText, moveToNumber, nextNumber, photoLabels, plainLabel, rocDate, rocDateLong, snapAngle } from "./numbering";
import type { PhotoRecord, ShotPoint } from "./types";

const pt = (id: string, no: number): ShotPoint => ({ id, batchId: "b", no, x: 0, y: 0, angle: 0, place: "" });
const ph = (id: string, pointId: string | null, takenAt: number): PhotoRecord => ({
  id, batchId: "b", pointId, takenAt, width: 1, height: 1, bytes: 1,
  board: { item: "", place: "", date: "", inspector: "", x: 0, y: 0, width: 0.3 },
});

describe("numbering (照片保存卡 numbers as in the 8F 隔間請款 folder)", () => {
  const points = [pt("a", 1), pt("b", 2), pt("c", 3)];
  const photos = [ph("a1", "a", 1), ph("a2", "a", 2), ph("b1", "b", 3), ph("c2", "c", 9), ph("c1", "c", 5), ph("u", null, 4)];

  it("labels photos N or N-k, unplaced ones not at all", () => {
    const labels = photoLabels(points, photos);
    expect([...labels].map(([id, l]) => `${id}:${plainLabel(l)}`)).toEqual(["a1:1-1", "a2:1-2", "b1:2", "c1:3-1", "c2:3-2"]);
    expect(labels.has("u")).toBe(false);
    expect(cardLabel(labels.get("a1")!)).toBe("001-1");
    expect(cardLabel(labels.get("b1")!)).toBe("002");
    expect(cardLabel({ no: 23, seq: null })).toBe("023");
    expect(cardLabel({ no: 999, seq: 2 })).toBe("999-2");
  });

  it("writes Nx2 in the circle when a point has several photos", () => {
    expect(markerText(points[0], photos)).toBe("1x2");
    expect(markerText(points[1], photos)).toBe("2");
    expect(markerText(pt("d", 4), photos)).toBe("4");
  });

  it("orders the card by number, then shooting time", () => {
    expect(cardOrder([pt("c", 1), pt("a", 2), pt("b", 3)], photos).map((p) => p.id)).toEqual(["c1", "c2", "a1", "a2", "b1"]);
  });

  it("numbers new points after the last and closes gaps after a delete", () => {
    expect(nextNumber(points)).toBe(4);
    expect(nextNumber([])).toBe(1);
    expect(closeGap([pt("a", 1), pt("c", 3), pt("d", 4)], 2).map((p) => `${p.id}${p.no}`)).toEqual(["c2", "d3"]);
  });

  it("moves a point to another number without repeats", () => {
    const four = [...points, pt("d", 4)];
    expect(moveToNumber(four, "d", 2).map((p) => `${p.id}${p.no}`).sort()).toEqual(["b3", "c4", "d2"]);
    expect(moveToNumber(four, "a", 4).map((p) => `${p.id}${p.no}`).sort()).toEqual(["a4", "b1", "c2", "d3"]);
    expect(moveToNumber(four, "b", 99).map((p) => `${p.id}${p.no}`).sort()).toEqual(["b4", "c2", "d3"]);
    expect(moveToNumber(four, "b", 2)).toEqual([]);
  });

  it("writes ROC dates and snaps arrows to 45°", () => {
    expect(rocDate(new Date(2020, 9, 15))).toBe("109.10.15");
    expect(rocDateLong(new Date(2020, 9, 21))).toBe("109 年 10 月 21 日");
    expect(snapAngle(100)).toBe(90);
    expect(snapAngle(-30)).toBe(315);
    expect(snapAngle(350)).toBe(0);
    expect(snapAngle(100, true)).toBe(100);
  });
});
