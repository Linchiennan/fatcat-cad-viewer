// WIPEOUT (遮罩): hide what is drawn *before* it inside its boundary. The renderer batches geometry and keeps
// no per-entity draw order, so masking is geometric: earlier lines/polylines are cut where they cross the
// wipeout, later ones stay whole. Draw order follows SORTENTSTABLE sort handles, else the entity handle.
type Any = any;
type P = { x: number; y: number };

/** World polygon from the IMAGE-style definition: pixel (x,y) with y down, 1×1 image, origin at its center. */
export function wipeoutPolygon(w: { position: P; u: P; v: P; clip: P[] }): P[] {
  let clip = w.clip;
  if (clip.length === 2) clip = [clip[0], { x: clip[1].x, y: clip[0].y }, clip[1], { x: clip[0].x, y: clip[1].y }];
  if (clip.length < 3) clip = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];
  return clip.map((c) => ({ x: w.position.x + (c.x + 0.5) * w.u.x + (0.5 - c.y) * w.v.x, y: w.position.y + (c.x + 0.5) * w.u.y + (0.5 - c.y) * w.v.y }));
}

/** Strictly inside: points on the boundary count as outside, so lines along a wipeout edge stay whole
 * whichever side of the polygon they lie on (the frame, when shown, is drawn over them anyway). */
function inside(p: P, poly: P[]): boolean {
  const span = Math.max(...poly.map((q) => Math.abs(q.x - poly[0].x) + Math.abs(q.y - poly[0].y)), 1e-12), eps = span * 1e-4;
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j], len = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (len > 0 && Math.abs(cross) / len <= eps && dot >= -eps * len && dot <= len * len + eps * len) return false;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Parts of segment a→b lying outside the polygon. */
export function segmentOutside(a: P, b: P, poly: P[]): [P, P][] {
  const ts = [0, 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[j], d = poly[i], ex = d.x - c.x, ey = d.y - c.y, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-15) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den, s = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
    if (t > 0 && t < 1 && s >= 0 && s <= 1) ts.push(t);
  }
  ts.sort((m, n) => m - n);
  const at = (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t });
  const out: [P, P][] = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    if (ts[k + 1] - ts[k] < 1e-12) continue;
    if (!inside(at((ts[k] + ts[k + 1]) / 2), poly)) out.push([at(ts[k]), at(ts[k + 1])]);
  }
  return out;
}

function box(ps: P[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
  return { minX, minY, maxX, maxY };
}
const overlaps = (a: Any, b: Any) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** Points along an arc from angle a0 counter-clockwise by sweep, at most 2° apart. */
function arcPoints(c: P, r: number, a0: number, sweep: number): P[] {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 90)));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + r * Math.cos(a0 + sweep * i / n), y: c.y + r * Math.sin(a0 + sweep * i / n) }));
}

/**
 * Arcs, circles and bulged polylines as point runs, so the wipeout cut works on them as on straight lines
 * (惠宇 007 廚房水電配置圖: arcs and circles under the notes' wipeouts still showed). Mirrored (negative extrusion)
 * and wide ones are left alone.
 */
function curveRun(e: Any): P[] | null {
  if ((e.extrusionDirection?.z ?? 1) < 0) return null;
  if (e.type === "CIRCLE" && e.center && e.radius > 0) return arcPoints(e.center, e.radius, 0, 2 * Math.PI);
  if (e.type === "ARC" && e.center && e.radius > 0 && Number.isFinite(e.startAngle) && Number.isFinite(e.endAngle)) {
    let sweep = e.endAngle - e.startAngle;
    while (sweep <= 0) sweep += 2 * Math.PI;
    return arcPoints(e.center, e.radius, e.startAngle, sweep);
  }
  if (e.type === "LWPOLYLINE" && Array.isArray(e.vertices) && e.vertices.length >= 2 && !e.width && !e.vertices.some((v: Any) => v.startWidth || v.endWidth)) {
    const vs = e.vertices, out: P[] = [{ x: vs[0].x, y: vs[0].y }];
    for (let i = 0; i < (e.shape ? vs.length : vs.length - 1); i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length], bulge = a.bulge ?? 0;
      if (!bulge) { out.push({ x: b.x, y: b.y }); continue; }
      const chord = Math.hypot(b.x - a.x, b.y - a.y), theta = 4 * Math.atan(bulge);
      if (!(chord > 0)) continue;
      const r = chord / (2 * Math.sin(Math.abs(theta) / 2)), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const h = r * Math.cos(Math.abs(theta) / 2) * Math.sign(bulge), c = { x: mid.x - (b.y - a.y) / chord * h, y: mid.y + (b.x - a.x) / chord * h };
      out.push(...arcPoints(c, r, Math.atan2(a.y - c.y, a.x - c.x), theta).slice(1));
    }
    return out;
  }
  return null;
}

function points(e: Any): P[] | null {
  if (e.type === "LINE" && e.vertices?.length === 2) return e.vertices;
  if (e.type === "LWPOLYLINE" && Array.isArray(e.vertices)) return e.vertices;
  if (e.position) return [e.position];
  if (e.center) return [e.center];
  return null;
}

/** Wipeout masks one INSERT may carry: each is a shader loop over its points, and phones allow few uniforms. */
export const WIPEOUT_MASK_LIMIT = 24;

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Corners of a block-coordinate box through an INSERT's transform (no arrays, no mirrored extrusion). */
function insertCorners(e: Any, b: Box, base: P): P[] | null {
  if ((e.extrusionDirection?.z ?? 1) < 0 || (e.columnCount ?? 1) > 1 || (e.rowCount ?? 1) > 1) return null;
  const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = (e.rotation ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), at = e.position ?? { x: 0, y: 0 };
  return [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(([x, y]) => {
    const u = (x - base.x) * sx, v = (y - base.y) * sy;
    return { x: at.x + u * c - v * s, y: at.y + u * s + v * c };
  });
}

/** Rough extents of a block's content in its own coordinates (nested INSERTs through their transforms), memoised. */
function blockBox(blocks: Record<string, Any>, name: string, memo: Map<string, Box | null>, depth = 0): Box | null {
  if (memo.has(name)) return memo.get(name)!;
  memo.set(name, null);
  const all: P[] = [];
  for (const e of blocks[name]?.entities ?? []) {
    if (e.type === "INSERT") {
      const inner = depth < 16 ? blockBox(blocks, e.name, memo, depth + 1) : null;
      const corners = inner && insertCorners(e, inner, blocks[e.name]?.position ?? { x: 0, y: 0 });
      if (corners) all.push(...corners);
      continue;
    }
    const ps = curveRun(e) ?? points(e);
    if (ps) all.push(...ps.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  const out = all.length ? box(all) : null;
  memo.set(name, out);
  return out;
}

/**
 * Cut earlier lines/polylines under each wipeout in one ordered entity list; returns the new list. With `blocks` (the
 * top-level list), an earlier INSERT the wipeout overlaps gets the wipeout polygon in `cadWipeoutMasks` (world
 * coordinates); xclipScene hides that part of its block like an inverted clip (澄品 B2~4F 臨時水電: the fans of a
 * column symbol showed through the notes' wipeouts).
 */
export function applyWipeouts(entities: Any[], order: (e: Any) => number, showFrame: boolean, skipped: Map<string, number>, blocks?: Record<string, Any>): Any[] {
  const memo = new Map<string, Box | null>();
  const wipes = entities.filter((e) => e.type === "WIPEOUT" && Array.isArray(e.polygon) && e.polygon.length >= 3 && !e.hidden);
  if (!wipes.length) return entities.filter((e) => e.type !== "WIPEOUT");
  let list = entities.filter((e) => e.type !== "WIPEOUT");
  // Each entity's points and box are worked out once, not again for every wipeout (公設平面分區圖 1F: thousands of
  // entities times hundreds of wipeouts took 1.7 s of the open).
  type Geometry = { straight: boolean; run: P[] | null; ps: P[] | null; box: Box | null; corners?: P[] | null };
  const geometry = new WeakMap<Any, Geometry>();
  const geometryOf = (e: Any): Geometry => {
    let g = geometry.get(e);
    if (g) return g;
    if (e.type === "INSERT" && blocks) {
      const inner = blockBox(blocks, e.name, memo), corners = inner && insertCorners(e, inner, blocks[e.name]?.position ?? { x: 0, y: 0 });
      g = { straight: false, run: null, ps: null, corners, box: corners ? box(corners) : null };
    } else {
      const straight = e.type === "LINE" || (e.type === "LWPOLYLINE" && !e.vertices.some((v: Any) => v.bulge) && !e.width && !e.vertices.some((v: Any) => v.startWidth || v.endWidth));
      const run = straight ? null : curveRun(e), ps = run ?? points(e);
      g = { straight, run, ps, box: ps ? box(ps) : null };
    }
    geometry.set(e, g);
    return g;
  };
  const orders = new WeakMap<Any, number>();
  const orderOf = (e: Any) => { let o = orders.get(e); if (o === undefined) orders.set(e, o = order(e)); return o; };
  for (const w of [...wipes].sort((m, n) => order(m) - order(n))) {
    const wb = box(w.polygon), wo = order(w), next: Any[] = [];
    for (const e of list) {
      if (orderOf(e) >= wo || e.cadWipeoutPiece === wo || (e.cadSpace ?? "Model") !== (w.cadSpace ?? "Model")) { next.push(e); continue; }
      if (e.type === "INSERT" && blocks) {
        const g = geometryOf(e), corners = g.corners;
        if (corners && overlaps(g.box, wb)) {
          if ((e.cadWipeoutMasks?.length ?? 0) < WIPEOUT_MASK_LIMIT) next.push({ ...e, cadWipeoutMasks: [...(e.cadWipeoutMasks ?? []), w.polygon.map((p: P) => ({ x: p.x, y: p.y }))] });
          else { skipped.set("INSERT", (skipped.get("INSERT") ?? 0) + 1); next.push(e); }
        } else if (!corners && points(e)?.some((p) => inside(p, w.polygon))) { skipped.set("INSERT", (skipped.get("INSERT") ?? 0) + 1); next.push(e); }
        else next.push(e);
        continue;
      }
      const { straight, run, ps, box: eb } = geometryOf(e);
      if (!ps || !overlaps(eb, wb)) { next.push(e); continue; }
      if (!straight && !run) {
        if (ps.some((p) => inside(p, w.polygon)) || e.type !== "LWPOLYLINE") skipped.set(e.type, (skipped.get(e.type) ?? 0) + 1);
        next.push(e); continue;
      }
      const vs: P[] = run ?? (e.type === "LINE" ? e.vertices : e.shape ? [...e.vertices, e.vertices[0]] : e.vertices);
      const pieces: [P, P][] = [];
      let touched = false;
      for (let i = 0; i + 1 < vs.length; i++) {
        const kept = segmentOutside(vs[i], vs[i + 1], w.polygon);
        // Only a removed length counts; splitting at polygon corners alone changes nothing visible.
        const full = Math.hypot(vs[i + 1].x - vs[i].x, vs[i + 1].y - vs[i].y), keptLen = kept.reduce((n, [a, b]) => n + Math.hypot(b.x - a.x, b.y - a.y), 0);
        if (full - keptLen > full * 1e-9 + 1e-12) touched = true;
        pieces.push(...kept);
      }
      if (!touched) { next.push(e); continue; }
      // Rejoin consecutive kept pieces into open polylines so line type patterns stay continuous.
      const wSpan = Math.hypot(wb.maxX - wb.minX, wb.maxY - wb.minY), joinTolerance = wSpan * 1e-7;
      const runs: P[][] = [];
      // A rounding sliver where a covered line meets the boundary is no piece (上晴 公設B區-2: 113 lines under a
      // wipeout each kept a 7e-10 stub).
      for (const [a, b] of pieces) {
        if (Math.hypot(b.x - a.x, b.y - a.y) <= joinTolerance) continue;
        const last = runs.at(-1), end = last?.at(-1);
        if (end && Math.hypot(end.x - a.x, end.y - a.y) <= joinTolerance) last!.push(b); else runs.push([a, b]);
      }
      runs.forEach((run, k) => next.push({ ...e, type: "LWPOLYLINE", shape: false, handle: k ? `${e.handle}:w${k}` : e.handle, vertices: run.map((p) => ({ x: p.x, y: p.y })), cadWipeoutSource: e.type }));
    }
    list = next;
    if (showFrame) list.push({ type: "LWPOLYLINE", handle: `${w.handle}:frame`, layer: w.layer, color: w.color, colorIndex: w.colorIndex, lineType: "CONTINUOUS", shape: true, vertices: w.polygon.map((p: P) => ({ x: p.x, y: p.y })), cadSpace: w.cadSpace, inPaperSpace: w.inPaperSpace, cadWipeoutPiece: wo });
  }
  return list;
}
