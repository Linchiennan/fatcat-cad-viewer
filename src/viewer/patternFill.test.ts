import { describe, expect, it } from "vitest";
import { Matrix3 } from "three";
import { DxfScene, Entity } from "dxf-viewer/src/DxfScene.js";
import { _patternMath, hatchPatternFamilies, patternMaterial, MAX_PATTERN_FAMILIES, type PatternFamily } from "./patternFill";

const scene = { isMetric: true, _GetEntityExtrusionTransform: () => null };
const at = (f: PatternFamily, x: number, y: number) => ({ u: f.m[0] * x + f.m[1] * y + f.m[2], v: f.m[3] * x + f.m[4] * y + f.m[5] });
/** Where a point falls in the family: distance to the nearest line and phase along the dashes. */
const place = (f: PatternFamily, x: number, y: number) => {
  const { u, v } = at(f, x, y), k = f.oy > 0 ? Math.round(v / f.oy) : 0;
  return { off: v - k * f.oy, phase: f.len > 0 ? (((u - k * f.ox) % f.len) + f.len) % f.len : 0 };
};

// 上晴 A區0420：草地、石材剖面線超過整張圖的繪製量只畫外框；改由顯示卡依圖樣定義畫
describe("hatch patterns for the graphics card", () => {
  it("reads a library pattern's line families", () => {
    const f = hatchPatternFamilies(scene, { patternName: "GRASS", patternScale: 20, patternAngle: 0 })!;
    expect(f).toHaveLength(3);
    expect(f.every((x) => x.len > 0 && x.dashes.length === 2)).toBe(true);
  });

  it("keeps one copy of a drawing's own definition repeated per seed point (AR-CONC with 27 seed points)", () => {
    const definitionLines = [{ angle: 0, base: { x: 0, y: 0 }, offset: { x: 0, y: 5 }, dashes: [3, -2] }, { angle: Math.PI / 2, base: { x: 0, y: 0 }, offset: { x: 0, y: 5 } }];
    const seedPoints = Array.from({ length: 27 }, (_, i) => ({ x: i, y: i }));
    expect(hatchPatternFamilies(scene, { patternName: "X", definitionLines, seedPoints })).toHaveLength(2);
  });

  it("gives up on a pattern larger than the shader holds", () => {
    const definitionLines = Array.from({ length: MAX_PATTERN_FAMILIES + 1 }, (_, i) => ({ angle: i / 10, base: { x: 0, y: 0 }, offset: { x: 0, y: 1 + i } }));
    expect(hatchPatternFamilies(scene, { patternName: "X", definitionLines })).toBeNull();
  });

  it("moves a family to another space without changing its lines, constants within one period", () => {
    const f: PatternFamily = { m: [0.6, 0.8, 1234567.25, -0.8, 0.6, 7654321.5], ox: 1.5, oy: 4, dashes: [3, -2, 0, -1], len: 6 };
    const A = new Matrix3().makeTranslation(250000, -130000);
    const g = _patternMath.moved(f, A);
    expect(Math.abs(g.m[5])).toBeLessThan(4);
    expect(Math.abs(g.m[2])).toBeLessThan(6 + 1.5);
    for (const [x, y] of [[0, 0], [12.5, -7.25], [-300, 41]]) {
      const before = place(f, x + 250000, y - 130000), after = place(g, x, y);
      expect(after.off).toBeCloseTo(before.off, 4);
      expect(after.phase).toBeCloseTo(before.phase, 4);
    }
  });

  it("adds the pattern test to a fill material's shaders", () => {
    const base: any = { vertexShader: "in vec2 position;\nvoid main() {\n                vec4 pos = vec4(position, 0.0, 1.0);\n}", fragmentShader: "void main() {\n}", uniforms: {},
      clone() { return { ...this, uniforms: { ...this.uniforms }, userData: {} }; } };
    const f = hatchPatternFamilies(scene, { patternName: "GRASS", patternScale: 20 })!;
    const m: any = patternMaterial(base, f);
    expect(m.vertexShader).toContain("fatcatPat = position;");
    expect(m.fragmentShader).toContain("uniform vec4 fatcatPatA[3];");
    expect(m.fragmentShader).toContain("discard;");
    expect(m.uniforms.fatcatPatA.value).toHaveLength(12);
    expect(m.uniforms.fatcatPatD.value).toHaveLength(24);
  });
});

// GRASS 剖面線兩塊分開的區域：原本第二塊被當成第一塊的洞，只填出一條帶狀
describe("solid fills by loop nesting", () => {
  it("fills separate areas each, and a loop inside another as its hole", () => {
    const s: any = new DxfScene({});
    s.layers = new Map(); s.vars = new Map();
    const square = (x: number, y: number, size: number) => ({ type: 2, isExternal: true, polyline: { isClosed: true, vertices: [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }] } });
    const hatch = { type: "HATCH", isSolid: true, layer: "0", hatchStyle: 0, boundaryLoops: [square(0, 0, 10), square(20, 0, 10), square(2, 2, 3)] };
    const out = [...s._DecomposeHatch(hatch, null)];
    expect(out.map((e: any) => e.type)).toEqual([Entity.Type.TRIANGLES, Entity.Type.TRIANGLES]);
    const area = (e: any) => { let a = 0; for (let i = 0; i < e.indices.length; i += 3) { const [p, q, r] = [0, 1, 2].map((k) => e.vertices[e.indices[i + k]]); a += Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) / 2; } return a; };
    expect(out.map(area)).toEqual([100 - 9, 100]);
  });
});
