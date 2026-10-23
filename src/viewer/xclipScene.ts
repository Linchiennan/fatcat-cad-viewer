// XCLIP display (T14 8.3). Worker side: every clipped top-level INSERT gets its own copy of the block
// (never flattened) and nested clipped content is moved to synthetic layers that name a clip tag; the
// clip tables travel with the serialized scene. Main side: batches of those blocks get a copy of their
// material whose fragment shader discards what lies outside every clip of the chain.
import { Matrix3, Vector2, Vector4, type Material, type RawShaderMaterial } from "three";
import type { DrawingPoint } from "../types/drawing";
import { expandClipRectangle, parseDxfXclip } from "../dwg/xclipMetadata";

type Any = any;

/** Name prefix of the per-INSERT block copies. */
export const XCLIP_BLOCK_PREFIX = "__fatcat_xclip_";
/** Prefix of synthetic layers: prefix + tag + "__" + original layer. */
export const XCLIP_LAYER_PREFIX = "__fatcat_xc";
/** Largest clip polygon drawn (T14 6-6); larger ones are skipped with a warning (待決 A-3). */
export const XCLIP_POINT_LIMIT = 256;
const BLOCK_INSTANCE = 5;

/** Warning for a skipped clip (a gap: not in cadWarnings' note list). */
export const xclipTooLargeWarning = (block: string, points: number) =>
  `XCLIP 邊界超過256點（圖塊 ${block}，${points} 點）；此裁切已略過、未以外接框冒充，請在原CAD簡化邊界`;

/** Clip tables attached to the serialized scene. Points are in the root block's coordinates. */
export type XclipTables = {
  top: Record<string, { points: DrawingPoint[]; offset: DrawingPoint }>;
  nested: Record<string, { parent?: number; points: DrawingPoint[]; offset: DrawingPoint; root: string }>;
};

export type XclipPreparation = {
  /** Block copy name → clip polygon (block coordinates). */
  top: Map<string, DrawingPoint[]>;
  /** Blocks whose content holds clipped INSERTs: never flattened. */
  keep: Set<string>;
  warnings: string[];
};

export const xclipLayerName = (tag: number, layer: string) => `${XCLIP_LAYER_PREFIX}${tag}__${layer}`;

/** Clip tag of a synthetic layer name, or null. */
export function xclipLayerTag(layer: string | null | undefined): number | null {
  const m = layer ? /^__fatcat_xc(\d+)__/.exec(layer) : null;
  return m ? Number(m[1]) : null;
}

/** Original layer name behind a synthetic one. */
export const xclipBaseLayer = (layer: string) => layer.replace(/^__fatcat_xc\d+__/, "");

/**
 * Before the scene is built: give every clipped top-level INSERT its own block copy and list the blocks
 * that hold nested clips. Mutates the parsed document.
 */
export function prepareXclips(dxf: Any): XclipPreparation {
  const out: XclipPreparation = { top: new Map(), keep: new Set(), warnings: [] };
  const blocks: Record<string, Any> = dxf.blocks ?? {};
  const memo = new Map<string, boolean>();
  const holdsClip = (name: string, stack: string[]): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    if (stack.includes(name) || stack.length > 32) return false;
    const found = (blocks[name]?.entities ?? []).some((e: Any) => e.type === "INSERT" && (parseDxfXclip(e) !== null || holdsClip(e.name, [...stack, name])));
    memo.set(name, found);
    return found;
  };
  let serial = 0;
  for (const e of dxf.entities ?? []) {
    if (e.type !== "INSERT" || !blocks[e.name]) continue;
    const clip = parseDxfXclip(e);
    if (holdsClip(e.name, [])) out.keep.add(e.name);
    if (!clip) continue;
    const polygon = expandClipRectangle(clip);
    if (polygon.length > XCLIP_POINT_LIMIT) { out.warnings.push(xclipTooLargeWarning(e.name, polygon.length)); continue; }
    const alias = XCLIP_BLOCK_PREFIX + (e.handle ? String(e.handle) : "n" + serial++);
    blocks[alias] = { ...blocks[e.name], name: alias, cadName: blocks[e.name].cadName ?? blocks[e.name].name };
    if (out.keep.has(e.name)) out.keep.add(alias);
    e.name = alias;
    out.top.set(alias, polygon);
  }
  dxf.blocks = blocks;
  return out;
}

type SceneState = XclipPreparation & { next: number; nested: Map<number, { parent?: number; points: DrawingPoint[]; root: string }> };

/** Patch a DxfScene class (in the viewer worker). */
export function installXclipScene(sceneClass: Any): void {
  const p = sceneClass.prototype;
  if (p.fatcatXclipInstalled) return;
  p.fatcatXclipInstalled = true;
  const build = p.Build, processInsert = p._ProcessInsert, buildScene = p._BuildScene;

  p.Build = async function (dxf: Any, fonts: Any) {
    const prepared = prepareXclips(dxf);
    const state: SceneState = { ...prepared, next: 1, nested: new Map() };
    this.fatcatXclip = state;
    if (prepared.warnings.length) (this.cadSceneWarnings ??= []).push(...prepared.warnings);
    return build.call(this, dxf, fonts);
  };

  p._ProcessInsert = function (entity: Any, blockCtx: Any = null) {
    const state: SceneState | undefined = this.fatcatXclip;
    if (!state) return processInsert.call(this, entity, blockCtx);
    if (!blockCtx) {
      const block = this.blocks.get(entity.name);
      // Flattened blocks lose their own coordinates, so clipped ones stay instanced.
      if (block && (state.top.has(entity.name) || state.keep.has(entity.name))) block.flatten = false;
      return processInsert.call(this, entity, blockCtx);
    }
    const inherited: number | undefined = blockCtx.fatcatTag;
    const clip = parseDxfXclip(entity);
    if (!clip && inherited === undefined) return processInsert.call(this, entity, blockCtx);
    if (blockCtx.name === entity.name) return; // a block inserting itself
    const block = this.blocks.get(entity.name);
    if (!block) return;
    const nestedCtx = blockCtx.NestedBlockContext(block, entity);
    let tag = inherited;
    if (clip) {
      const polygon = expandClipRectangle(clip);
      if (polygon.length > XCLIP_POINT_LIMIT) (this.cadSceneWarnings ??= []).push(xclipTooLargeWarning(entity.name, polygon.length));
      else {
        tag = state.next++;
        const m: Matrix3 = nestedCtx.transform;
        state.nested.set(tag, { parent: inherited, root: blockCtx.block.data.name, points: polygon.map((q) => { const v = new Vector2(q.x, q.y).applyMatrix3(m); return { x: v.x, y: v.y }; }) });
      }
    }
    nestedCtx.fatcatTag = tag;
    const inheritedLayer = entity.fatcatBaseLayer ?? entity.layer ?? "0";
    for (const child of block.data.entities ?? []) {
      if (!this._FilterEntity(child)) continue;
      if (tag === undefined) { this._ProcessDxfEntity(child, nestedCtx); continue; }
      const base = child.fatcatBaseLayer ?? child.layer ?? inheritedLayer;
      const layer = xclipLayerName(tag, base);
      if (!this.layers.has(layer)) {
        const source = this.layers.get(base) ?? this.layers.get("0") ?? { name: base, color: 0 };
        this.layers.set(layer, { ...source, name: layer, displayName: source.displayName ?? base, frozen: false });
      }
      this._ProcessDxfEntity({ ...child, layer, fatcatBaseLayer: base }, nestedCtx);
    }
  };

  p._BuildScene = function () {
    const scene = buildScene.call(this);
    const state: SceneState | undefined = this.fatcatXclip;
    if (!state || (!state.top.size && !state.nested.size)) return scene;
    const offsetOf = (name: string) => { const o = this.blocks.get(name)?.offset; return o ? { x: o.x, y: o.y } : null; };
    const tables: XclipTables = { top: {}, nested: {} };
    for (const [alias, points] of state.top) { const offset = offsetOf(alias); if (offset) tables.top[alias] = { points, offset }; }
    for (const [tag, n] of state.nested) { const offset = offsetOf(n.root); if (offset) tables.nested[tag] = { ...n, offset }; }
    scene.fatcatClips = tables;
    return scene;
  };
}

/** Clip polygons (block-local: minus the block offset) for one definition batch, outer clip first. */
export function clipChain(tables: XclipTables, block: string, layer: string | null): DrawingPoint[][] {
  const out: DrawingPoint[][] = [];
  const local = (points: DrawingPoint[], o: DrawingPoint) => points.map((q) => ({ x: q.x - o.x, y: q.y - o.y }));
  const top = tables.top[block];
  if (top) out.push(local(top.points, top.offset));
  const chain: DrawingPoint[][] = [], seen = new Set<number>();
  for (let tag = xclipLayerTag(layer); tag !== null && tag !== undefined && !seen.has(tag);) {
    seen.add(tag);
    const n = tables.nested[tag];
    if (!n || n.root !== block) break;
    chain.push(local(n.points, n.offset));
    tag = n.parent ?? null;
  }
  return [...out, ...chain.reverse()].filter((p) => p.length >= 3 && p.length <= XCLIP_POINT_LIMIT);
}

/** Even-odd point-in-polygon, the same test the fragment shader makes. */
export function insidePolygon(p: DrawingPoint, polygon: readonly DrawingPoint[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const VERTEX_MAIN = "void main() {", VERTEX_POS = "vec4 pos = vec4(position, 0.0, 1.0);", FRAGMENT_MAIN = "void main() {";

/** Copy of a dxf-viewer material that discards fragments outside every polygon (one uniform set per level). */
export function clipMaterial(base: RawShaderMaterial, polygons: DrawingPoint[][]): RawShaderMaterial {
  if (!base.vertexShader.includes(VERTEX_POS) || !base.vertexShader.includes(VERTEX_MAIN) || !base.fragmentShader.includes(FRAGMENT_MAIN))
    throw new Error("XCLIP shader version mismatch");
  const material = base.clone();
  const decls: string[] = [], tests: string[] = [];
  polygons.forEach((poly, k) => {
    const n = poly.length, slots = Math.ceil(n / 2);
    const packed = Array.from({ length: slots }, (_, i) => new Vector4(poly[2 * i].x, poly[2 * i].y, poly[2 * i + 1]?.x ?? 0, poly[2 * i + 1]?.y ?? 0));
    material.uniforms[`fatcatClip${k}`] = { value: packed };
    decls.push(`uniform vec4 fatcatClip${k}[${slots}];
vec2 fatcatPoint${k}(int i) { vec4 v = fatcatClip${k}[i / 2]; return (i % 2 == 0) ? v.xy : v.zw; }
bool fatcatInside${k}(vec2 p) {
  bool hit = false;
  for (int i = 0; i < ${n}; i++) {
    int j = (i == 0) ? ${n - 1} : i - 1;
    vec2 a = fatcatPoint${k}(i), b = fatcatPoint${k}(j);
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}`);
    tests.push(`!fatcatInside${k}(fatcatLocal)`);
  });
  material.vertexShader = base.vertexShader
    .replace(VERTEX_MAIN, "out vec2 fatcatLocal;\n" + VERTEX_MAIN)
    .replace(VERTEX_POS, VERTEX_POS + "\n                fatcatLocal = position;");
  material.fragmentShader = base.fragmentShader.replace(FRAGMENT_MAIN,
    "in vec2 fatcatLocal;\n" + decls.join("\n") + "\n" + FRAGMENT_MAIN + (tests.length ? `\n  if (${tests.join(" || ")}) discard;` : ""));
  material.needsUpdate = true;
  material.userData = { ...material.userData, fatcatClip: true };
  return material;
}

/** Patch a DxfViewer class (main thread): clipped block batches get clip materials; Clear releases them. */
export function installXclipViewer(viewerClass: Any): void {
  const p = viewerClass.prototype;
  if (p.fatcatXclipInstalled) return;
  p.fatcatXclipInstalled = true;
  const loadBatch = p._LoadBatch, clear = p.Clear;
  p._LoadBatch = function (scene: Any, batch: Any) {
    const tables: XclipTables | undefined = scene?.fatcatClips;
    const name: string | null = batch.key.blockName;
    if (!tables || name === null || batch.key.geometryType !== BLOCK_INSTANCE) return loadBatch.call(this, scene, batch);
    const nestedHere = Object.values(tables.nested).some((n) => n.root === name);
    const block = this.blocks.get(name);
    if ((!tables.top[name] && !nestedHere) || !block?.batches?.length) return loadBatch.call(this, scene, batch);
    const BatchClass = block.batches[0].constructor;
    const instance = new BatchClass(this, scene, batch);
    const cache: Map<string, Material> = (this.fatcatClipMaterials ??= new Map());
    const add = (obj: Any) => { this.scene.add(obj); (obj._dxfViewerLayer ?? this.defaultLayer).PushObject(obj); };
    for (const definition of block.batches) {
      const polygons = clipChain(tables, name, definition.key.layerName);
      for (const obj of definition.CreateObjects(instance)) {
        if (polygons.length) {
          const key = obj.material.uuid + "|" + name + "|" + (definition.key.layerName ?? "");
          let material = cache.get(key);
          if (!material) {
            try { material = clipMaterial(obj.material, polygons); cache.set(key, material); } catch { material = undefined; }
          }
          if (material) obj.material = material;
        }
        add(obj);
      }
    }
    if (instance.vertices) for (const obj of instance._CreateObjects(null)) add(obj);
  };
  p.Clear = function () {
    const cache: Map<string, Material> | undefined = this.fatcatClipMaterials;
    if (cache) { for (const m of cache.values()) m.dispose(); cache.clear(); }
    return clear.call(this);
  };
}
