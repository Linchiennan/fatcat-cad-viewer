import { describe, expect, it } from "vitest";
import { hitView, plainCadText, searchTexts } from "./textSearch";
import type { MeasurableEntity } from "./measurementGeometry";

const ent = (text: string, x: number, y: number, layer = "F", h = 30): MeasurableEntity => ({
  kind: "TEXT", layer, properties: { text }, points: [], length: 0, approximate: false,
  bounds: { minX: x, maxX: x + text.length * h, minY: y, maxY: y + h },
});

describe("text search", () => {
  it("reads MTEXT the way it is shown", () => {
    expect(plainCadText("{\\fMicrosoft JhengHei|b0|i0|c136|p34;一體形\\P全自動馬桶}")).toBe("一體形 全自動馬桶");
    expect(plainCadText("\\A1;\\H0.7x;\\U+6D88防栓%%c50")).toBe("消防栓Ø50");
    expect(plainCadText("\\S1/2;\"")).toBe("1/2\"");
  });

  it("finds 消防栓 in plain text, MTEXT and attributes, ignoring width and case", () => {
    const hits = searchTexts([ent("室內消防栓設備", 0, 100), ent("{\\C6;消防栓}箱", 0, 200), ent("ＦＢ米黃石", 0, 300), ent("其他", 0, 400)], "消防栓");
    expect(hits.map((h) => h.text)).toEqual(["消防栓箱", "室內消防栓設備"]);
    expect(hits[1].at).toBeCloseTo(3.5 / 7, 9);
    expect(searchTexts([ent("ＦＢ米黃石", 0, 0)], "fb").length).toBe(1);
  });

  it("lists hits top to bottom, then left to right, without duplicates of one text", () => {
    const hits = searchTexts([ent("A1", 500, 0), ent("A2", 0, 0), ent("A3", 0, 1000), ent("A3", 0, 1000)], "a");
    expect(hits.map((h) => h.text)).toEqual(["A3", "A2", "A1"]);
  });

  it("returns nothing for an empty query and shows a hit with context around it", () => {
    expect(searchTexts([ent("消防", 0, 0)], "  ")).toEqual([]);
    const v = hitView({ minX: 0, maxX: 100, minY: 0, maxY: 10 }, 10);
    expect(v.maxX - v.minX).toBe(140); // the word plus two text heights each side
    // A long MTEXT line (3000 units, text height 30) is shown at a readable 24 text heights across.
    const long = hitView({ minX: 0, maxX: 3000, minY: 0, maxY: 30 }, 30);
    expect(long.maxX - long.minX).toBe(720);
    expect((long.minX + long.maxX) / 2).toBe(1500);
    // …and centred on the matched word when it is told where the word is.
    const near = hitView({ minX: 0, maxX: 3000, minY: 0, maxY: 30 }, 30, 0.9);
    expect((near.minX + near.maxX) / 2).toBe(2700);
  });
});

describe("dimension text in search (鴻群 (消防栓)落差:2960)", () => {
  const piece = (h: string, minX: number, minY: number, maxX: number, maxY: number, layer = "F"): MeasurableEntity => ({
    kind: "DIMENSION", layer, propertiesOnly: true, properties: { handle: h, text: "(消防栓)落差:2960", textHeight: 30 }, points: [], length: 0, approximate: false,
    bounds: { minX, minY, maxX, maxY },
  });
  it("gives one hit per dimension, placed on its text rather than an arrow", () => {
    const hits = searchTexts([
      piece("143636", 57486, -11041, 57746, -11041), piece("143636", 57731, -11046, 57741, -11036, "0"),
      piece("143636", 57736, -14040, 57736, -11031), piece("143636", 57673, -12713, 57717, -12367),
    ], "消防栓");
    expect(hits).toHaveLength(1);
    expect(hits[0].bounds).toEqual({ minX: 57673, minY: -12713, maxX: 57717, maxY: -12367 });
  });
  it("keeps the same dimension repeated by a block in two places apart", () => {
    const hits = searchTexts([piece("D1", 0, 0, 40, 300), piece("D1", 5000, 0, 5040, 300)], "落差");
    expect(hits).toHaveLength(2);
  });
});
