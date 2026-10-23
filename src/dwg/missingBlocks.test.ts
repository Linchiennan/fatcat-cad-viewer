import { describe, expect, it } from "vitest";
import { missingBlockNames, rebuildBlocks, viewerEntities } from "./missingBlocks";

const dxf = [
  "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "BLOCK_RECORD",
  "0", "BLOCK_RECORD", "5", "1F", "2", "*Model_Space", "0", "BLOCK_RECORD", "5", "575", "2", "JK12D2D", "0", "BLOCK_RECORD", "5", "580", "2", "門",
  "0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "BLOCKS",
  "0", "BLOCK", "8", "0", "2", "門", "70", "0", "0", "ENDBLK", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF",
].join("\n");

describe("blocks LibreDWG's DXF writer left out (拾山 16B+16C electrical symbols)", () => {
  it("finds block records without a definition", () => {
    expect(missingBlockNames(dxf)).toEqual(["JK12D2D"]);
  });

  it("rebuilds them in DxfParser's shape, with degrees for text and insert rotation", () => {
    const db = { tables: { BLOCK_RECORD: { entries: [{ name: "JK12D2D", handle: "575", flags: 66, basePoint: { x: 0, y: 0, z: 0 }, entities: [
      { type: "CIRCLE", handle: "579", layer: "0", colorIndex: 256, center: { x: 15, y: 0, z: 0 }, radius: 15 },
      { type: "TEXT", handle: "57A", layer: "0", colorIndex: 2, text: "浴", startPoint: { x: 9.75, y: -7.5 }, endPoint: { x: 15, y: 0 }, textHeight: 15, rotation: Math.PI / 2, xScale: 0.7, styleName: "GENIE", halign: 4, valign: 0 },
      { type: "LWPOLYLINE", handle: "57C", layer: "0", colorIndex: 256, flag: 512, vertices: [{ x: 0, y: -15, bulge: 0 }, { x: 30, y: -15, bulge: 0.5 }] },
      { type: "ATTDEF", handle: "57D", layer: "0", text: {}, tag: "KENCAD" },
    ] }] } } };
    const { blocks, skipped } = rebuildBlocks(db, ["JK12D2D"]);
    const b = blocks.JK12D2D;
    expect(skipped).toEqual({});
    expect(b.entities.map((e: any) => e.type)).toEqual(["CIRCLE", "TEXT", "LWPOLYLINE"]);
    expect(b.entities[1]).toMatchObject({ text: "浴", rotation: 90, xScale: 0.7, halign: 4, endPoint: { x: 15, y: 0 }, color: 0xffff00 });
    expect(b.entities[2]).toMatchObject({ shape: true, vertices: [{ x: 0, y: -15 }, { x: 30, y: -15, bulge: 0.5 }] });
  });

  it("keeps attribute values of nested inserts as ATTRIB entities", () => {
    const out = viewerEntities({ type: "INSERT", layer: "E", name: "JK29D2D", insertionPoint: { x: 1, y: 2 }, xScale: 1.2, yScale: 1.2, zScale: 1.2, rotation: Math.PI,
      attribs: [{ type: "ATTRIB", layer: "0", flags: 1, tag: "KENCAD", text: { text: "JK29D2D00", startPoint: { x: 1, y: 2 }, textHeight: 1.2, rotation: Math.PI, styleName: "AE", halign: 4 }, alignmentPoint: { x: 1, y: 2 } }] });
    expect(out[0]).toMatchObject({ type: "INSERT", name: "JK29D2D", position: { x: 1, y: 2 }, rotation: 180 });
    expect(out[1]).toMatchObject({ type: "ATTRIB", tag: "KENCAD", text: "JK29D2D00", hidden: true, textStyle: "AE" });
  });
});

import { applyReaderTexts, needsTextRecovery, readerTexts } from "./missingBlocks";
describe("text LibreDWG's DXF writer mis-decoded (15A 客變圖 R2004 Big5 MTEXT)", () => {
  const head = (cp: string, body: string) => `  0\nSECTION\n  2\nHEADER\n  9\n$DWGCODEPAGE\n  3\n${cp}\n  0\nENDSEC\n${body}`;
  const garbage = "107.03.06. QC  15A \U+015CepU:\P{\C6;p\U+043DGp\U+0733C";

  it("re-reads only Chinese-codepage drawings showing garbage escapes, not φ or real \U+ Chinese", () => {
    expect(needsTextRecovery(head("ANSI_950", garbage))).toBe(true);
    expect(needsTextRecovery(head("ANSI_1252", garbage))).toBe(false);
    expect(needsTextRecovery(head("ANSI_950", "\U+03C6100 \U+58C1\U+78DA \U+03B1"))).toBe(false);
  });

  it("replaces just the garbled entities with the reader's text", () => {
    const texts = readerTexts({ entities: [{ type: "MTEXT", handle: "34910D", text: "107.03.06. 五十七間堂  15A 戶變更內容如下:\n公浴" }, { type: "TEXT", handle: "A1", text: "正常" }] });
    expect(texts["34910D"]).toBe("107.03.06. 五十七間堂  15A 戶變更內容如下:\\P公浴"); // MTEXT paragraph code, not a bare P
    const doc = { entities: [{ type: "MTEXT", handle: "34910D", text: garbage }, { type: "TEXT", handle: "A1", text: "正常（DXF）" }], blocks: {} };
    expect(applyReaderTexts(doc, texts)).toBe(1);
    expect(doc.entities[0].text).toContain("五十七間堂");
    expect(doc.entities[1].text).toBe("正常（DXF）");
  });
});

import { headerArrowSize } from "./missingBlocks";
describe("dimensions and leaders inside rebuilt blocks (PARK FSA403 剖面詳圖)", () => {
  it("keeps a dimension drawn through its *D block", () => {
    const [d] = viewerEntities({ type: "DIMENSION", layer: "07-放樣標註", name: "*D14", dimensionType: 32, definitionPoint: { x: 1, y: 2 }, textPoint: { x: 3, y: 4 }, text: "", styleName: "D-S30AA", rotationAngle: Math.PI / 2 });
    expect(d).toMatchObject({ type: "DIMENSION", block: "*D14", anchorPoint: { x: 1, y: 2 }, middleOfText: { x: 3, y: 4 }, angle: 90 });
  });

  it("draws a leader as its line plus an arrow at the first vertex sized from the drawing header", () => {
    const out = viewerEntities({ type: "LEADER", layer: "16-材料標註", handle: "L1", isArrowheadEnabled: true, vertices: [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 50, y: 20 }] }, 30);
    expect(out.map((e) => e.type)).toEqual(["LWPOLYLINE", "SOLID"]);
    expect(out[1].points[0]).toMatchObject({ x: 0, y: 0 });
    expect(Math.abs(out[1].points[1].y - 30)).toBeLessThan(1e-9);
    expect(viewerEntities({ type: "LEADER", isArrowheadEnabled: false, vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toHaveLength(1);
  });

  it("reads DIMASZ × DIMSCALE from the header", () => {
    expect(headerArrowSize("  9\n$DIMASZ\n 40\n3.0\n  9\n$DIMSCALE\n 40\n10\n")).toBe(30);
    expect(headerArrowSize("  9\r\n$DIMASZ\r\n 40\r\n2.0\r\n")).toBe(2);
    expect(headerArrowSize("")).toBe(2.5);
  });
});

describe("blocks missing from the table altogether (建照 A2)", () => {
  it("also finds blocks an INSERT uses that have neither a definition nor a table record", () => {
    const text = ["0", "SECTION", "2", "BLOCKS", "0", "BLOCK", "2", "外框", "0", "INSERT", "2", "*U137", "0", "ENDBLK", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES", "0", "INSERT", "8", "0", "2", "A-UNIT-TF_B", "0", "INSERT", "2", "外框", "0", "ENDSEC", "0", "EOF"].join("\n");
    expect(missingBlockNames(text).sort()).toEqual(["*U137", "A-UNIT-TF_B"]);
  });
});
