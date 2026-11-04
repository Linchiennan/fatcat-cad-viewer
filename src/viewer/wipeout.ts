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

const box = (ps: P[]) => ps.reduce((m, p) => ({ minX: Math.min(m.minX, p.x), minY: Math.min(m.minY, p.y), maxX: Math.max(m.maxX, p.x), maxY: Math.max(m.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
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

/** Cut earlier lines/polylines under each wipeout in one ordered entity list; returns the new list. */
export function applyWipeouts(entities: Any[], order: (e: Any) => number, showFrame: boolean, skipped: Map<string, number>): Any[] {
  const wipes = entities.filter((e) => e.type === "WIPEOUT" && Array.isArray(e.polygon) && e.polygon.length >= 3 && !e.hidden);
  if (!wipes.length) return entities.filter((e) => e.type !== "WIPEOUT");
  let list = entities.filter((e) => e.type !== "WIPEOUT");
  for (const w of [...wipes].sort((m, n) => order(m) - order(n))) {
    const wb = box(w.polygon), wo = order(w), next: Any[] = [];
    for (const e of list) {
      if (order(e) >= wo || e.cadWipeoutPiece === wo || (e.cadSpace ?? "Model") !== (w.cadSpace ?? "Model")) { next.push(e); continue; }
      const straight = e.type === "LINE" || (e.type === "LWPOLYLINE" && !e.vertices.some((v: Any) => v.bulge) && !e.width && !e.vertices.some((v: Any) => v.startWidth || v.endWidth));
      const run = straight ? null : curveRun(e);
      const ps = run ?? points(e);
      if (!ps || !overlaps(box(ps), wb)) { next.push(e); continue; }
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
      for (const [a, b] of pieces) {
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
