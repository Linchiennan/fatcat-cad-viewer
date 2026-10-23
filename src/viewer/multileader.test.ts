import { describe, expect, it } from "vitest";
import { multileaderEntities } from "./multileader";
import { preserveCadMetadata } from "./cadDocument";

// Same group-code layout as a real MLEADER written by LibreDWG (TOTO sheet), with test text.
const tags = (overrides: Record<number, string> = {}): [number, string][] => [
  [5, "49FC"], [8, "0"], [100, "AcDbMLeader"], [300, "CONTEXT_DATA{"], [40, "1.0"], [10, "96.4"], [20, "42.9"], [30, "0"],
  [41, "3.0"], [140, "2.0"], [145, "2.0"], [290, "1"], [304, "測試引線"], [11, "0"], [21, "0"], [31, "1"], [340, "11"],
  [12, "125.9"], [22, "44.5"], [32, "0"], [13, "1"], [23, "0"], [33, "0"], [42, "0"], [43, "0"], [45, "1"], [171, "3"],
  [302, "LEADER{"], [290, "1"], [291, "1"], [10, "128.8"], [20, "40.9"], [30, "0"], [11, "-1"], [21, "0"], [31, "0"], [90, "0"], [40, "0.9"],
  [304, "LEADER_LINE{"], [10, "142.6"], [20, "60.0"], [30, "0"], [91, "0"], [305, "}"], [303, "}"], [301, "}"],
  [340, "5C"], [170, String(overrides[170] ?? 1)], [290, "1"], [291, "1"], [41, "0.36"], [42, "2.0"], [172, String(overrides[172] ?? 2)],
];

describe("MULTILEADER display", () => {
  it("draws the leader through the landing, a filled arrow at the tip and the MTEXT", () => {
    const { entities, notes } = multileaderEntities(tags(), { handle: "49FC", layer: "0", styleName: (h) => (h === "11" ? "CONVERTER_1" : undefined) });
    expect(notes).toEqual([]);
    const line = entities.find((e) => e.type === "LWPOLYLINE");
    expect(line.vertices).toEqual([{ x: 142.6, y: 60 }, { x: 128.8, y: 40.9 }, { x: 127.9, y: 40.9 }].map((p) => ({ x: expect.closeTo(p.x, 9), y: expect.closeTo(p.y, 9) })));
    const arrow = entities.find((e) => e.type === "SOLID");
    expect(arrow.points[0]).toMatchObject({ x: 142.6, y: 60 });
    const back = { x: (arrow.points[1].x + arrow.points[2].x) / 2, y: (arrow.points[1].y + arrow.points[2].y) / 2 };
    expect(Math.hypot(back.x - 142.6, back.y - 60)).toBeCloseTo(2, 9);
    expect(entities.find((e) => e.type === "MTEXT")).toMatchObject({ text: "測試引線", position: { x: 125.9, y: 44.5 }, height: 3, attachmentPoint: 3, styleName: "CONVERTER_1" });
  });

  it("explains block content and spline leaders, and hides invisible leaders", () => {
    expect(multileaderEntities(tags({ 172: "1" }), { handle: "A", layer: "0" }).notes.join()).toContain("圖塊內容尚未支援");
    expect(multileaderEntities(tags({ 170: "2" }), { handle: "B", layer: "0" }).notes.join()).toContain("曲線引線");
    const invisible = multileaderEntities(tags({ 170: "0" }), { handle: "C", layer: "0" }).entities;
    expect(invisible.map((e) => e.type)).toEqual(["MTEXT"]);
  });

  it("replaces the unsupported entity in the parsed drawing", () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "MULTILEADER", ...tags().flatMap(([c, v]) => [String(c), v]), "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [], blocks: {}, cadUnsupported: { MULTILEADER: 1 } }, dxf);
    expect(doc.entities.map((e: any) => e.type).sort()).toEqual(["LWPOLYLINE", "MTEXT", "SOLID"]);
    expect(doc.entities.every((e: any) => e.cadSpace === "Model")).toBe(true);
    expect(doc.cadUnsupported.MULTILEADER).toBeUndefined();
  });
});
