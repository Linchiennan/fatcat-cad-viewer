import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { preserveCadMetadata } from "./cadDocument";

const dxf = [
  "0", "SECTION", "2", "HEADER", "9", "$EXTMIN", "10", "0", "20", "0", "9", "$EXTMAX", "10", "300", "20", "400", "0", "ENDSEC",
  "0", "SECTION", "2", "BLOCKS", "0", "BLOCK", "8", "0", "2", "*T1", "70", "1", "10", "0", "20", "0", "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "50", "21", "0", "0", "ENDBLK", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "TRACE", "5", "A1", "8", "牆", "62", "1", "10", "0", "20", "0", "11", "10", "21", "0", "12", "0", "22", "5", "13", "10", "23", "5",
  "0", "XLINE", "5", "A2", "8", "軸線", "10", "100", "20", "100", "11", "1", "21", "0",
  "0", "ACAD_TABLE", "5", "A3", "8", "表", "2", "*T1", "10", "500", "20", "600",
  "0", "ENDSEC", "0", "EOF", "",
].join("\n");

describe("TRACE, XLINE and ACAD_TABLE (PARK 外牆剖、模板套圖、建照 A2)", () => {
  const doc: any = preserveCadMetadata(new DxfParser().parseSync(dxf), dxf);
  const byHandle = (h: string) => doc.entities.find((e: any) => e.handle === h);

  it("draws a TRACE as a filled quadrilateral", () => {
    expect(byHandle("A1")).toMatchObject({ type: "SOLID", layer: "牆", colorIndex: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }] });
  });

  it("draws an XLINE through its point, well past the drawing extents both ways", () => {
    const [a, b] = byHandle("A2").vertices;
    expect(a.y).toBe(100); expect(b.y).toBe(100);
    expect(a.x).toBeLessThan(-1000); expect(b.x).toBeGreaterThan(1000);
  });

  it("shows a table through the block CAD saved for it", () => {
    expect(byHandle("A3")).toMatchObject({ type: "INSERT", name: "*T1", position: { x: 500, y: 600 } });
    expect(doc.cadUnsupported?.TRACE).toBeUndefined();
    expect(doc.cadUnsupported?.ACAD_TABLE).toBeUndefined();
  });
});
