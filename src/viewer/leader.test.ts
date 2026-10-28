import { describe, expect, it } from "vitest";
import { arrowKind, arrowheadEntities, leaderEntities } from "./leader";
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

  it("omits the arrow when 71 is off and approximates spline leaders with a note", () => {
    expect(leaderEntities(tags([], "0"), { handle: "B", layer: "0" }).entities.map((e) => e.type)).toEqual(["LWPOLYLINE"]);
    const spline = leaderEntities(tags().map(([c, v]) => [c, c === 72 ? "1" : v]), { handle: "C", layer: "0" });
    expect(spline.notes.join()).toContain("曲線引線");
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

  it("replaces the unsupported entity using the DIMSTYLE table and block records", () => {
    const dxf = ["0", "SECTION", "2", "TABLES", "0", "BLOCK_RECORD", "5", "AB", "2", "_DOT", "0", "DIMSTYLE", "2", "taddd", "41", "0.05", "40", "150", "341", "AB",
      "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "LEADER", ...tags().slice(0, 22).flatMap(([c, v]) => [String(c), v]), "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [], blocks: {}, cadUnsupported: { LEADER: 1 } }, dxf);
    expect(doc.entities.filter((e: any) => e.type === "SOLID")).toHaveLength(12);
    expect(doc.entities.find((e: any) => e.type === "LWPOLYLINE").cadSpace).toBe("Model");
    expect(doc.cadUnsupported.LEADER).toBeUndefined();
  });
});
