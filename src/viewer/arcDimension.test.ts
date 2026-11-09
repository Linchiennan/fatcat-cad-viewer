import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";

// scripts/patch-engineering.mjs reads ARC_DIMENSION (弧長標註) as a DIMENSION that draws its *D block
// (昭盛 建築套結構-1F 1789EF was listed as unsupported and left out; ZWCAD draws its *D576).
const dxf = (body: string) => ["0", "SECTION", "2", "ENTITIES", ...body.split("|"), "0", "ENDSEC", "0", "EOF"].join("\n");

describe("ARC_DIMENSION", () => {
  it("is read as a dimension with its block, not counted as unsupported", () => {
    const doc: any = new DxfParser().parseSync(dxf("0|ARC_DIMENSION|5|1789EF|8|DIM3|100|AcDbDimension|2|*D576|10|2538.9|20|3696.6|30|0|70|165|100|AcDbArcDimension|13|2678.5|23|3426|33|0|70|0"));
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0]).toMatchObject({ type: "DIMENSION", block: "*D576", layer: "DIM3", handle: "1789EF", cadDxfType: "ARC_DIMENSION" });
    expect(doc.cadUnsupported?.ARC_DIMENSION).toBeUndefined();
  });
});
