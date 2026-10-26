import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { preserveCadMetadata } from "./cadDocument";
import { buildMeasurementGeometry } from "./measurementGeometry";
import { dimensionBlockOffset } from "./dimensionBlock";

// 超級圖庫 1050514-電氣及給排水零件: dynamic blocks, dimensions made inside blocks and flipped normals.

describe("hidden objects that are drawn as something else (dynamic block visibility states)", () => {
  it("keeps an MLINE of another visibility state hidden", () => {
    const tags = [[5, "9F20"], [8, "0"], [60, "1"], [2, "STANDARD"], [40, "1"], [70, "0"], [71, "1"], [72, "2"], [73, "2"],
      [10, "0"], [20, "0"], [30, "0"], [11, "0"], [21, "0"], [31, "0"], [12, "1"], [22, "0"], [32, "0"], [13, "0"], [23, "1"], [33, "0"], [74, "2"], [41, "0"], [41, "0"], [75, "0"], [74, "2"], [41, "0"], [41, "0"], [75, "0"],
      [11, "10"], [21, "0"], [31, "0"], [12, "1"], [22, "0"], [32, "0"], [13, "0"], [23, "1"], [33, "0"], [74, "2"], [41, "0"], [41, "0"], [75, "0"], [74, "2"], [41, "0"], [41, "0"], [75, "0"]];
    const dxf = ["0", "SECTION", "2", "BLOCKS", "0", "BLOCK", "2", "*U281", "0", "MLINE", ...tags.flatMap(([c, v]) => [String(c), String(v)]), "0", "ENDBLK", "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [], blocks: { "*U281": { name: "*U281", entities: [] } }, cadUnsupported: { MLINE: 1 } }, dxf);
    const made = doc.blocks["*U281"].entities;
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((e: any) => e.hidden === true)).toBe(true);
  });
});

describe("dimension blocks go to the dimension's group-12 point (BOX示意圖)", () => {
  const dim = { type: "DIMENSION", handle: "13387", block: "*D365", insertionPoint: { x: -6473.98, y: 400.63 } };
  it("reads the offset, zero when absent", () => {
    expect(dimensionBlockOffset(dim)).toEqual({ x: -6473.98, y: 400.63 });
    expect(dimensionBlockOffset({ type: "DIMENSION" })).toEqual({ x: 0, y: 0 });
  });
  it("indexes the block there, not 6,500 units away", () => {
    const g = buildMeasurementGeometry({
      blocks: { "*D365": { name: "*D365", entities: [{ type: "LINE", vertices: [{ x: 6464, y: -376 }, { x: 6473, y: -376 }] }] } },
      entities: [dim],
    });
    const b = g.entities[0].bounds;
    expect(b.minX).toBeCloseTo(6464 - 6473.98, 6);
    expect(b.minY).toBeCloseTo(-376 + 400.63, 6);
  });
});

describe("a downward normal turns over only what is drawn in its own coordinate system (閘閥)", () => {
  const down = { x: 0, y: -1.2e-16, z: -1 };
  it("leaves LINEs in world coordinates and turns CIRCLEs over", () => {
    const g = buildMeasurementGeometry({ blocks: {}, entities: [
      { type: "LINE", handle: "L", extrusionDirection: down, vertices: [{ x: 10.5, y: 16.7 }, { x: 38.6, y: 16.7 }] },
      { type: "CIRCLE", handle: "C", extrusionDirection: down, center: { x: -28.1, y: 16.7 }, radius: 5.7 },
    ] });
    const line = g.entities.find((e) => e.properties?.handle === "L")!, circle = g.entities.find((e) => e.properties?.handle === "C")!;
    expect(line.bounds.minX).toBeCloseTo(10.5, 6);
    expect((circle.bounds.minX + circle.bounds.maxX) / 2).toBeCloseTo(28.1, 6);
  });
  it("indexes an ELLIPSE with that normal, its angles running clockwise", () => {
    const g = buildMeasurementGeometry({ blocks: {}, entities: [
      { type: "ELLIPSE", handle: "E", extrusionDirection: down, center: { x: 0, y: 0 }, majorAxisEndPoint: { x: 10, y: 0 }, axisRatio: 0.5, startAngle: 0, endAngle: Math.PI / 2 },
    ] });
    const e = g.entities.find((x) => x.properties?.handle === "E")!;
    expect(e).toBeTruthy();
    expect(e.bounds.maxY).toBeLessThan(1e-6); // a quarter from 0 to 90° clockwise lies below the major axis
    expect(e.bounds.minY).toBeCloseTo(-5, 3);
  });
});

describe("HATCH extrusion (group 210)", () => {
  it("is read, so a flipped hatch turns over with its boundary circle", () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "HATCH", "5", "1363C", "8", "0", "2", "SOLID", "70", "1", "71", "1",
      "91", "0", "75", "0", "76", "1", "98", "0", "210", "0", "220", "0", "230", "-1", "0", "ENDSEC", "0", "EOF"].join("\n");
    const parsed: any = new DxfParser().parseSync(dxf);
    expect(parsed.entities[0].extrusionDirection).toMatchObject({ z: -1 });
  });
});
