import { describe, expect, it } from "vitest";
import { arrowKind, arrowheadEntities, clampedSpline, leaderEntities } from "./leader";
import { preserveCadMetadata } from "./cadDocument";

// Layout of a real LEADER from the 16C sheet (style taddd, arrow on, two vertices, DSTYLE override of DIMASZ).
const tags = (extra: [number, string][] = [], arrow = "1"): [number, string][] => [
  [5, "1CAE9"], [8, "A-NOTE"], [3, "taddd"], [71, arrow], [73, "3"], [72, "0"], [74, "1"], [40, "0"], [41, "0"], [76, "2"],
  [10, "100"], [20, "50"], [30, "0"], [10, "55"], [20, "50"], [30, "0"], [210, "0"], [220, "0"], [230, "1"], [211, "-1"], [221, "0"], [231, "0"],
  [1001, "ACAD"], [1000, "DSTYLE"], [1002, "{"], ...extra, [1002, "}"],
];
const arrowLength = (e: any) => { const [t, a, b] = e.points; return Math.hypot((a.x + b.x) / 2 - t.x, (a.y + b.y) / 2 - t.y); };

describe("legacy LEADER display", () => {
  it("draws the leader and a closed arrow sized DIMASZ × DIMSCALE from the style", () => {
    const { entities, notes } = leaderEntities(tags(), { handle: "1CAE9", layer: "A-NOTE", style: { asz: 0.05, scale: 150 } });
    expect(notes).toEqual([]);
    expect(entities[0]).toMatchObject({ type: "LWPOLYLINE", layer: "A-NOTE", vertices: [{ x: 100, y: 50 }, { x: 55, y: 50 }] });
    const arrow = entities.find((e) => e.type === "SOLID");
    expect(arrow.points[0]).toMatchObject({ x: 100, y: 50 });
    expect(arrowLength(arrow)).toBeCloseTo(7.5, 9);
    expect((arrow.points[1].x + arrow.points[2].x) / 2).toBeCloseTo(92.5, 9);
  });

  it("prefers per-entity DSTYLE overrides and treats DIMSCALE 0 as 1", () => {
    const sized = leaderEntities(tags([[1070, "41"], [1040, "4"], [1070, "40"], [1040, "0"]]), { handle: "A", layer: "0", style: { asz: 0.05, scale: 150 } });
    expect(arrowLength(sized.entities.find((e) => e.type === "SOLID"))).toBeCloseTo(4, 9);
  });

  it("leaves the arrow off when the first segment is shorter than twice its size, as CAD does (W05 水箱給水)", () => {
    // first segment 45 long: DIMASZ 22.5 still draws, 22.6 does not
    const at = (size: string) => leaderEntities(tags([[1070, "41"], [1040, size], [1070, "40"], [1040, "1"]]), { handle: "D", layer: "0" }).entities.map((e) => e.type);
    expect(at("22.5")).toContain("SOLID");
    expect(at("22.6")).toEqual(["LWPOLYLINE"]);
  });

  it("draws the CAD-default arrow with a note when the file version's arrow flag is unreliable", () => {
    const made = leaderEntities(tags([], "0"), { handle: "E", layer: "0", arrowFlagUnreliable: true });
    expect(made.entities.some((e) => e.type === "SOLID")).toBe(true);
    expect(made.notes.join()).toContain("箭頭開關解析不可靠");
  });

  it("omits the arrow when 71 is off and draws spline leaders as a curve without a note", () => {
    expect(leaderEntities(tags([], "0"), { handle: "B", layer: "0" }).entities.map((e) => e.type)).toEqual(["LWPOLYLINE"]);
    const spline = leaderEntities(tags().map(([c, v]) => [c, c === 72 ? "1" : v]), { handle: "C", layer: "0" });
    expect(spline.notes.join()).not.toContain("曲線引線");
  });

  it("spline leaves the arrow along the first segment and ends along the last, through every vertex (ZWCAD 379C7D)", () => {
    const ps = [{ x: -20826.56, y: 8199.36 }, { x: -20809.28, y: 8209.72 }, { x: -20789.24, y: 8240 }];
    const out = clampedSpline(ps);
    expect(out[0]).toEqual(ps[0]); expect(out[16]).toEqual(ps[1]); expect(out.at(-1)).toEqual(ps[2]);
    const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
    expect(dir(out[0], out[1])).toBeCloseTo(dir(ps[0], ps[1]), 1);
    expect(dir(out.at(-2)!, out.at(-1)!)).toBeCloseTo(dir(ps[1], ps[2]), 1);
  });

  it("maps arrow block names and draws each kind", () => {
    expect(arrowKind(undefined)).toEqual({ kind: "closed", known: true });
    expect(arrowKind("_None").kind).toBe("none");
    expect(arrowKind("_ArchTick").kind).toBe("tick");
    expect(arrowKind("MyArrow")).toEqual({ kind: "closed", known: false });
    const tip = { x: 0, y: 0 }, from = { x: -10, y: 0 }, common = { layer: "0" };
    expect(arrowheadEntities("none", tip, from, 2, common, "h")).toEqual([]);
    expect(arrowheadEntities("dot", tip, from, 2, common, "h")).toHaveLength(12);
    expect(arrowheadEntities("open", tip, from, 2, common, "h")[0].vertices[1]).toEqual({ x: 0, y: 0 });
    const custom = leaderEntities(tags([[1070, "341"], [1005, "AB"]]), { handle: "D", layer: "0", blockName: () => "MyArrow" });
    expect(custom.notes.join()).toContain("以實心箭頭近似");
  });

  it("bends into the last point along the hook line (惠宇敦南 B4F-EE1: 75=1, 74=0, horizontal 0,-1, arrow 3×7)", () => {
    const hooked: [number, string][] = [
      [5, "4B930"], [8, "DIM"], [3, "standard"], [71, "1"], [73, "0"], [72, "0"], [74, "0"], [75, "1"], [76, "2"],
      [10, "-59715.87"], [20, "-27074.53"], [30, "0"], [10, "-59673.31"], [20, "-27122.49"], [30, "0"], [211, "0"], [221, "-1"], [231, "0"],
      [1001, "ACAD"], [1000, "DSTYLE"], [1002, "{"], [1070, "40"], [1040, "7"], [1070, "41"], [1040, "3"], [1002, "}"],
    ];
    const line = leaderEntities(hooked, { handle: "4B930", layer: "DIM" }).entities[0];
    expect(line.vertices).toHaveLength(3);
    expect(line.vertices[1].x).toBeCloseTo(-59673.31, 6);
    expect(line.vertices[1].y).toBeCloseTo(-27122.49 + 21, 6);
    expect(leaderEntities(tags(), { handle: "1CAE9", layer: "A-NOTE" }).entities[0].vertices).toHaveLength(2);
  });

  it("inserts a user arrow block at the tip when the drawing defines it (惠宇敦南 B4F-EE1 天正 taddot)", () => {
    const made = leaderEntities(tags([[1070, "341"], [1005, "AB"], [1070, "41"], [1040, "3"], [1070, "40"], [1040, "7"]]), { handle: "D", layer: "DIM", blockName: () => "taddot", hasBlock: (n) => n === "taddot" });
    expect(made.notes.join()).not.toContain("以實心箭頭近似");
    const arrow = made.entities.find((e) => e.type === "INSERT");
    expect(arrow).toMatchObject({ name: "taddot", layer: "DIM", xScale: 21, yScale: 21 });
    expect(arrow.position).toMatchObject(made.entities[0].vertices[0]);
  });

  it("replaces the unsupported entity using the DIMSTYLE table and block records", () => {
    const dxf = ["0", "SECTION", "2", "TABLES", "0", "BLOCK_RECORD", "5", "AB", "2", "_DOT", "0", "DIMSTYLE", "2", "taddd", "41", "0.05", "40", "150", "341", "AB",
      "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LEADER", ...tags().slice(0, 22).flatMap(([c, v]) => [String(c), v]), "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [], blocks: {}, cadUnsupported: { LEADER: 1 } }, dxf);
    expect(doc.entities.filter((e: any) => e.type === "SOLID")).toHaveLength(12);
    expect(doc.entities.find((e: any) => e.type === "LWPOLYLINE").cadSpace).toBe("Model");
    expect(doc.cadUnsupported.LEADER).toBeUndefined();
  });
});

describe("spline leaders (喬瓏 鑫元鴻 天花板套圖-廠房-2F)", () => {
  it("run smoothly through every vertex instead of straight segments", () => {
    const pts: [number, string][] = [[10, "0"], [20, "0"], [30, "0"], [10, "10"], [20, "10"], [30, "0"], [10, "20"], [20, "0"], [30, "0"]];
    const t: [number, string][] = [[5, "S"], [8, "0"], [71, "0"], [72, "1"], [76, "3"], ...pts];
    const line = leaderEntities(t, { handle: "S", layer: "0" }).entities[0];
    expect(line.vertices.length).toBeGreaterThan(20);
    for (const p of [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]) expect(line.vertices.some((q: any) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9)).toBe(true);
    // the first span bows off its chord (y = x) like a curve does
    expect(Math.max(...line.vertices.filter((q: any) => q.x > 0 && q.x < 10).map((q: any) => Math.abs(q.y - q.x)))).toBeGreaterThan(0.5);
  });
});
