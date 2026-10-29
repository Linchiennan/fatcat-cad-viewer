// REGION outline from its ACIS text (惠宇施工圖、上晴公設: DWG 2004/2010 regions, all one planar face whose edges are
// straight-curve or ellipse-curve). LibreDWG passes the SAT text through in group 1; in these versions every character c
// is stored as 159 - c (space kept), and "^ " is the DXF escape for "^". DWG 2013+ keeps the shape elsewhere (no text).
// Each edge becomes a LINE, ARC, CIRCLE or ELLIPSE the viewer already draws, with the region's layer and colour.

type Vec = [number, number, number];
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Plain SAT text from the stored lines, or "" when it is not old-style encrypted SAT. */
export function decodeAcis(lines: string[]): string {
  const text = lines.map(l => [...l.replace(/\^ /g, "^")].map(ch => ch === " " ? " " : String.fromCharCode(159 - ch.charCodeAt(0))).join("")).join("\n");
  return /^\d+ \d+ \d+ \d+/.test(text) ? text : "";
}

interface SatRecord { name: string; fields: string[] }

function satRecords(sat: string): SatRecord[] {
  // Three header lines (version, product, tolerances); then records, each ending with "#". LibreDWG keeps the converted
  // text in blocks and starts a new DXF line at each block end, even inside a number (W12: "4.5857" / "5 0 0 1 F F #"),
  // so only a line ending a record is followed by a space; a line split for length already ends with one.
  const body = sat.split("\n").slice(3).map(l => (l.trimEnd().endsWith("#") ? l + " " : l)).join("").split("End-of-ACIS-data")[0];
  return body.split("#").map(r => r.trim().split(/\s+/)).filter(t => t[0]).map(t => {
    if (/^-\d+$/.test(t[0])) t.shift(); // numbered records ("-12 edge ...")
    return { name: t[0], fields: t.slice(1) };
  });
}

const num = (s: string) => Number(s);
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** ACIS transform: 3×3 rotation rows, translation, scale; points as row vectors (p·R)·s + t. */
function satTransform(f: string[]): { point(p: Vec): Vec; vector(v: Vec): Vec } {
  const n = f.filter(x => !x.startsWith("$")).map(num);
  const [a, b, c, d, e, g, h, i, j, tx, ty, tz, s = 1] = n;
  const vector = (v: Vec): Vec => [(v[0] * a + v[1] * d + v[2] * h) * s, (v[0] * b + v[1] * e + v[2] * i) * s, (v[0] * c + v[1] * g + v[2] * j) * s];
  return { vector, point: p => { const v = vector(p); return [v[0] + tx, v[1] + ty, v[2] + tz]; } };
}

/** Outline entities (LINE / ARC / CIRCLE / ELLIPSE, viewer units: radians) of one region, or null if it cannot be read. */
export function regionOutline(acis: string[] | undefined): Any[] | null {
  if (!acis?.length) return null;
  const sat = decodeAcis(acis);
  if (!sat) return null;
  const records = satRecords(sat);
  const at = (ref: string | undefined) => (ref && ref.startsWith("$") ? records[num(ref.slice(1))] : undefined);
  const body = records.find(r => r.name === "body");
  const tr = body ? at(body.fields.filter(x => x.startsWith("$")).at(-1)) : undefined;
  const xf = tr?.name === "transform" ? satTransform(tr.fields) : null;
  const P = (p: Vec) => (xf ? xf.point(p) : p), V = (v: Vec) => (xf ? xf.vector(v) : v);
  const point = (ref: string): Vec | null => {
    const vtx = at(ref);
    const pt = vtx && at(vtx.fields.filter(x => x.startsWith("$")).at(-1));
    if (pt?.name !== "point") return null;
    const n = pt.fields.filter(x => !x.startsWith("$")).map(num);
    return P([n[0], n[1], n[2]]);
  };
  const out: Any[] = [], lines: [string, string][] = [];
  // Numbers come rounded to 6 digits (LibreDWG writes SAB as SAT with %g), so a line end and the arc beside it can miss by
  // 0.05 at 13919.6. Both share one vertex record: give that vertex the arc's end, then draw the lines between vertices.
  const onArc = new Map<string, Vec>();
  for (const edge of records.filter(r => r.name === "edge")) {
    const f = edge.fields;
    const vi = f.findIndex(x => at(x)?.name === "vertex"), vj = f.findIndex((x, k) => k > vi && at(x)?.name === "vertex");
    const curve = f.map(at).find(r => r?.name.endsWith("-curve"));
    if (vi < 0 || vj < 0 || !curve) return null;
    const start = point(f[vi]), end = point(f[vj]);
    if (!start || !end) return null;
    const forward = !f.includes("reversed");
    // Edge parameters follow each vertex (ACIS 7+); a reversed edge runs against its curve (curve t = -edge t).
    const t0 = num(f[vi + 1]), t1 = num(f[vj + 1]);
    const hasParams = Number.isFinite(t0) && Number.isFinite(t1);
    const [lo, hi] = hasParams ? (forward ? [t0, t1] : [-t1, -t0]) : [0, 0];
    const c = curve.fields.filter(x => !x.startsWith("$") && x !== "F" && x !== "T").map(num);
    if (curve.name === "straight-curve") { lines.push([f[vi], f[vj]]); continue; }
    if (curve.name !== "ellipse-curve" || !hasParams) return null;
    const center = P([c[0], c[1], c[2]]), normal: Vec = [c[3], c[4], c[5]], major: Vec = [c[6], c[7], c[8]], ratio = c[9];
    const u = V(major), v0 = V(cross(normal, major)), len = Math.hypot(...cross(normal, major)) || 1, ml = Math.hypot(...major);
    const v: Vec = [v0[0] / len * ml * ratio, v0[1] / len * ml * ratio, v0[2] / len * ml * ratio];
    // Planar regions in the XY plane: a curve whose second axis turns clockwise is drawn with negated parameters.
    const ccw = u[0] * v[1] - u[1] * v[0] >= 0;
    const on = (t: number): Vec => [0, 1, 2].map(k => center[k] + u[k] * Math.cos(t) + v[k] * Math.sin(t)) as Vec;
    onArc.set(f[vi], on(forward ? t0 : -t0)); onArc.set(f[vj], on(forward ? t1 : -t1));
    const [a0, a1] = ccw ? [lo, hi] : [-hi, -lo];
    const full = hi - lo >= 2 * Math.PI - 1e-6;
    const r = Math.hypot(u[0], u[1]), rv = Math.hypot(v[0], v[1]), rot = Math.atan2(u[1], u[0]);
    const ctr = { x: center[0], y: center[1], z: center[2] };
    if (Math.abs(r - rv) <= 1e-9 * Math.max(1, r)) {
      out.push(full ? { type: "CIRCLE", center: ctr, radius: r } : { type: "ARC", center: ctr, radius: r, startAngle: a0 + rot, endAngle: a1 + rot });
    } else {
      out.push({ type: "ELLIPSE", center: ctr, majorAxisEndPoint: { x: u[0], y: u[1], z: u[2] }, axisRatio: rv / r, startAngle: full ? 0 : a0, endAngle: full ? 2 * Math.PI : a1 });
    }
  }
  for (const [a, b] of lines) {
    const p = onArc.get(a) ?? point(a)!, q = onArc.get(b) ?? point(b)!;
    out.push({ type: "LINE", vertices: [{ x: p[0], y: p[1], z: p[2] }, { x: q[0], y: q[1], z: q[2] }] });
  }
  return out.length ? out : null;
}

/** Replaces each readable REGION in a list by its outline entities (keeping layer, colour, line type and handle). */
export function expandRegions(list: Any[]): Any[] {
  if (!list.some(e => e?.type === "REGION" && e.acis)) return list;
  return list.flatMap(e => {
    if (e?.type !== "REGION") return [e];
    const parts = regionOutline(e.acis);
    if (!parts) return [e];
    const { acis: _a, type: _t, ...props } = e; // eslint-disable-line @typescript-eslint/no-unused-vars
    return parts.map(p => ({ ...props, ...p, cadRegion: e.handle }));
  });
}
