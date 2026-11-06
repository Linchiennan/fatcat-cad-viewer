// Hatch patterns drawn by the graphics card. A hatch past the drawing's pattern budget was drawn as its outline
// only (上晴 A區0420: 693 grass, stone and concrete hatches; ZWCAD draws their patterns). Drawing them all as
// line segments does not fit: that sheet's patterns alone exceeded what a worker can hand over (2 GB). Such a hatch
// is now filled with triangles like a solid one, and the fragment shader draws the pattern lines, dashes and dots
// one pixel wide from the pattern definition, so it costs the same however dense the pattern is.
//
// Worker side: the triangles carry the pattern's line families; their batch key takes PATTERN_KEY_BASE + an index
// into a per-drawing table (the line type field, which batches already use for numbers), and each table entry maps
// the batch's own vertex space (block definition, flattened copy or top level) to every family's line space.
// Main side: meshes of those batches get a copy of their material with the pattern test.
import { Matrix3, type Material, type RawShaderMaterial } from "three";
import { BatchingKey } from "dxf-viewer/src/BatchingKey.js";
import { LookupPattern, Pattern } from "dxf-viewer/src/Pattern.js";
import { HatchCalculator } from "dxf-viewer/src/HatchCalculator.js";
import { ColorCode } from "dxf-viewer/src/DxfScene.js";

type Any = any;
/** Batch line type values from here on name a pattern table entry (below are lineweights, see dxf-viewer patch). */
export const PATTERN_KEY_BASE = 1_000_000;
export const MAX_PATTERN_FAMILIES = 16, MAX_PATTERN_DASHES = 8;
/** One pattern line family: m maps to line space (x' = m0 x + m1 y + m2, y' = m3 x + m4 y + m5), lines run along x'
 * every oy in y', each shifted ox along x'; dashes as in DXF (negative = gap, 0 = dot), len their total (0 = solid). */
export type PatternFamily = { m: number[]; ox: number; oy: number; dashes: number[]; len: number };

const affine = (M: Matrix3): number[] => { const e = M.elements; return [e[0], e[3], e[6], e[1], e[4], e[7]]; };
/** m after A: the family's map applied to points first moved by A. */
function compose(m: number[], A: Matrix3): number[] {
  const a = affine(A);
  return [m[0] * a[0] + m[1] * a[3], m[0] * a[1] + m[1] * a[4], m[0] * a[2] + m[1] * a[5] + m[2],
    m[3] * a[0] + m[4] * a[3], m[3] * a[1] + m[4] * a[4], m[3] * a[2] + m[4] * a[5] + m[5]];
}

/**
 * The hatch's pattern as line families from its own coordinates (after the extrusion mirror) to line space, the
 * pattern chosen as dxf-viewer's _DecomposeHatch chooses it; null when the shader cannot hold it.
 */
export function hatchPatternFamilies(scene: Any, e: Any): PatternFamily[] | null {
  let pattern: Any = e.definitionLines ? new Pattern(e.definitionLines, e.patternName, false) : null;
  if (!pattern && e.patternName) pattern = LookupPattern(e.patternName, scene.isMetric);
  if (!pattern) pattern = LookupPattern("ANSI31");
  if (!pattern?.lines?.length) return null;
  const mirror: Matrix3 | null = scene._GetEntityExtrusionTransform(e);
  const fromVertex = mirror ? mirror.clone().invert() : new Matrix3();
  const families: PatternFamily[] = [];
  for (const seedPoint of e.seedPoints?.length ? e.seedPoints : [{ x: 0, y: 0 }]) {
    const patTransform: Matrix3 = pattern.offsetInLineSpace
      ? HatchCalculator.prototype.GetPatternTransform.call(null, { seedPoint, angle: e.patternAngle, scale: e.patternScale })
      : new Matrix3();
    for (const line of pattern.lines) {
      let ox: number, oy: number;
      if (pattern.offsetInLineSpace) { ox = line.offset.x; oy = line.offset.y; }
      else { const s = Math.sin(-(line.angle ?? 0)), c = Math.cos(-(line.angle ?? 0)); ox = line.offset.x * c - line.offset.y * s; oy = line.offset.x * s + line.offset.y * c; }
      if (oy < 0) { oy = -oy; ox = -ox; }
      const L = patTransform.clone();
      if (line.base) L.translate(-line.base.x, -line.base.y);
      if (line.angle) L.rotate(line.angle);
      const dashes: number[] = line.dashes && line.dashes.length > 1 ? [...line.dashes] : [];
      if (dashes.length > MAX_PATTERN_DASHES || ![ox, oy, ...dashes].every(Number.isFinite)) return null;
      families.push({ m: affine(L.multiply(fromVertex)), ox, oy, dashes, len: dashes.reduce((s, d) => s + Math.abs(d), 0) });
    }
  }
  // dxf-viewer draws the pattern once per seed point; with the drawing's own definition the copies are the same lines
  // (上晴 A區0420: AR-CONC with 27 seed points, PLASTI with 61).
  const unique = [...new Map(families.map((f) => [JSON.stringify(f), f])).values()];
  return unique.length && unique.length <= MAX_PATTERN_FAMILIES ? unique : null;
}

/** The family moved by A, its constant terms brought within one period so the shader's float32 keeps its detail. */
function moved(f: PatternFamily, A: Matrix3): PatternFamily {
  const m = compose(f.m, A);
  if (f.oy > 0) { const n = Math.floor(m[5] / f.oy); m[5] -= n * f.oy; m[2] -= n * f.ox; }
  if (f.len > 0) m[2] -= Math.floor(m[2] / f.len) * f.len;
  return { ...f, m };
}

function register(scene: Any, families: PatternFamily[]): number {
  const table: PatternFamily[][] = (scene.cadPatternTable ??= []), ids: Map<string, number> = (scene.cadPatternIds ??= new Map());
  const key = JSON.stringify(families);
  let id = ids.get(key);
  if (id === undefined) { id = table.length; table.push(families); ids.set(key, id); }
  return id;
}

/** Patch a DxfScene class (in the viewer worker). */
export function installPatternFillScene(sceneClass: Any): void {
  const p = sceneClass.prototype;
  if (p.fatcatPatternFillInstalled) return;
  p.fatcatPatternFillInstalled = true;
  const build = p.Build, processTriangles = p._ProcessTriangles, flattenBatch = p._FlattenBatch, buildScene = p._BuildScene;
  p.Build = async function (dxf: Any, fonts: Any) {
    this.cadPatternTable = []; this.cadPatternIds = new Map();
    return build.call(this, dxf, fonts);
  };
  p._ProcessTriangles = function (entity: Any, blockCtx: Any = null) {
    const families: PatternFamily[] | undefined = entity.cadPattern;
    if (!families || entity.vertices.length < 3 || entity.indices.length % 3 !== 0) return processTriangles.call(this, entity, blockCtx);
    // Transformed first: the block offset or the drawing origin is fixed by the first vertex.
    const out = entity.vertices.map((v: Any) => this._TransformVertex(v, blockCtx));
    const toHatch = blockCtx
      ? blockCtx.transform.clone().invert().multiply(new Matrix3().makeTranslation(blockCtx.block.offset.x, blockCtx.block.offset.y))
      : new Matrix3().makeTranslation(this.origin.x, this.origin.y);
    const id = register(this, families.map((f) => moved(f, toHatch)));
    const key = new BatchingKey(entity.layer, blockCtx?.name, BatchingKey.GeometryType.INDEXED_TRIANGLES, entity.color, PATTERN_KEY_BASE + id);
    const chunk = this._GetBatch(key).PushChunk(out.length);
    for (const v of out) chunk.PushVertex(v);
    for (const i of entity.indices) chunk.PushIndex(i);
    chunk.Finish();
  };
  // A flattened block's pattern batch keeps its pattern, moved by the INSERT's transform (dxf-viewer resets the line type).
  p._FlattenBatch = function (blockBatch: Any, layerName: Any, blockColor: number, blockLineType: number, transform: Matrix3) {
    const type = blockBatch.key.lineType;
    if (!(type >= PATTERN_KEY_BASE)) return flattenBatch.call(this, blockBatch, layerName, blockColor, blockLineType, transform);
    layerName ??= blockBatch.key.layerName;
    const layer = layerName ? this.layers.get(layerName) : null, own = blockBatch.key.color;
    const color = own === ColorCode.BY_BLOCK ? blockColor : own === ColorCode.BY_LAYER ? layer?.color ?? 0 : own;
    const inverse = transform.clone().invert();
    const id = register(this, this.cadPatternTable[type - PATTERN_KEY_BASE].map((f: PatternFamily) => moved(f, inverse)));
    this._GetBatch(new BatchingKey(layerName, null, blockBatch.key.geometryType, color, PATTERN_KEY_BASE + id)).Merge(blockBatch, transform);
  };
  p._BuildScene = function () {
    const scene = buildScene.call(this);
    scene.fatcatPatterns = this.cadPatternTable ?? [];
    return scene;
  };
}

const VERTEX_MAIN = "void main() {", VERTEX_POS = "vec4 pos = vec4(position, 0.0, 1.0);", FRAGMENT_MAIN = "void main() {";

/** A copy of a fill material that keeps only the pixels on the pattern's lines, dashes and dots. */
export function patternMaterial(base: RawShaderMaterial, families: PatternFamily[]): RawShaderMaterial {
  if (!base.vertexShader.includes(VERTEX_POS) || !base.vertexShader.includes(VERTEX_MAIN) || !base.fragmentShader.includes(FRAGMENT_MAIN))
    throw new Error("pattern shader version mismatch");
  const n = families.length, material = base.clone();
  const flat = (k: number, f: (x: PatternFamily) => number[]) => families.flatMap(f).slice(0, k);
  material.uniforms.fatcatPatA = { value: flat(4 * n, (f) => [f.m[0], f.m[1], f.m[2], f.m[3]]) };
  material.uniforms.fatcatPatB = { value: flat(4 * n, (f) => [f.m[4], f.m[5], f.ox, f.oy]) };
  material.uniforms.fatcatPatD = { value: flat(4 * 2 * n, (f) => Array.from({ length: 8 }, (_, j) => f.dashes[j] ?? 0)) };
  // length of the dash sequence, dash count, longest gap
  material.uniforms.fatcatPatL = { value: flat(4 * n, (f) => [f.len, f.dashes.length, Math.max(0, ...f.dashes.map((d) => -d)), 0]) };
  material.vertexShader = base.vertexShader
    .replace(VERTEX_MAIN, "out vec2 fatcatPat;\n" + VERTEX_MAIN)
    .replace(VERTEX_POS, VERTEX_POS + "\n                fatcatPat = position;");
  // Pixel size in line space comes from the position's own derivatives, taken before any branch.
  const test = `in vec2 fatcatPat;
uniform vec4 fatcatPatA[${n}];
uniform vec4 fatcatPatB[${n}];
uniform vec4 fatcatPatD[${2 * n}];
uniform vec4 fatcatPatL[${n}];
float fatcatDash(int i, int j) { vec4 d = fatcatPatD[i * 2 + j / 4]; int k = j - (j / 4) * 4; return k == 0 ? d.x : k == 1 ? d.y : k == 2 ? d.z : d.w; }
bool fatcatOnPattern(vec2 p, vec2 dx, vec2 dy) {
  for (int i = 0; i < ${n}; i++) {
    vec4 a = fatcatPatA[i], b = fatcatPatB[i];
    vec2 q = vec2(a.x * p.x + a.y * p.y + a.z, a.w * p.x + b.x * p.y + b.y);
    vec2 w = 0.5 * vec2(abs(a.x * dx.x + a.y * dx.y) + abs(a.x * dy.x + a.y * dy.y), abs(a.w * dx.x + b.x * dx.y) + abs(a.w * dy.x + b.x * dy.y));
    float len = fatcatPatL[i].x;
    // lines closer than a pixel cover every pixel: zoomed out the pattern is a solid colour, with no more work
    if (b.w > 0.0 && b.w <= 2.0 * w.y && (len <= 0.0 || fatcatPatL[i].z <= 2.0 * w.x)) return true;
    float k = b.w > 0.0 ? floor(q.y / b.w + 0.5) : 0.0;
    if (abs(q.y - k * b.w) > w.y) continue;
    if (len <= 0.0) return true;
    float s = mod(q.x - k * b.z, len), acc = 0.0;
    for (int j = 0; j < ${MAX_PATTERN_DASHES}; j++) {
      if (float(j) >= fatcatPatL[i].y) break;
      float d = fatcatDash(i, j), l = abs(d);
      // also one period either side, for a dash or dot that sits at the start or end of the period
      if (d >= 0.0 && (abs(s - acc - 0.5 * l) <= 0.5 * l + w.x || abs(s - len - acc - 0.5 * l) <= 0.5 * l + w.x || abs(s + len - acc - 0.5 * l) <= 0.5 * l + w.x)) return true;
      acc += l;
    }
  }
  return false;
}
`;
  material.fragmentShader = base.fragmentShader.replace(FRAGMENT_MAIN,
    test + FRAGMENT_MAIN + "\n  if (!fatcatOnPattern(fatcatPat, dFdx(fatcatPat), dFdy(fatcatPat))) discard;");
  material.needsUpdate = true;
  material.userData = { ...material.userData, fatcatPattern: true };
  return material;
}

/** Patch a DxfViewer class (main thread): keep the scene's pattern table for installPatternFills; Clear releases materials. */
export function installPatternViewer(viewerClass: Any): void {
  const p = viewerClass.prototype;
  if (p.fatcatPatternViewerInstalled) return;
  p.fatcatPatternViewerInstalled = true;
  const loadBatch = p._LoadBatch, clear = p.Clear;
  p._LoadBatch = function (scene: Any, batch: Any) {
    this.fatcatPatterns = scene?.fatcatPatterns ?? null;
    return loadBatch.call(this, scene, batch);
  };
  p.Clear = function () {
    const cache: Map<string, Material> | undefined = this.fatcatPatternMaterials;
    if (cache) { for (const m of cache.values()) m.dispose(); cache.clear(); }
    this.fatcatPatterns = null;
    return clear.call(this);
  };
}

/**
 * After a load: give the meshes of pattern batches their pattern material. The batch's line type reaches the mesh as
 * userData.cadLineweight (line type - 1000, see the dxf-viewer patch).
 */
export function installPatternFills(viewer: Any): number {
  const table: PatternFamily[][] | null = viewer.fatcatPatterns;
  if (!table?.length) return 0;
  const cache: Map<string, Material> = (viewer.fatcatPatternMaterials ??= new Map());
  let count = 0;
  for (const object of viewer.GetScene().children) {
    const id = (object.userData?.cadLineweight ?? 0) + 1000 - PATTERN_KEY_BASE;
    if (!object.isMesh || !(id >= 0) || !table[id]) continue;
    const key = object.material.uuid + "|" + id;
    let material = cache.get(key) as RawShaderMaterial | undefined;
    if (!material) {
      try { material = patternMaterial(object.material, table[id]); cache.set(key, material); } catch { continue; }
    }
    object.material = material;
    count++;
  }
  return count;
}

export const _patternMath = { compose, moved };
