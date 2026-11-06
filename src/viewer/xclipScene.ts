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
/** Infix of trimmed copies of blocks nested in a clipped copy (insideClip). */
export const XCLIP_TRIM_SUFFIX = "__fatcat_trim_";
/** Prefix of synthetic layers: prefix + tag + "__" + original layer. */
export const XCLIP_LAYER_PREFIX = "__fatcat_xc";
/** Largest clip polygon drawn (T14 6-6); larger ones are skipped with a warning (待決 A-3). */
export const XCLIP_POINT_LIMIT = 256;
const BLOCK_INSTANCE = 5;

/** Warning for a skipped clip (a gap: not in cadWarnings' note list). */
export const xclipTooLargeWarning = (block: string, points: number) =>
  `XCLIP 邊界超過256點（圖塊 ${block}，${points} 點）；此裁切已略過、未以外接框冒充，請在原CAD簡化邊界`;

/**
 * A clip polygon within XCLIP_POINT_LIMIT points, or null. A longer one is thinned evenly, kept only when every dropped
 * point stays within 0.2 % of the clip's size of the thinned outline: detail bubbles are circles stored as 369 points,
 * skipped whole before (惠宇 006 浴室落水頭: five clipped plans drawn in full over each other).
 */
export function fitClip(polygon: DrawingPoint[]): DrawingPoint[] | null {
  if (polygon.length <= XCLIP_POINT_LIMIT) return polygon;
  const step = Math.ceil(polygon.length / XCLIP_POINT_LIMIT), kept: number[] = [];
  for (let i = 0; i < polygon.length; i += step) kept.push(i);
  const thin = kept.map((i) => polygon[i]);
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polygon) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
  const limit = Math.hypot(c - a, d - b) * 0.002;
  for (let k = 0; k < kept.length; k++) {
    const p = polygon[kept[k]], q = polygon[kept[(k + 1) % kept.length]], dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
    for (let i = kept[k] + 1; i < (k + 1 < kept.length ? kept[k + 1] : polygon.length); i++) {
      const r = polygon[i], off = len > 0 ? Math.abs((r.x - p.x) * dy - (r.y - p.y) * dx) / len : Math.hypot(r.x - p.x, r.y - p.y);
      if (off > limit) return null;
    }
  }
  return thin;
}

/** Clip tables attached to the serialized scene. Points are in the root block's coordinates. */
export type XclipTables = {
  top: Record<string, { points: DrawingPoint[]; offset: DrawingPoint; masks?: DrawingPoint[][] }>;
  nested: Record<string, { parent?: number; points: DrawingPoint[]; offset: DrawingPoint; root: string; holes?: DrawingPoint[][] }>;
};

export type XclipPreparation = {
  /** Block copy name → clip polygon (block coordinates). */
  top: Map<string, DrawingPoint[]>;
  /** Block copy name → wipeout polygons over it (block coordinates): drawn as holes, like an inverted clip. */
  masks: Map<string, DrawingPoint[][]>;
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
  const out: XclipPreparation = { top: new Map(), masks: new Map(), keep: new Set(), warnings: [] };
  const blocks: Record<string, Any> = dxf.blocks ?? {};
  const memo = new Map<string, boolean>();
  const holdsClip = (name: string, stack: string[]): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    if (stack.includes(name) || stack.length > 32) return false;
    const found = (blocks[name]?.entities ?? []).some((e: Any) => e.type === "INSERT" && (parseDxfXclip(e) !== null || e.cadWipeoutMasks?.length > 0 || holdsClip(e.name, [...stack, name])));
    memo.set(name, found);
    return found;
  };
  let serial = 0;
  for (const e of dxf.entities ?? []) {
    if (e.type !== "INSERT" || !blocks[e.name]) continue;
    const clip = parseDxfXclip(e);
    if (holdsClip(e.name, [])) out.keep.add(e.name);
    const masks = wipeoutMasks(e, blocks[e.name]);
    if (!clip && !masks.length) continue;
    let polygon: DrawingPoint[] = [];
    if (clip) {
      const raw = expandClipRectangle(clip), fitted = fitClip(raw);
      if (!fitted) { out.warnings.push(xclipTooLargeWarning(e.name, raw.length)); if (!masks.length) continue; }
      else polygon = fitted;
    }
    const alias = XCLIP_BLOCK_PREFIX + (e.handle ? String(e.handle) : "n" + serial++);
    blocks[alias] = { ...blocks[e.name], name: alias, cadName: blocks[e.name].cadName ?? blocks[e.name].name, entities: polygon.length ? insideClip(blocks[e.name].entities ?? [], polygon, blocks) : blocks[e.name].entities };
    if (out.keep.has(e.name)) out.keep.add(alias);
    e.name = alias;
    out.top.set(alias, polygon);
    if (masks.length) out.masks.set(alias, masks);
  }
  dxf.blocks = blocks;
  return out;
}

/** Wipeout polygons an INSERT carries (world, from applyWipeouts) in its block's coordinates. */
function wipeoutMasks(e: Any, block: Any): DrawingPoint[][] {
  if (!Array.isArray(e.cadWipeoutMasks) || !e.cadWipeoutMasks.length) return [];
  const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
  if (!sx || !sy) return [];
  const r = -(e.rotation ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), at = e.position ?? { x: 0, y: 0 }, base = block?.position ?? { x: 0, y: 0 };
  return e.cadWipeoutMasks.map((poly: DrawingPoint[]) => poly.map((p) => {
    const x = p.x - at.x, y = p.y - at.y;
    return { x: base.x + (x * c - y * s) / sx, y: base.y + (x * s + y * c) / sy };
  })).filter((p: DrawingPoint[]) => p.length >= 3 && p.length <= XCLIP_POINT_LIMIT);
}

/** Rough extents of an entity, or null when it cannot be told cheaply (kept). */
function roughBox(e: Any): [number, number, number, number] | null {
  const pts = (list: Any[] | undefined, pad = 0): [number, number, number, number] | null => {
    if (!list?.length) return null;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of list) { if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null; a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
    return [a - pad, b - pad, c + pad, d + pad];
  };
  switch (e.type) {
    case "LINE": return pts(e.vertices);
    case "LWPOLYLINE": case "POLYLINE": {
      // a bulge can swing out by up to half its chord: pad by the longest chord when there is one
      const v = e.vertices ?? [];
      let pad = 0;
      if (v.some((q: Any) => q.bulge)) for (let i = 1; i < v.length; i++) pad = Math.max(pad, Math.hypot(v[i].x - v[i - 1].x, v[i].y - v[i - 1].y));
      return pts(v, pad + (e.width ?? 0));
    }
    case "CIRCLE": case "ARC": return Number.isFinite(e.radius) ? pts([e.center], e.radius) : null;
    case "TEXT": case "ATTRIB": case "MTEXT": {
      const h = e.textHeight ?? e.height ?? 0, n = String(e.text ?? "").length;
      return h > 0 ? pts([e.startPoint ?? e.position], h * (n + 2) * Math.max(1, Math.abs(e.xScale ?? 1)) + (e.width ?? 0)) : null;
    }
    case "SOLID": case "TRACE": case "3DFACE": return pts(e.points ?? e.vertices);
    case "POINT": return pts([e.position]);
    case "ELLIPSE": { const m = e.majorAxisEndPoint; return m ? pts([e.center], Math.hypot(m.x, m.y)) : null; }
    case "SPLINE": return pts(e.controlPoints?.length ? e.controlPoints : e.fitPoints);
    case "HATCH": {
      // boundary loops: polylines (bulges padded by their chord), lines, arcs and ellipse arcs by their full circle
      const at: Any[] = [];
      let pad = 0;
      for (const loop of e.boundaryLoops ?? []) {
        if (loop.polyline?.vertices) {
          const v = loop.polyline.vertices;
          at.push(...v);
          if (v.some((q: Any) => q.bulge)) for (let i = 0; i < v.length; i++) { const q = v[(i + 1) % v.length]; pad = Math.max(pad, Math.hypot(q.x - v[i].x, q.y - v[i].y)); }
          continue;
        }
        for (const edge of loop.edges ?? []) {
          if (edge.type === 1) at.push(edge.start, edge.end);
          else if (edge.type === 2) { at.push(edge.start); pad = Math.max(pad, edge.radius ?? Infinity); }
          else if (edge.type === 3) { at.push(edge.start); pad = Math.max(pad, Math.hypot(edge.end?.x ?? Infinity, edge.end?.y ?? 0)); }
          else if (edge.controlPoints?.length) at.push(...edge.controlPoints);
          else return null;
        }
      }
      const box = pts(at, pad);
      // a mirrored hatch (extrusion -Z) is drawn with x negated
      return box && (e.extrusionDirection?.z ?? 1) < 0 ? [-box[2], box[1], -box[0], box[3]] : box;
    }
    default: return null;
  }
}

/**
 * Content of a clipped block copy: entities lying wholly outside the clip are left out. Every clipped INSERT gets its
 * own copy of the geometry, so a layout of many viewports held the whole model once per viewport (惠宇敦南 RF電氣1:
 * 33 viewports, over 1 GB); each now holds about what it shows. Anything whose extents are not cheap to tell stays.
 * With `blocks`, a nested INSERT is looked into as well: it is left out when its block lies outside, and a large
 * block gets its own trimmed copy (上晴 公設B區-2 算圖: block "1F" holds the whole plan as one nested INSERT and is
 * clipped 115 times; every copy drew all 104 thousand entities, 260 million vertices, out of memory).
 */
export function insideClip(entities: Any[], polygon: DrawingPoint[], blocks?: Record<string, Any>): Any[] {
  if (polygon.length < 3) return entities;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polygon) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
  const m = Math.max(c - a, d - b) * 0.01;
  return trimToBox(entities, [a - m, b - m, c + m, d + m], blocks, { extents: extentsOf(blocks) }, 0);
}

type Rect = [number, number, number, number];
type TrimState = { extents: Map<string, Rect | null> };
// A block's extents are the same for every clipped INSERT: worked out once per drawing (上晴 D區0418: 3 s recomputing
// the whole nested plan for each of its clipped copies).
const extentsCache = new WeakMap<object, Map<string, Rect | null>>();
const extentsOf = (blocks: Record<string, Any> | undefined) => {
  if (!blocks) return new Map<string, Rect | null>();
  let m = extentsCache.get(blocks);
  if (!m) extentsCache.set(blocks, m = new Map());
  return m;
};
// Trimmed copies are named across calls: each clipped INSERT trims its own copies of the same blocks.
let trimSerial = 0;
const TRIM_MIN = 500, TRIM_DEPTH = 6;
const outside = (r: Rect, box: Rect) => r[2] < box[0] || r[0] > box[2] || r[3] < box[1] || r[1] > box[3];

/** INSERT placement as functions to and from its block's coordinates; null for arrays, mirrors and zero scales. */
function insertMap(e: Any, block: Any): { out: (p: DrawingPoint) => DrawingPoint; into: (p: DrawingPoint) => DrawingPoint } | null {
  const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
  if (!sx || !sy || (e.extrusionDirection?.z ?? 1) < 0 || (e.columnCount ?? 1) > 1 || (e.rowCount ?? 1) > 1) return null;
  const r = (e.rotation ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), at = e.position ?? { x: 0, y: 0 }, base = block?.position ?? { x: 0, y: 0 };
  return {
    out: (p) => { const u = (p.x - base.x) * sx, v = (p.y - base.y) * sy; return { x: at.x + u * c - v * s, y: at.y + u * s + v * c }; },
    into: (p) => { const x = p.x - at.x, y = p.y - at.y; return { x: base.x + (x * c + y * s) / sx, y: base.y + (-x * s + y * c) / sy }; },
  };
}
const mapRect = (r: Rect, f: (p: DrawingPoint) => DrawingPoint): Rect => {
  const q = [f({ x: r[0], y: r[1] }), f({ x: r[2], y: r[1] }), f({ x: r[2], y: r[3] }), f({ x: r[0], y: r[3] })];
  return [Math.min(...q.map((p) => p.x)), Math.min(...q.map((p) => p.y)), Math.max(...q.map((p) => p.x)), Math.max(...q.map((p) => p.y))];
};

/** Extents of a block's content in its own coordinates, or null when any part's extents are unknown. */
function blockExtents(blocks: Record<string, Any>, name: string, state: TrimState, depth = 0): Rect | null {
  if (state.extents.has(name)) return state.extents.get(name)!;
  state.extents.set(name, null);
  let box: Rect | null = null;
  for (const e of blocks[name]?.entities ?? []) {
    let r: Rect | null;
    if (e.type === "INSERT") {
      const inner = depth < 16 && blocks[e.name] ? blockExtents(blocks, e.name, state, depth + 1) : null, map = inner && insertMap(e, blocks[e.name]);
      r = map ? mapRect(inner!, map.out) : null;
    } else if (e.type === "ATTDEF") continue;
    else r = roughBox(e);
    if (!r) return null; // stays null in the memo
    box = box ? [Math.min(box[0], r[0]), Math.min(box[1], r[1]), Math.max(box[2], r[2]), Math.max(box[3], r[3])] : r;
  }
  state.extents.set(name, box);
  return box;
}

function trimToBox(entities: Any[], box: Rect, blocks: Record<string, Any> | undefined, state: TrimState, depth: number): Any[] {
  const nested = !!blocks && depth < TRIM_DEPTH && entities.some((e) => e.type === "INSERT");
  if (entities.length < TRIM_MIN && !nested) return entities;
  let changed = false;
  const out: Any[] = [];
  for (const e of entities) {
    if (e.type === "INSERT" && blocks) {
      const block = blocks[e.name], map = block && insertMap(e, block);
      if (!map) { out.push(e); continue; }
      const inner = blockExtents(blocks, e.name, state);
      if (inner && outside(mapRect(inner, map.out), box)) { changed = true; continue; }
      if (depth + 1 >= TRIM_DEPTH) { out.push(e); continue; }
      const content = block.entities ?? [], trimmed = trimToBox(content, mapRect(box, map.into), blocks, state, depth + 1);
      if (trimmed === content) { out.push(e); continue; }
      const alias = `${e.name}${XCLIP_TRIM_SUFFIX}${trimSerial++}`;
      blocks[alias] = { ...block, name: alias, cadName: block.cadName ?? block.name, entities: trimmed };
      out.push({ ...e, name: alias });
      changed = true;
      continue;
    }
    if (entities.length < TRIM_MIN) { out.push(e); continue; }
    const r = roughBox(e);
    if (r && outside(r, box)) { changed = true; continue; }
    out.push(e);
  }
  return changed ? out : entities;
}

type SceneState = XclipPreparation & { next: number; nested: Map<number, { parent?: number; points: DrawingPoint[]; root: string; holes?: DrawingPoint[][] }> };

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
    const clip = parseDxfXclip(entity), masked = entity.cadWipeoutMasks?.length > 0;
    if (!clip && !masked && inherited === undefined) return processInsert.call(this, entity, blockCtx);
    if (blockCtx.name === entity.name) return; // a block inserting itself
    const block = this.blocks.get(entity.name);
    if (!block) return;
    const nestedCtx = blockCtx.NestedBlockContext(block, entity);
    let tag = inherited;
    let points: DrawingPoint[] = [];
    if (clip) {
      const raw = expandClipRectangle(clip), polygon = fitClip(raw);
      if (!polygon) (this.cadSceneWarnings ??= []).push(xclipTooLargeWarning(entity.name, raw.length));
      else points = polygon;
    }
    // Wipeouts inside the parent block over this INSERT (applyWipeouts): holes along the same chain as clips.
    const holes = masked ? wipeoutMasks(entity, block.data) : [];
    if (points.length || holes.length) {
      tag = state.next++;
      const m: Matrix3 = nestedCtx.transform, root = (ps: DrawingPoint[]) => ps.map((q) => { const v = new Vector2(q.x, q.y).applyMatrix3(m); return { x: v.x, y: v.y }; });
      state.nested.set(tag, { parent: inherited, root: blockCtx.block.data.name, points: root(points), ...(holes.length ? { holes: holes.map(root) } : {}) });
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
    for (const [alias, points] of state.top) { const offset = offsetOf(alias), masks = state.masks.get(alias); if (offset) tables.top[alias] = { points, offset, ...(masks ? { masks } : {}) }; }
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

/** Wipeout holes for one definition batch: the block copy's own and those along its nested chain (block-local). */
export function maskChain(tables: XclipTables, block: string, layer: string | null = null): DrawingPoint[][] {
  const local = (points: DrawingPoint[], o: DrawingPoint) => points.map((q) => ({ x: q.x - o.x, y: q.y - o.y }));
  const top = tables.top[block], out = (top?.masks ?? []).map((poly) => local(poly, top!.offset)), seen = new Set<number>();
  for (let tag = xclipLayerTag(layer); tag !== null && tag !== undefined && !seen.has(tag);) {
    seen.add(tag);
    const n = tables.nested[tag];
    if (!n || n.root !== block) break;
    for (const h of n.holes ?? []) out.push(local(h, n.offset));
    tag = n.parent ?? null;
  }
  return out.filter((p) => p.length >= 3 && p.length <= XCLIP_POINT_LIMIT);
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

/** Copy of a dxf-viewer material that discards fragments outside every polygon (one uniform set per level) and inside
 * any wipeout hole. */
export function clipMaterial(base: RawShaderMaterial, polygons: DrawingPoint[][], holes: DrawingPoint[][] = []): RawShaderMaterial {
  if (!base.vertexShader.includes(VERTEX_POS) || !base.vertexShader.includes(VERTEX_MAIN) || !base.fragmentShader.includes(FRAGMENT_MAIN))
    throw new Error("XCLIP shader version mismatch");
  const material = base.clone();
  const decls: string[] = [], tests: string[] = [];
  [...polygons, ...holes].forEach((poly, k) => {
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
    tests.push(k < polygons.length ? `!fatcatInside${k}(fatcatLocal)` : `fatcatInside${k}(fatcatLocal)`);
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
      const polygons = clipChain(tables, name, definition.key.layerName), holes = maskChain(tables, name, definition.key.layerName);
      for (const obj of definition.CreateObjects(instance)) {
        if (polygons.length || holes.length) {
          const key = obj.material.uuid + "|" + name + "|" + (definition.key.layerName ?? "");
          let material = cache.get(key);
          if (!material) {
            try { material = clipMaterial(obj.material, polygons, holes); cache.set(key, material); } catch { material = undefined; }
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
