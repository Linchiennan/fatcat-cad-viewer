import { describe, expect, it } from "vitest";
import { Vector2 } from "three";
import { bigFontFile, bigFontFit, bigFontPitch, fallbackMetrics, fittedShape, pitchedShape } from "./shxBigFontMetrics";

// Bundled outline glyph stand-in: a full-width square 1.389 text heights wide.
const glyph = () => ({
  advance: 1.389, bounds: { xMin: 0.1, xMax: 1.3, yMin: -0.1, yMax: 1.1 }, indices: [0, 1, 2],
  vertices: [new Vector2(0.1, 0), new Vector2(1.3, 0), new Vector2(1.3, 1)],
  GetVertices(this: any, p: { x: number; y: number }, size: number) { return this.vertices.map((v: Vector2) => v.clone().multiplyScalar(size).add(p)); },
});

describe("SHX big font fallback pitch", () => {
  it("knows the pitch of big fonts by file name, with or without path or extension", () => {
    expect(bigFontPitch("genie")).toBe(1.25);
    expect(bigFontPitch("C:\\fonts\\CHINESET.SHX")).toBe(1);
    expect(bigFontPitch("unknown.shx")).toBe(1.25);
  });

  it("applies only to SHX styles that name a big font", () => {
    expect(fallbackMetrics({ font: "romans", bigFont: "genie" })?.cjk).toBe(1.25);
    expect(fallbackMetrics({ font: "kaiu.ttf" })).toBeNull();
    expect(fallbackMetrics({ font: "romans.shx", bigFont: "" })?.cjk).toBeNull();
    expect(fallbackMetrics({ font: "", bigFont: "" })).toBeNull();
  });

  it("narrows a Chinese glyph to the GENIE pitch so table lines keep their CAD length (鴻群消防法令表格)", () => {
    const g = glyph(), s = pitchedShape("設", g, 1.25);
    expect(s.advance).toBe(1.25);
    expect(s.vertices![1].x).toBeCloseTo(1.3 * 1.25 / 1.389, 9);
    expect(s.bounds!.xMax).toBeCloseTo(1.3 * 1.25 / 1.389, 9);
    expect(s.GetVertices({ x: 10, y: 0 }, 2)[1].x).toBeCloseTo(10 + 2 * 1.3 * 1.25 / 1.389, 9);
    expect(g.vertices[1].x).toBe(1.3); // the cached original glyph is untouched
  });

  it("stands Chinese glyphs where each big font draws them (t4 鴻群: CHINA lines ran into each other)", () => {
    const [cs, cl] = bigFontFit("\\RUBON\\CHINA"), [gs, gl] = bigFontFit("genie");
    // the outline font's Chinese span (-0.111 to 1.167 text heights) lands on the big font's span
    expect(-0.111 * cs + cl).toBeCloseTo(0.042, 6);
    expect(1.167 * cs + cl).toBeCloseTo(0.958, 6);
    expect(-0.111 * gs + gl).toBeCloseTo(-0.1, 6);
    expect(1.167 * gs + gl).toBeCloseTo(1.075, 6);
    const m = fallbackMetrics({ font: "c2", bigFont: "china" })!;
    const s = fittedShape("設", glyph(), m);
    expect(s.vertices![2].y).toBeCloseTo(1 * cs + cl, 9);
    expect(s.bounds!.yMax).toBeCloseTo(1.1 * cs + cl, 9);
    expect(fittedShape("m", glyph(), m).vertices![2].y).toBe(1); // Latin keeps its height
  });

  it("leaves Latin glyphs alone", () => {
    const g = { ...glyph(), advance: 0.6 };
    expect(pitchedShape("A", g, 1.25)).toBe(g);
  });
});

import { verticalPitch, verticalTextEntities } from "./shxBigFontMetrics";
describe("vertical SHX text (鴻群消防栓動作流程圖)", () => {
  it("uses the big font's vertical pitch only on vertical SHX styles that have vertical shapes", () => {
    expect(verticalPitch({ font: "romans", bigFont: "genie", standardFlag: 4 })).toBe(1.438);
    expect(verticalPitch({ font: "romans", bigFont: "genie", standardFlag: 0 })).toBeNull();
    expect(verticalPitch({ font: "kaiu.ttf", standardFlag: 4 })).toBeNull();
    expect(verticalPitch({ font: "romans", bigFont: "chs.shx", standardFlag: 4 })).toBeNull();
    // ZWCAD 實測（zw_vertical_probe.py）：china 直寫同 chineset；acadchn6、dayump、lu、visiohg 維持橫寫
    expect(verticalPitch({ font: "romans.shx", bigFont: "china.shx", standardFlag: 4 })).toBe(1.125);
    for (const big of ["acadchn6.shx", "dayump.shx", "lu.shx", "visiohg.shx"]) expect(verticalPitch({ font: "romans.shx", bigFont: big, standardFlag: 4 })).toBeNull();
  });

  it("stacks 由人發現 downward, centred on the alignment point in the middle of its box", () => {
    const e = { text: "由人發現", textHeight: 31.47, halign: 4, valign: 0, startPoint: { x: 37345.88, y: -13405.67 }, endPoint: { x: 37345.88, y: -13495.97 } };
    const out = verticalTextEntities(e, 1.438);
    expect(out.map((c) => c.text)).toEqual(["由", "人", "發", "現"]);
    const ys = out.map((c) => c.endPoint!.y), step = 1.438 * 31.47;
    expect((ys[0] + ys[3]) / 2).toBeCloseTo(-13495.97, 6);
    expect(ys[0] - ys[1]).toBeCloseTo(step, 6);
    expect(out.every((c) => c.endPoint!.x === 37345.88 && c.halign === 4)).toBe(true);
    // CAD's own insertion point is the column top: half a pitch above the first character's centre.
    expect(ys[0] + step / 2).toBeCloseTo(e.startPoint.y, -1);
  });

  it("starts at the insertion point for left-justified text and follows rotation", () => {
    const out = verticalTextEntities({ text: "是否", textHeight: 10, rotation: 90, startPoint: { x: 0, y: 0 }, endPoint: undefined as { x: number; y: number } | undefined }, 1.5);
    expect(out[0].endPoint!.x).toBeCloseTo(7.5, 9);
    expect(out[1].endPoint!.x).toBeCloseTo(22.5, 9);
    expect(out[1].endPoint!.y).toBeCloseTo(0, 9);
  });

  it("keeps %% codes as one character", () => {
    expect(verticalTextEntities({ text: "90%%d", textHeight: 1, startPoint: { x: 0, y: 0 } }, 1).map((c) => c.text)).toEqual(["9", "0", "°"]);
  });
});

describe("SHX Latin fallback width (鴻群 8.34m³、摩擦損失(h3)=)", () => {
  it("re-spaces Latin letters to the romans advance without stretching them", () => {
    const m = fallbackMetrics({ font: "romans", bigFont: "genie" })!;
    const g = { ...glyph(), advance: 0.5, bounds: { xMin: 0.05, xMax: 0.45, yMin: 0, yMax: 0.7 }, vertices: [new Vector2(0.05, 0), new Vector2(0.45, 0.7)] };
    const s = fittedShape("m", g, m);
    expect(s.advance).toBeCloseTo(m.latin!["m".charCodeAt(0) - 32] / 1000, 9);
    const dx = (s.advance - 0.5) / 2;
    expect(s.vertices![1].x - s.vertices![0].x).toBeCloseTo(0.4, 9); // same letter width
    expect(s.vertices![0].x).toBeCloseTo(0.05 + dx, 9);
  });

  it("makes the romans line as long as CAD draws it, so the separate ³ sits right after m", () => {
    const m = fallbackMetrics({ font: "romans", bigFont: "genie" })!;
    const text = "(0.85*0.85*3.14)*1.84m*2個=8.34m";
    const width = [...text].reduce((n, c) => n + (c === "個" ? m.cjk! : m.latin![c.charCodeAt(0) - 32] / 1000), 0) * 32.846 * 0.8;
    // ZWCAD-drawn strokes span 36883.9-37592.4 from the insertion point 36878.9; ³ is at 37598.7.
    expect(36878.9 + width).toBeGreaterThan(37592.4);
    expect(36878.9 + width).toBeLessThan(37598.7 + 5);
  });

  it("uses romans for an SHX font it has no table for, and leaves CJK-only styles' Latin alone", () => {
    expect(fallbackMetrics({ font: "cn1.shx" })?.latin).toEqual(fallbackMetrics({ font: "romans" })?.latin);
    expect(fittedShape("A", glyph(), { key: "", cjk: 1.25, latin: null }).advance).toBe(1.389);
  });
});

describe("big fonts named with a folder (t4 鴻群 \\RUBON\\CHINA)", () => {
  it("are drawn with chineset.shx, as ZWCAD fills in a big font it cannot find", () => {
    expect(bigFontFile("\\RUBON\\CHINA")).toBe("chineset.shx");
    expect(bigFontFile("/rubon/rubonu")).toBe("chineset.shx");
    expect(bigFontFile("china")).toBe("china.shx");
    expect(bigFontPitch("\\RUBON\\CHINA")).toBe(1); // ZWCAD advances these 1.0 text heights; china.shx would give 1.125
    expect(bigFontPitch("china")).toBe(1.125);
  });
});
