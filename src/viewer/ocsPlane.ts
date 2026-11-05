// Entities drawn in a tilted or upright plane (extrusion not along ±Z) are stored in their own object coordinate
// system. CAD places them in the world with the arbitrary-axis algorithm and the plan view shows their projection:
// an upright profile is seen edge-on as a line (惠宇 A06 廚房水電配置圖: the sink block's side profiles, extrusion
// (0,1,0), were drawn flat as two extra sinks). The scene only mirrors for negative Z, so these are projected here.
type Any = any;
type V3 = { x: number; y: number; z: number };

const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };

/** The plane's axes in world coordinates, or null when the entity lies in the XY plane (±Z extrusion). */
export function ocsAxes(n: Any): { ax: V3; ay: V3; az: V3 } | null {
  if (!n) return null;
  const x = Number(n.x) || 0, y = Number(n.y) || 0, z = Number(n.z) || 0;
  if (!(Math.hypot(x, y, z) > 0)) return null;
  const az = unit({ x, y, z });
  if (Math.abs(Math.abs(az.z) - 1) < 1e-9) return null;
  const ax = unit(Math.abs(az.x) < 1 / 64 && Math.abs(az.y) < 1 / 64 ? cross({ x: 0, y: 1, z: 0 }, az) : cross({ x: 0, y: 0, z: 1 }, az));
  return { ax, ay: cross(az, ax), az };
}

const ARC_STEP = Math.PI / 32;

/** Points of a polyline in its own plane, bulge arcs subdivided. */
function polylinePoints(e: Any): { x: number; y: number; z: number }[] {
  let vs: Any[] = e.vertices ?? [];
  if (e.includesCurveFitVertices || e.includesSplineFitVertices) vs = vs.filter((v: Any) => v.splineVertex || v.curveFittingVertex);
  vs = vs.filter((v: Any) => Number.isFinite(v.x) && Number.isFinite(v.y));
  const z0 = Number(e.elevation) || 0, out: { x: number; y: number; z: number }[] = [];
  const last = e.shape ? vs.length : vs.length - 1;
  vs.forEach((p: Any, i: number) => {
    const z = Number.isFinite(p.z) ? p.z : z0;
    out.push({ x: p.x, y: p.y, z });
    const b = p.bulge ?? 0;
    if (!b || i >= last) return;
    const q = vs[(i + 1) % vs.length], chord = Math.hypot(q.x - p.x, q.y - p.y);
    if (!(chord > 0)) return;
    // Bulge = tan(sweep/4); the centre lies on the chord's left normal at chord*(1-b²)/(4b).
    const sweep = 4 * Math.atan(b), s = chord * (1 - b * b) / (4 * b), r = chord * (1 + b * b) / (4 * Math.abs(b));
    const cx = (p.x + q.x) / 2 - s * (q.y - p.y) / chord, cy = (p.y + q.y) / 2 + s * (q.x - p.x) / chord;
    const a0 = Math.atan2(p.y - cy, p.x - cx), n = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
    for (let k = 1; k < n; k++) { const a = a0 + sweep * k / n; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z }); }
  });
  return out;
}

function arcPoints(c: Any, r: number, start: number, end: number | null) {
  let sweep = end === null ? 2 * Math.PI : end - start;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(sweep / ARC_STEP)), out = [];
  for (let k = 0; k <= (end === null ? n - 1 : n); k++) { const a = start + sweep * k / n; out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: Number(c.z) || 0 }); }
  return out;
}

/** World XY of the entity's outline, `closed` when it is a ring; null for entities left as they are. */
function planeOutline(e: Any, axes: { ax: V3; ay: V3; az: V3 }): { pts: { x: number; y: number }[]; closed: boolean } | null {
  const { ax, ay, az } = axes;
  const world = (p: { x: number; y: number; z: number }) => ({ x: p.x * ax.x + p.y * ay.x + p.z * az.x, y: p.x * ax.y + p.y * ay.y + p.z * az.y });
  switch (e.type) {
    case 'LWPOLYLINE':
    case 'POLYLINE':
      if (e.type === 'POLYLINE' && (e.is3dPolyline || e.is3dPolygonMesh || e.isPolyfaceMesh)) return null; // already in world coordinates
      return { pts: polylinePoints(e).map(world), closed: !!e.shape };
    case 'CIRCLE':
      return e.radius > 0 && e.center ? { pts: arcPoints(e.center, e.radius, 0, null).map(world), closed: true } : null;
    case 'ARC':
      return e.radius > 0 && e.center ? { pts: arcPoints(e.center, e.radius, e.startAngle ?? 0, e.endAngle ?? 0).map(world), closed: false } : null;
    case 'SOLID':
    case 'TRACE': {
      const p = (e.points ?? []).filter((q: Any) => q && Number.isFinite(q.x));
      if (p.length < 3) return null;
      // SOLID corners run 1-2-4-3
      const ring = p.length === 4 ? [p[0], p[1], p[3], p[2]] : p;
      return { pts: ring.map((q: Any) => world({ x: q.x, y: q.y, z: Number(q.z) || 0 })), closed: true };
    }
    case 'ELLIPSE': {
      // An ellipse is stored in world coordinates; its minor axis is the normal × major axis.
      const c = e.center, m = e.majorAxisEndPoint, r = e.axisRatio;
      if (!c || !m || !(r > 0)) return null;
      const mj: V3 = { x: m.x, y: m.y, z: m.z ?? 0 }, mn = cross(az, mj);
      const start = e.startAngle ?? 0, end = e.endAngle ?? start + 2 * Math.PI;
      const full = Math.abs(end - start - 2 * Math.PI) < 1e-6 || end === start;
      return { pts: arcPoints({ x: 0, y: 0, z: 0 }, 1, start, full ? null : end).map((q) => ({ x: c.x + q.x * mj.x + r * q.y * mn.x, y: c.y + q.x * mj.y + r * q.y * mn.y })), closed: full };
    }
  }
  return null;
}

/** The entity seen from above: the projected outline, plus its far face and side edges when it has a thickness. */
export function projectObliqueEntity(e: Any): Any[] | null {
  const axes = ocsAxes(e.extrusionDirection);
  if (!axes) return null;
  const outline = planeOutline(e, axes);
  if (!outline || outline.pts.length < 2) return null;
  const { extrusionDirection: _n, elevation: _z, bulge: _b, width: _w, startWidth: _s, endWidth: _e, thickness: _t, depth: _d, center: _c, radius: _r, points: _p, majorAxisEndPoint: _m, axisRatio: _a, startAngle: _sa, endAngle: _ea, ...rest } = e;
  const line = (pts: { x: number; y: number }[], closed: boolean, handle: string | undefined) =>
    ({ ...rest, type: 'LWPOLYLINE', handle, vertices: pts.map((p) => ({ x: p.x, y: p.y })), shape: closed, cadProjectedFrom: e.type });
  const out = [line(outline.pts, outline.closed, e.handle)];
  const t = Number(e.thickness ?? e.depth) || 0, dx = t * axes.az.x, dy = t * axes.az.y;
  if (t && Math.hypot(dx, dy) > 0) {
    out.push(line(outline.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })), outline.closed, e.handle && `${e.handle}~far`));
    // Side edges join the two faces at the polyline's own corners.
    const polyline = e.type === 'LWPOLYLINE' || e.type === 'POLYLINE';
    const corners = polyline ? planeOutline({ ...e, vertices: (e.vertices ?? []).map((v: Any) => ({ ...v, bulge: 0 })) }, axes)!.pts
      : e.type === 'SOLID' || e.type === 'TRACE' ? outline.pts : [];
    corners.forEach((p, i) => out.push(line([p, { x: p.x + dx, y: p.y + dy }], false, e.handle && `${e.handle}~edge${i}`)));
  }
  return out;
}

/** Replaces tilted-plane entities in a list by their plan-view projection; the list is returned unchanged when none. */
export function projectObliquePlanes(entities: Any[]): Any[] {
  if (!entities.some((e) => ocsAxes(e?.extrusionDirection))) return entities;
  return entities.flatMap((e) => projectObliqueEntity(e) ?? [e]);
}
