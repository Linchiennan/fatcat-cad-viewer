import { describe, expect, it } from "vitest";
import { mlineEntities, mlineStyleFromTags } from "./mline";
import { preserveCadMetadata } from "./cadDocument";

// Layout of a real MLINE from 鴻群消防分流 (style WALL, scale 30, two elements at offsets 0 and -30).
const vertex = (x: number, y: number, params: number[][]): [number, string][] => [
  [11, String(x)], [21, String(y)], [31, "0"], [12, "1"], [22, "0"], [32, "0"], [13, "0"], [23, "1"], [33, "0"],
  ...params.flatMap((p) => [[74, String(p.length)] as [number, string], ...p.map((v) => [41, String(v)] as [number, string]), [75, "0"] as [number, string]]),
];
const tags = (flags = 1, params: number[][] = [[0, 0], [-30, 0]]): [number, string][] => [
  [5, "2041A"], [8, "SB"], [340, "1FF58"], [40, "30"], [70, "0"], [10, "0"], [20, "0"], [30, "0"], [71, String(flags)], [73, "2"], [72, "2"],
  ...vertex(0, 0, params), ...vertex(100, 0, params),
];
const wall = mlineStyleFromTags([[2, "WALL"], [70, "272"], [3, ""], [62, "0"], [51, "90"], [52, "90"], [71, "2"], [49, "0.5"], [62, "0"], [6, "ByLayer"], [49, "-0.5"], [62, "3"], [6, "DASHED"]]);

describe("MLINE display", () => {
  it("reads MLINESTYLE flags and per-element color and line type", () => {
    expect(wall).toEqual({ flags: 272, fillColor: 0, elements: [{ offset: 0.5, color: 0, lineType: "ByLayer" }, { offset: -0.5, color: 3, lineType: "DASHED" }] });
  });

  it("draws each element along the miter offset and square caps from the style", () => {
    const { entities, notes } = mlineEntities(tags(), { handle: "2041A", layer: "SB", style: wall });
    expect(notes).toEqual([]);
    const e0 = entities.find((e) => e.handle === "2041A:e0"), e1 = entities.find((e) => e.handle === "2041A:e1");
    expect(e0.vertices).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(e0).toMatchObject({ colorIndex: 0 });
    expect(e0.lineType).toBeUndefined();
    expect(e1.vertices).toEqual([{ x: 0, y: -30 }, { x: 100, y: -30 }]);
    expect(e1).toMatchObject({ colorIndex: 3, lineType: "DASHED" });
    expect(entities.find((e) => e.handle === "2041A:start").vertices).toEqual([{ x: 0, y: -30 }, { x: 0, y: 0 }]);
    expect(entities.find((e) => e.handle === "2041A:end").vertices).toEqual([{ x: 100, y: -30 }, { x: 100, y: 0 }]);
  });

  it("honours suppressed caps, closed lines, round caps outward and fill", () => {
    const suppressed = mlineEntities(tags(1 | 4 | 8), { handle: "A", layer: "0", style: wall }).entities;
    expect(suppressed.some((e) => /:(start|end)$/.test(e.handle))).toBe(false);
    const closed = mlineEntities(tags(1 | 2), { handle: "B", layer: "0", style: wall }).entities;
    expect(closed.find((e) => e.handle === "B:e0").shape).toBe(true);
    const round = mlineEntities(tags(), { handle: "C", layer: "0", style: { flags: 64 | 1, fillColor: 5, elements: [] } }).entities;
    const arc = round.find((e) => e.handle === "C:startRound");
    expect(arc.vertices[8].x).toBeLessThan(0); // bulges away from the line at the start
    expect(round.filter((e) => e.type === "SOLID")).toHaveLength(1);
  });

  it("draws only the dash ranges of a broken element", () => {
    const made = mlineEntities(tags(1, [[0, 0, 40, 60], [-30, 0]]), { handle: "D", layer: "0" });
    const dashes = made.entities.filter((e) => e.handle.startsWith("D:e0."));
    expect(dashes.map((e) => e.vertices)).toEqual([[{ x: 0, y: 0 }, { x: 40, y: 0 }], [{ x: 60, y: 0 }, { x: 100, y: 0 }]]);
    expect(made.notes.join()).toContain("斷開段");
  });

  it("replaces the unsupported entity inside its block using the style table", () => {
    const dxf = ["0", "SECTION", "2", "OBJECTS", "0", "MLINESTYLE", "5", "1FF58", "2", "WALL", "70", "272", "62", "0", "71", "2", "49", "0.5", "62", "0", "6", "ByLayer", "49", "-0.5", "62", "0", "6", "ByLayer",
      "0", "ENDSEC", "0", "SECTION", "2", "BLOCKS", "0", "BLOCK", "2", "3", "0", "MLINE", ...tags().flatMap(([c, v]) => [String(c), v]), "0", "ENDBLK", "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [], blocks: { "3": { name: "3", entities: [] } }, cadUnsupported: { MLINE: 1 } }, dxf);
    expect(doc.blocks["3"].entities.map((e: any) => e.handle).sort()).toEqual(["2041A:e0", "2041A:e1", "2041A:end", "2041A:start"]);
    expect(doc.cadUnsupported.MLINE).toBeUndefined();
  });
});

describe("MLINE element colors in R2010+ files", () => {
  it("reads LibreDWG's element color 0 as BYLAYER when flagged unreliable", () => {
    const style = mlineStyleFromTags([[70, "0"], [71, "1"], [49, "0"], [62, "0"]]);
    const flagged = mlineEntities(tags(1, [[0, 0]]), { handle: "E", layer: "0", style, elementByBlockUnreliable: true }).entities[0];
    const plain = mlineEntities(tags(1, [[0, 0]]), { handle: "F", layer: "0", style }).entities[0];
    expect(flagged.colorIndex).toBeUndefined();
    expect(plain.colorIndex).toBe(0);
  });
});
