import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { annotateDxfXclips, parseDxfXclip, transformClipBoundary, XCLIP_APP } from "./xclipMetadata";

const enc = (lines: (string | number)[], eol = "\r\n") => new TextEncoder().encode(lines.join(eol) + eol);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** INSERT 1F → xdict 2A → ACAD_FILTER 2B → SPATIAL 2C (SPATIAL_FILTER). */
function drawing(points: [number, number][], matrix: number[] = [], extra: (string | number)[] = [], enabled = 1) {
  return [
    0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 2, "B", 10, 0, 20, 0, 0, "LINE", 8, "0", 10, 0, 20, 0, 11, 10, 21, 0, 0, "ENDBLK", 0, "ENDSEC",
    0, "SECTION", 2, "ENTITIES",
    0, "INSERT", 5, "1F", 102, "{ACAD_XDICTIONARY", 360, "2a", 102, "}", 8, "0", 2, "B", 10, 0, 20, 0, ...extra,
    0, "LINE", 5, "20", 8, "0", 10, 0, 20, 0, 11, 1, 21, 1,
    0, "ENDSEC", 0, "SECTION", 2, "OBJECTS",
    0, "DICTIONARY", 5, "2A", 3, "ACAD_FILTER", 360, "2B",
    0, "DICTIONARY", 5, "2B", 3, "SPATIAL", 360, "2C",
    0, "SPATIAL_FILTER", 5, "2C", 70, points.length, ...points.flatMap(([x, y]) => [10, x, 20, y]), 71, enabled, ...matrix.flatMap((v) => [40, v]),
    0, "ENDSEC", 0, "EOF",
  ];
}

describe("XCLIP metadata (T13 4.4)", () => {
  it("puts the boundary on the INSERT so the parsed entity carries it", () => {
    const out = annotateDxfXclips(enc(drawing([[0, 0], [4, 0], [4, 4], [0, 4]])));
    const doc = new DxfParser().parseSync(dec(out));
    const insert = doc.entities.find((e: any) => e.type === "INSERT");
    expect(parseDxfXclip(insert)).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
    expect(doc.entities.find((e: any) => e.type === "LINE").handle).toBe("20");
  });

  it("is idempotent: a second run adds nothing", () => {
    const once = annotateDxfXclips(enc(drawing([[0, 0], [4, 4]])));
    const twice = annotateDxfXclips(once);
    expect(dec(twice)).toBe(dec(once));
    expect(dec(once).split(XCLIP_APP).length - 1).toBe(1);
  });

  it("expands a 2-point rectangle and applies the first of the last two matrices", () => {
    // first matrix: x' = 2x + 10, y' = 3y + 20; second matrix = identity (ignored).
    const first = [2, 0, 0, 10, 0, 3, 0, 20, 0, 0, 1, 0], second = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const out = annotateDxfXclips(enc(drawing([[0, 0], [1, 1]], [...first, ...second])));
    const insert = new DxfParser().parseSync(dec(out)).entities.find((e: any) => e.type === "INSERT");
    expect(parseDxfXclip(insert)).toEqual([{ x: 10, y: 20 }, { x: 12, y: 20 }, { x: 12, y: 23 }, { x: 10, y: 23 }]);
    expect(transformClipBoundary([{ x: 1, y: 1 }, { x: 2, y: 2 }], [1, 2])).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it("keeps every other byte, line ends of LF files included", () => {
    const source = enc(drawing([[0, 0], [4, 4]]), "\n");
    const out = dec(annotateDxfXclips(source)), before = dec(source);
    const at = out.indexOf("1001\r\n");
    expect(out.slice(0, at)).toBe(before.slice(0, at));
    expect(out.slice(out.indexOf("1070\r\n0\r\n") + 9)).toBe(before.slice(at));
  });

  it("skips disabled filters, one-point boundaries and drawings without filters", () => {
    expect(dec(annotateDxfXclips(enc(drawing([[0, 0], [4, 4]], [], [], 0))))).not.toContain(XCLIP_APP);
    expect(dec(annotateDxfXclips(enc(drawing([[0, 0]]))))).not.toContain(XCLIP_APP);
    const plain = enc([0, "SECTION", 2, "ENTITIES", 0, "ENDSEC", 0, "EOF"]);
    expect(annotateDxfXclips(plain)).toBe(plain);
  });

  it("reads boundaries back strictly", () => {
    const e = (value: string) => ({ xdata: { [XCLIP_APP]: { values: [{ code: 1000, value }, { code: 1070, value: 0 }] } } });
    expect(parseDxfXclip(e("1,2;3,4"))).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(parseDxfXclip(e("1,2"))).toBeNull();
    expect(parseDxfXclip(e("1,2;x,4"))).toBeNull();
    expect(parseDxfXclip(e("1,2;Infinity,4"))).toBeNull();
    expect(parseDxfXclip({})).toBeNull();
    expect(parseDxfXclip(null)).toBeNull();
  });
});
