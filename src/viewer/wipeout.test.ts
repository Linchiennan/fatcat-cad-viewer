import { describe, expect, it } from "vitest";
import { applyWipeouts, segmentOutside, wipeoutPolygon } from "./wipeout";
import { preserveCadMetadata } from "./cadDocument";

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const line = (handle: string, y: number, extra: Record<string, unknown> = {}) => ({ type: "LINE", handle, layer: "0", cadSpace: "Model", vertices: [{ x: -5, y }, { x: 15, y }], ...extra });
const wipe = (handle: string, extra: Record<string, unknown> = {}) => ({ type: "WIPEOUT", handle, layer: "M", colorIndex: 8, polygon: square, cadSpace: "Model", ...extra });
const byHandle = (e: any) => parseInt(String(e.handle), 16);

describe("WIPEOUT masking", () => {
  it("maps the 1×1 pixel boundary (y down, centered) through U and V", () => {
    const poly = wipeoutPolygon({ position: { x: 100, y: 200 }, u: { x: 10, y: 0 }, v: { x: 0, y: 4 }, clip: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: 0.5 }] });
    expect(poly).toEqual([{ x: 100, y: 204 }, { x: 110, y: 204 }, { x: 110, y: 200 }, { x: 100, y: 200 }]);
  });

  it("keeps only the parts of a segment outside the polygon", () => {
    expect(segmentOutside({ x: -5, y: 5 }, { x: 15, y: 5 }, square)).toEqual([[{ x: -5, y: 5 }, { x: 0, y: 5 }], [{ x: 10, y: 5 }, { x: 15, y: 5 }]]);
    expect(segmentOutside({ x: 2, y: 2 }, { x: 8, y: 8 }, square)).toEqual([]);
    expect(segmentOutside({ x: -5, y: 20 }, { x: 15, y: 20 }, square)).toHaveLength(1);
  });

  it("cuts earlier lines, leaves later ones whole and draws the frame", () => {
    const skipped = new Map<string, number>();
    const out = applyWipeouts([line("10", 5), wipe("20"), line("30", 6)], byHandle, true, skipped);
    const earlier = out.filter((e) => e.handle === "10" || e.handle === "10:w1");
    expect(earlier.map((e) => e.vertices)).toEqual([[{ x: -5, y: 5 }, { x: 0, y: 5 }], [{ x: 10, y: 5 }, { x: 15, y: 5 }]]);
    expect(out.find((e) => e.handle === "30").vertices).toEqual([{ x: -5, y: 6 }, { x: 15, y: 6 }]);
    expect(out.find((e) => e.handle === "20:frame")).toMatchObject({ shape: true, layer: "M" });
    expect(out.some((e) => e.type === "WIPEOUT")).toBe(false);
  });

  it("follows the draw-order table instead of handle order and ignores other spaces", () => {
    const sort = new Map([["30", 0x05]]);
    const order = (e: any) => sort.get(String(e.handle)) ?? byHandle(e);
    const out = applyWipeouts([line("30", 5), line("40", 5, { cadSpace: "配置1" }), wipe("20")], order, false, new Map());
    expect(out.filter((e) => String(e.handle).startsWith("30"))).toHaveLength(2);
    expect(out.find((e) => e.handle === "40").vertices).toHaveLength(2);
    expect(out.some((e) => String(e.handle).endsWith(":frame"))).toBe(false);
  });

  it("counts earlier objects it cannot cut instead of hiding them silently", () => {
    const skipped = new Map<string, number>();
    applyWipeouts([{ type: "TEXT", handle: "10", cadSpace: "Model", position: { x: 5, y: 5 } }, wipe("20")], byHandle, true, skipped);
    expect(skipped.get("TEXT")).toBe(1);
  });

  it("reads WIPEOUT records, draw order and the frame setting from the DXF", () => {
    const dxf = ["0", "SECTION", "2", "OBJECTS", "0", "WIPEOUTVARIABLES", "5", "F1", "70", "0", "0", "SORTENTSTABLE", "5", "18", "331", "A1", "5", "B9",
      "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
      "0", "WIPEOUT", "5", "B0", "8", "M", "62", "8", "10", "0", "20", "0", "30", "0", "11", "10", "21", "0", "31", "0", "12", "0", "22", "10", "32", "0", "13", "1", "23", "1", "14", "-0.5", "24", "-0.5", "14", "0.5", "24", "0.5",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    const doc: any = preserveCadMetadata({ entities: [line("A1", 5), line("A2", 5)], blocks: {}, cadUnsupported: { WIPEOUT: 1 } }, dxf);
    // A1 is sorted after the wipeout (B9 > B0) so it stays whole; A2 (before B0) is cut; frame off.
    expect(doc.entities.filter((e: any) => String(e.handle).startsWith("A1"))).toHaveLength(1);
    expect(doc.entities.filter((e: any) => String(e.handle).startsWith("A2"))).toHaveLength(2);
    expect(doc.entities.some((e: any) => String(e.handle).endsWith(":frame"))).toBe(false);
    expect(doc.cadUnsupported.WIPEOUT).toBeUndefined();
  });
});

describe("WIPEOUT boundary handling", () => {
  it("leaves lines lying on either edge of the wipeout whole", () => {
    const left = { type: "LINE", handle: "10", cadSpace: "Model", vertices: [{ x: 0, y: -5 }, { x: 0, y: 15 }] };
    const right = { type: "LINE", handle: "11", cadSpace: "Model", vertices: [{ x: 10, y: -5 }, { x: 10, y: 15 }] };
    const out = applyWipeouts([left, right, wipe("20")], byHandle, false, new Map());
    expect(out.find((e) => e.handle === "10").vertices).toHaveLength(2);
    expect(out.find((e) => e.handle === "11").vertices).toHaveLength(2);
    expect(out.some((e) => String(e.handle).includes(":w"))).toBe(false);
  });
});
