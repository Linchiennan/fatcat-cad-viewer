// Measurement core (T16): units, basic geometry, the measurement index built while the scene is
// tessellated, object picking and basic snaps. Owner: P4 group C.
// Advanced snaps (intersection / perpendicular) stay in our engineering.advancedSnap + curveSnaps.
import type { DrawingBounds, DrawingPoint, EngineReport } from "../types/drawing";
import type { SnapCurve, SnapPrimitive } from "./curveSnaps";
import { dimensionBlockOffset } from "./dimensionBlock";

/** "drawing" = unknown drawing unit (no conversion). */
export type MeasurementUnit = "drawing" | "mm" | "cm" | "m" | "in" | "ft";
export type MeasurementMode = "distance" | "path" | "area" | "angle" | "object";
export type SnapKind = "endpoint" | "midpoint" | "center" | "quadrant" | "intersection" | "perpendicular";

/** A snap point; `layer` is set for index snaps (advanced snaps computed on the fly may omit it). */
export type SnapPoint = DrawingPoint & { kind: SnapKind; layer?: string };

/** A block an entity sits in, outer to inner (anonymous *D dimension blocks are left out). */
export type BlockRef = { name: string; layer?: string; attributes: { tag: string; text: string }[] };

/** One pickable / measurable object of the index (T16 3.6-2). */
export type MeasurableEntity = {
  /** DXF type (LINE, LWPOLYLINE, CIRCLE, TEXT, DIMENSION…). */
  kind: string;
  layer: string;
  /** Sampled outline in drawing coordinates. */
  points: DrawingPoint[];
  bounds: DrawingBounds;
  /** Length in drawing units (0 when not measurable). */
  length: number;
  area?: number;
  /** Length / area come from sampling, not an exact formula. */
  approximate: boolean;
  curved?: boolean;
  /** Exact primitives for advanced snaps (line segments or affine conic arcs). */
  primitives?: SnapPrimitive[];
  /** Original properties: text, colorIndex, lineType, textHeight, styleName, radius, pattern, handle, drawn colour… */
  properties?: Record<string, unknown>;
  blockChain?: BlockRef[];
  /** Picked for its properties only (text, hatch, solid, dimension parts); no length or area is shown. */
  propertiesOnly?: boolean;
  /** Hit geometry actually drawn: segments and triangles (inside a triangle = distance 0). */
  hit?: { segments: [DrawingPoint, DrawingPoint][]; triangles: [DrawingPoint, DrawingPoint, DrawingPoint][] };
};

/** The measurement index of one sheet (T16 3.6, T14 8.5). Snaps are sorted by x. */
export type MeasurementGeometry = {
  unit: MeasurementUnit;
  entities: MeasurableEntity[];
  snaps: SnapPoint[];
  /** A limit (100,000 objects / 600,000 points / 600,000 snaps / 400,000 visits) was reached. */
  limited: boolean;
  /** Bounds of every measured object were complete (false when XCLIP etc. hid parts). */
  completeBounds: boolean;
  /** Bounds used to pick the initial view (T14 4.4). */
  fitBounds: DrawingBounds[];
  fitComplete: boolean;
};

/** What the engine keeps and hands on: the index plus the report and reading-position key. */
export type MeasurementIndex = MeasurementGeometry & { report?: EngineReport; viewKey?: string };

/** A finished measurement kept on screen (same shape as measureResults.MeasureResult). */
/** Anchor direction is recorded only when the resolver actually reported a perpendicular snap. */
export type MeasurementPoint = DrawingPoint & { perpendicularFrom?: DrawingPoint };
export type KeptMeasurement = { mode: MeasurementMode; points: MeasurementPoint[]; object?: Pick<MeasurableEntity, "length" | "area" | "approximate"> };

/** Measuring state the App passes to the engine and to MeasureStrip (T14 8.4). */
export type MeasurementSettings = {
  enabled: boolean;
  mode: MeasurementMode;
  points: MeasurementPoint[];
  snap: boolean;
  snapKinds: SnapKind[];
  /** Info mode: pick objects only, no measuring lines. */
  info: boolean;
  kept: KeptMeasurement[];
};

/** Index limits (T16 3.6-6). */
export const MEASUREMENT_LIMITS = { entities: 100_000, points: 600_000, snaps: 600_000, visits: 400_000 } as const;

// ---------------------------------------------------------------------------------------------
// Units and plain geometry (T16 3.3, 3.4)

const UNIT_BY_INSUNITS: Record<number, MeasurementUnit> = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };
/** Metres per unit. */
const METRES: Record<Exclude<MeasurementUnit, "drawing">, number> = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 };

/** INSUNITS → unit: 1 in, 2 ft, 4 mm, 5 cm, 6 m; anything else = drawing unit (T16 3.4-1). */
export function unitFromInsunits(insunits: unknown): MeasurementUnit {
  const n = typeof insunits === "string" && insunits.trim() !== "" ? Number(insunits) : insunits;
  return typeof n === "number" && Number.isInteger(n) ? UNIT_BY_INSUNITS[n] ?? "drawing" : "drawing";
}

/** Convert a length (or area when `area`) from source to display unit; "drawing" on either side = factor 1. */
export function convertMeasurement(value: number, source: MeasurementUnit, display: MeasurementUnit, area = false): number {
  if (source === "drawing" || display === "drawing") return value;
  const k = METRES[source] / METRES[display];
  return value * (area ? k * k : k);
}

/** Sum of distances between neighbouring points; `closed` adds the last-to-first segment. */
export function pathLength(points: readonly DrawingPoint[], closed = false): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 2) {
    const a = points[points.length - 1], b = points[0];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** Signed shoelace area (counter-clockwise positive), translated to the first point for precision. */
function signedArea(points: readonly DrawingPoint[]): number {
  if (points.length < 3) return 0;
  const o = points[0];
  let s = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    s += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y);
  }
  return s / 2;
}

/** Absolute shoelace area (translated to the first point for precision). */
export function polygonArea(points: readonly DrawingPoint[]): number {
  return Math.abs(signedArea(points));
}

/** Angle at the second of three points, 0–180 degrees; null when an arm is 0 or not finite. */
export function measuredAngle(points: readonly DrawingPoint[]): number | null {
  if (points.length < 3) return null;
  const [a, o, b] = points;
  const ux = a.x - o.x, uy = a.y - o.y, vx = b.x - o.x, vy = b.y - o.y;
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (!(lu > 0) || !(lv > 0) || !Number.isFinite(lu) || !Number.isFinite(lv)) return null;
  const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
  return (Math.acos(c) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------------------------
// Affine transforms: [a, b, c, d, e, f] maps (x, y) to (a·x + c·y + e, b·x + d·y + f).

type Mat = readonly [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const MIRROR_X: Mat = [-1, 0, 0, 1, 0, 0];
/** Types whose points are in their own coordinate system, which a downward normal turns over (INSERT has its own matrix).
 * TEXT, HATCH, SOLID… are indexed from the shapes the renderer drew, already turned over. */
const OCS_TYPES = new Set(["CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE"]);
const apply = (m: Mat, p: DrawingPoint): DrawingPoint => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const linear = (m: Mat, p: DrawingPoint): DrawingPoint => ({ x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y });
/** m ∘ n: apply n first. */
const compose = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const determinant = (m: Mat) => m[0] * m[3] - m[1] * m[2];
/** The scale of a similarity transform (rotation / mirror and one scale), or null when non-uniform. */
function uniformScale(m: Mat): number | null {
  const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
  if (!(sx > 0) || !(sy > 0)) return null;
  const eps = 1e-9 * Math.max(sx, sy);
  return Math.abs(sx - sy) <= eps && Math.abs(m[0] * m[2] + m[1] * m[3]) <= eps * Math.max(sx, sy) ? sx : null;
}

// ---------------------------------------------------------------------------------------------
// Small helpers

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const finite = (p: DrawingPoint | undefined | null): p is DrawingPoint => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const TAU = Math.PI * 2;

/** INSERT placement: base point → scale → rotation → position, mirrored when the extrusion points down. */
function insertMatrix(e: Any, base: DrawingPoint): Mat {
  const sx = num(e.xScale, 1) || 1, sy = num(e.yScale, 1) || 1;
  const r = (num(e.rotation, 0) * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const px = num(e.position?.x, 0), py = num(e.position?.y, 0);
  const a = sx * cos, b = sx * sin, c = -sy * sin, d = sy * cos;
  const m: Mat = [a, b, c, d, px - (a * base.x + c * base.y), py - (b * base.x + d * base.y)];
  return e.extrusionDirection && e.extrusionDirection.z < 0 ? compose(MIRROR_X, m) : m;
}

function boundsOf(points: readonly DrawingPoint[]): DrawingBounds {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of points) {
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
  }
  return box;
}
const unionBounds = (a: DrawingBounds | null, b: DrawingBounds): DrawingBounds => !a ? { ...b } : {
  minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
};
const rectPoints = (b: DrawingBounds): DrawingPoint[] => [
  { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }, { x: b.minX, y: b.minY },
];

/** Point of an affine conic arc at parameter t. */
const conicAt = (c: SnapCurve, t: number): DrawingPoint => ({
  x: c.center.x + c.u.x * Math.cos(t) + c.v.x * Math.sin(t),
  y: c.center.y + c.u.y * Math.cos(t) + c.v.y * Math.sin(t),
});
/** Sample an arc with `stepDeg` degree steps and at least 8 segments (T16 3.6-5). */
function sampleConic(c: SnapCurve, stepDeg: number): DrawingPoint[] {
  const n = Math.max(8, Math.ceil((Math.abs(c.sweep) * 180) / Math.PI / stepDeg - 1e-9));
  const out: DrawingPoint[] = [];
  for (let i = 0; i <= n; i++) out.push(conicAt(c, c.start + (c.sweep * i) / n));
  return out;
}
const mod = (a: number) => ((a % TAU) + TAU) % TAU;
function withinSweep(c: SnapCurve, t: number): boolean {
  if (Math.abs(c.sweep) >= TAU - 1e-12) return true;
  const d = c.sweep >= 0 ? mod(t - c.start) : mod(c.start - t);
  // Angles read from DWG carry float noise (~1e-11 rad): a quadrant at an arc end still counts.
  // Tolerance on the end side only, as the old version did (coordinator decision; t1 gives 50,980 snaps like before).
  return d <= Math.abs(c.sweep) + 1e-9;
}
/** Exact bounds of an arc: ends plus the x / y extremes that fall inside the sweep. */
function conicBounds(c: SnapCurve): DrawingBounds {
  const pts = [conicAt(c, c.start), conicAt(c, c.start + c.sweep)];
  for (const base of [Math.atan2(c.v.x, c.u.x), Math.atan2(c.v.y, c.u.y)]) {
    for (const t of [base, base + Math.PI]) if (withinSweep(c, t)) pts.push(conicAt(c, t));
  }
  return boundsOf(pts);
}
/** Image of a local circle / ellipse arc under m. */
const mapConic = (m: Mat, center: DrawingPoint, u: DrawingPoint, v: DrawingPoint, start: number, sweep: number): SnapCurve =>
  ({ center: apply(m, center), u: linear(m, u), v: linear(m, v), start, sweep });

// ---------------------------------------------------------------------------------------------
// XCLIP (T13 4.4 / T16 3.6-4): boundary "x,y;x,y;…" in the FATCAT_XCLIP xdata of an INSERT.

const XCLIP_NAME = "FATCAT_XCLIP";
const XCLIP_MAX_POINTS = 256;

/** Clip polygon of an INSERT in its block coordinates; 2 points = rectangle. */
function readXclip(e: Any): DrawingPoint[] | null {
  const values = e?.xdata?.[XCLIP_NAME]?.values;
  const raw = Array.isArray(values) ? values.find((v: Any) => v?.code === 1000)?.value : undefined;
  if (typeof raw !== "string") return null;
  const pts = raw.split(";").filter((s) => s.trim()).map((s) => { const [x, y] = s.split(",").map(Number); return { x, y }; });
  if (pts.length < 2 || !pts.every(finite)) return null;
  if (pts.length === 2) {
    const [a, b] = pts;
    return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
  }
  return pts;
}

function distanceToSegment(p: DrawingPoint, a: DrawingPoint, b: DrawingPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy;
  const t = den ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / den)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Even-odd point in polygon (edges count as inside). */
function insidePolygon(poly: readonly DrawingPoint[], p: DrawingPoint): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (distanceToSegment(p, a, b) <= 1e-9 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** Proper crossing of two segments (touching at ends does not count). */
function crosses(a: DrawingPoint, b: DrawingPoint, c: DrawingPoint, d: DrawingPoint): boolean {
  const o = (p: DrawingPoint, q: DrawingPoint, r: DrawingPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// ---------------------------------------------------------------------------------------------
// Picking (T16 3.1, 3.6-7)

function insideTriangle(p: DrawingPoint, a: DrawingPoint, b: DrawingPoint, c: DrawingPoint): boolean {
  const s = (q: DrawingPoint, r: DrawingPoint) => (r.x - q.x) * (p.y - q.y) - (r.y - q.y) * (p.x - q.x);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Distance from `p` to what the entity draws (0 inside a triangle or a text box). */
export function entityDistance(e: MeasurableEntity, p: DrawingPoint): number {
  for (const [a, b, c] of e.hit?.triangles ?? []) if (insideTriangle(p, a, b, c)) return 0;
  let best = Infinity;
  for (const [a, b] of e.hit?.segments ?? []) best = Math.min(best, distanceToSegment(p, a, b));
  const pts = e.points;
  if (pts.length === 1) best = Math.min(best, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distanceToSegment(p, pts[i - 1], pts[i]));
  return best;
}

/** Nearest visible entity within tolerance (inside a triangle or text box = distance 0), or null. */
export function nearestEntity(entities: readonly MeasurableEntity[], point: DrawingPoint, tolerance: number): MeasurableEntity | null {
  if (!finite(point) || !(tolerance >= 0)) return null;
  let best: MeasurableEntity | null = null, dist = tolerance;
  for (const e of entities) {
    const b = e.bounds;
    if (point.x < b.minX - dist || point.x > b.maxX + dist || point.y < b.minY - dist || point.y > b.maxY + dist) continue;
    const d = entityDistance(e, point);
    if (d < dist || (best === null && d <= dist)) { best = e; dist = d; }
  }
  return best;
}

/** First index whose x is >= x in snaps sorted by x. */
function lowerBound(snaps: readonly SnapPoint[], x: number): number {
  let lo = 0, hi = snaps.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (snaps[mid].x < x) lo = mid + 1; else hi = mid; }
  return lo;
}

/**
 * Basic snap (endpoint / midpoint / center / quadrant) nearest to `point` within tolerance, limited to
 * `kinds` (an empty list = every kind, "not set").
 */
export function basicSnap(snaps: readonly SnapPoint[], point: DrawingPoint, tolerance: number, kinds: readonly SnapKind[]): SnapPoint | null {
  if (!finite(point) || !(tolerance >= 0)) return null;
  const allowed = kinds.length ? new Set(kinds) : null;
  let best: SnapPoint | null = null, dist = tolerance;
  for (let i = lowerBound(snaps, point.x - tolerance); i < snaps.length && snaps[i].x <= point.x + tolerance; i++) {
    const s = snaps[i];
    if (s.kind === "intersection" || s.kind === "perpendicular") continue;
    if (allowed && !allowed.has(s.kind)) continue;
    const d = Math.hypot(s.x - point.x, s.y - point.y);
    if (d < dist || (best === null && d <= dist)) { best = s; dist = d; }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Index builder (T16 3.6)

/** What the scene actually drew for one DXF entity, in that entity's own coordinates. */
type DrawnShape = { segments: [DrawingPoint, DrawingPoint][]; triangles: [DrawingPoint, DrawingPoint, DrawingPoint][] };

type Context = {
  m: Mat;
  layer: string;
  chain: BlockRef[];
  /** Clip polygons in drawing coordinates, outer first. */
  clips: DrawingPoint[][];
  stack: string[];
  /** Set while expanding a dimension block: its parts are dimension properties only. */
  dimension?: Record<string, unknown>;
};

type BuildOptions = {
  shapes?: WeakMap<object, DrawnShape>;
  skipPaperSpace: boolean;
};

const TEXT_KINDS = new Set(["TEXT", "MTEXT", "ATTRIB", "ATTDEF"]);
const DRAWN_KINDS = new Set(["TEXT", "MTEXT", "ATTRIB", "ATTDEF", "HATCH", "SOLID", "3DFACE", "SPLINE", "DIMENSION"]);

class IndexBuilder {
  readonly entities: MeasurableEntity[] = [];
  readonly snaps: SnapPoint[] = [];
  readonly fitBounds: DrawingBounds[] = [];
  limited = false;
  completeBounds = true;
  private pointCount = 0;
  private visits = 0;
  // A refused outline must not suppress unrelated later lines or basic snaps.
  private stopped = false;
  private topBounds: DrawingBounds | null = null;
  private readonly layers: Record<string, Any>;
  private readonly blocks: Record<string, Any>;
  private readonly header: Record<string, unknown>;
  private readonly attribs = new Map<string, { tag: string; text: string }[]>();
  private readonly inserts = new Map<string, Any>();
  private readonly angBase: number;
  private readonly pdMode: number;
  private readonly pdSize: number;
  private readonly doc: Any;
  private readonly options: BuildOptions;

  constructor(doc: Any, options: BuildOptions) {
    this.doc = doc;
    this.options = options;
    this.layers = doc?.tables?.layer?.layers ?? {};
    this.blocks = doc?.blocks ?? {};
    this.header = doc?.header ?? {};
    this.angBase = num(this.header.$ANGBASE, 0);
    this.pdMode = num(this.header.$PDMODE, 0);
    this.pdSize = num(this.header.$PDSIZE, 0);
    const collect = (list: Any[] | undefined) => {
      for (const e of list ?? []) {
        if (e?.type === "INSERT" && e.handle !== undefined) this.inserts.set(String(e.handle), e);
        if (e?.type !== "ATTRIB" || e.ownerHandle === undefined) continue;
        const key = String(e.ownerHandle), arr = this.attribs.get(key) ?? [];
        arr.push({ tag: String(e.tag ?? ""), text: String(e.text ?? "") });
        this.attribs.set(key, arr);
      }
    };
    collect(doc?.entities);
    for (const b of Object.values(this.blocks) as Any[]) collect(b?.entities);
  }

  build(): MeasurementGeometry {
    const root: Context = { m: IDENTITY, layer: "0", chain: [], clips: [], stack: [] };
    for (const e of this.doc?.entities ?? []) {
      if (this.stopped) break;
      this.topBounds = null;
      // An attribute belongs to its INSERT: list that block in its chain.
      const owner = e?.type === "ATTRIB" && e.ownerHandle !== undefined ? this.ownerRef(String(e.ownerHandle)) : null;
      this.visit(e, owner ? { ...root, chain: [owner] } : root);
      if (this.topBounds) this.fitBounds.push(this.topBounds);
    }
    this.snaps.sort((a, b) => a.x - b.x);
    return {
      unit: unitFromInsunits(this.header.$INSUNITS),
      entities: this.entities,
      snaps: this.snaps,
      limited: this.limited,
      completeBounds: this.completeBounds && !this.limited,
      fitBounds: this.fitBounds,
      fitComplete: !this.limited,
    };
  }

  private ownerRef(handle: string): BlockRef | null {
    const insert = this.inserts.get(handle);
    if (!insert) return null;
    const block = this.blocks[insert.name];
    return { name: String(block?.cadName ?? block?.name ?? insert.name), layer: insert.layer ?? "0", attributes: this.attribs.get(handle) ?? [] };
  }

  private layerShown(name: string): boolean {
    const l = this.layers[name];
    return !l || (l.visible !== false && !l.frozen);
  }

  private visit(e: Any, ctx: Context): void {
    if (!e || typeof e !== "object" || this.stopped) return;
    if (++this.visits > MEASUREMENT_LIMITS.visits) { this.limited = this.stopped = true; return; }
    if (e.hidden) return;
    if (e.inPaperSpace && this.options.skipPaperSpace) return;
    const ext = e.extrusionDirection;
    if (ext && (Math.abs(num(ext.x, 0)) > 1e-9 || Math.abs(num(ext.y, 0)) > 1e-9)) return;
    const layer = e.layer && e.layer !== "0" ? String(e.layer) : ctx.layer;
    if (!this.layerShown(layer)) return;
    const mirrored = !!ext && ext.z < 0;
    // Only types drawn in their own coordinate system (OCS) turn over with a downward normal; LINE, POINT, ELLIPSE,
    // SPLINE, MTEXT… are in world coordinates, as the renderer draws them (超級圖庫 閘閥: five LINEs of a valve stem
    // landed 40 units off when mirrored). An ELLIPSE with that normal runs its angles the other way.
    const m: Mat = mirrored && OCS_TYPES.has(e.type) ? compose(ctx.m, MIRROR_X) : ctx.m;
    switch (e.type) {
      case "LINE": return this.polyline(e, ctx, layer, m, e.vertices ?? [e.start, e.end], false);
      case "LWPOLYLINE":
      case "POLYLINE":
        if (e.isPolyfaceMesh || e.is3dPolygonMesh || e.includesCurveFitVertices || e.includesSplineFitVertices) return;
        return this.polyline(e, ctx, layer, m, e.vertices ?? [], !!e.shape);
      case "CIRCLE": return this.circle(e, ctx, layer, m);
      case "ARC": if (!this.angBase) this.arc(e, ctx, layer, m); return;
      case "ELLIPSE": if (!this.angBase) this.ellipse(e, ctx, layer, m, mirrored); return;
      case "POINT":
        if (this.pdMode === 1 || (this.pdMode !== 0 && this.pdSize <= 0) || !finite(e.position)) return;
        this.snap(apply(m, e.position), "endpoint", layer, ctx);
        return;
      case "INSERT": return this.insert(e, ctx, layer);
      case "DIMENSION": return this.dimension(e, ctx, layer, m);
      default:
        if (DRAWN_KINDS.has(e.type)) this.drawn(e, ctx, layer, m);
    }
  }

  private properties(e: Any, ctx: Context): Record<string, unknown> {
    if (ctx.dimension) return ctx.dimension;
    const o = e.cadOriginal ?? {
      handle: e.handle, layer: e.layer ?? "0", colorIndex: e.colorIndex ?? 256, trueColor: e.trueColor,
      lineType: e.lineType ?? "BYLAYER", text: e.text, rotation: e.rotation, textHeight: e.textHeight ?? e.height,
      lineweight: e.lineweight, styleName: e.styleName, widthFactor: e.xScale, radius: e.radius, pattern: e.patternName,
      dimensionType: e.dimensionType, block: e.block,
    };
    // Colour actually drawn (prepareCad resolves it into trueColor).
    const drawn = e.cadOriginal ? e.trueColor
      : e.trueColor ?? (e.colorIndex !== undefined && e.colorIndex !== 256 && e.colorIndex !== 0 ? e.color : this.layers[e.layer ?? "0"]?.color);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries({ ...o, color: drawn })) if (v !== undefined && v !== null && v !== "") out[k] = v;
    return out;
  }

  private snap(p: DrawingPoint, kind: SnapKind, layer: string, ctx: Context): void {
    if (!finite(p) || this.stopped) return;
    if (ctx.dimension && kind !== "endpoint" && kind !== "midpoint") return;
    for (const clip of ctx.clips) if (!insidePolygon(clip, p)) return;
    if (this.snaps.length >= MEASUREMENT_LIMITS.snaps) { this.limited = true; return; }
    this.snaps.push({ x: p.x, y: p.y, kind, layer });
  }

  /** Whole object inside every clip: sampled points inside, no edge crossing, curve bounds inside. */
  private insideClips(points: readonly DrawingPoint[], ctx: Context, curveBounds?: DrawingBounds): boolean {
    for (const clip of ctx.clips) {
      if (!points.every((p) => insidePolygon(clip, p))) return false;
      if (curveBounds && !rectPoints(curveBounds).every((p) => insidePolygon(clip, p))) return false;
      for (let i = 1; i < points.length; i++) {
        for (let j = 0; j < clip.length; j++) if (crosses(points[i - 1], points[i], clip[j], clip[(j + 1) % clip.length])) return false;
      }
    }
    return true;
  }

  private add(entity: MeasurableEntity, ctx: Context, curveBounds?: DrawingBounds): void {
    if (this.stopped) return;
    const all = [...entity.points];
    for (const s of entity.hit?.segments ?? []) all.push(s[0], s[1]);
    for (const t of entity.hit?.triangles ?? []) all.push(t[0], t[1], t[2]);
    if (!all.length || !all.every(finite)) return;
    if (ctx.clips.length && !this.insideClips(all, ctx, curveBounds)) { this.completeBounds = false; return; }
    if (this.entities.length >= MEASUREMENT_LIMITS.entities) { this.limited = this.stopped = true; return; }
    if (this.pointCount + all.length > MEASUREMENT_LIMITS.points) { this.limited = true; return; }
    this.pointCount += all.length;
    if (ctx.chain.length) entity.blockChain = ctx.chain;
    if (ctx.dimension) {
      // Dimension parts: properties of the dimension only, no length and no advanced-snap primitives.
      entity.kind = "DIMENSION"; entity.propertiesOnly = true; entity.length = 0; entity.primitives = [];
      entity.approximate = false; delete entity.area; delete entity.curved;
    }
    this.entities.push(entity);
    this.topBounds = unionBounds(this.topBounds, entity.bounds);
  }

  private polyline(e: Any, ctx: Context, layer: string, m: Mat, raw: Any[], closed: boolean): void {
    const v: Any[] = (raw ?? []).filter((p: Any) => finite(p));
    if (v.length < 2) return;
    const scale = uniformScale(m);
    const points: DrawingPoint[] = [apply(m, v[0])];
    const primitives: SnapPrimitive[] = [];
    let length = 0, sampled = 0, bulgeArea = 0, curved = false;
    for (const p of v) this.snap(apply(m, p), "endpoint", layer, ctx);
    const count = closed ? v.length : v.length - 1;
    for (let i = 0; i < count; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      // A closing segment onto the same point still gets its (zero-length) midpoint snap, as the old version did
      // (coordinator decision: keep old behaviour; t1 gives 50,980 snaps like before).
      const bulge = num(a.bulge, 0);
      const wa = apply(m, a), wb = apply(m, b);
      if (!bulge || !chord) {
        points.push(wb);
        if (chord) primitives.push({ line: [wa, wb] });
        const d = Math.hypot(wb.x - wa.x, wb.y - wa.y);
        length += d; sampled += d;
        this.snap({ x: (wa.x + wb.x) / 2, y: (wa.y + wb.y) / 2 }, "midpoint", layer, ctx);
        continue;
      }
      // Bulge arc: radius = chord·(1 + b²)/(4|b|), included angle 4·atan(b) (counter-clockwise when b > 0).
      curved = true;
      const theta = 4 * Math.atan(bulge), r = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, h = chord / 2 / Math.tan(theta / 2);
      const center = { x: mid.x - ((b.y - a.y) / chord) * h, y: mid.y + ((b.x - a.x) / chord) * h };
      const start = Math.atan2(a.y - center.y, a.x - center.x);
      const curve = mapConic(m, center, { x: r, y: 0 }, { x: 0, y: r }, start, theta);
      const pts = sampleConic(curve, 2);
      pts[0] = wa; pts[pts.length - 1] = wb;
      points.push(...pts.slice(1));
      primitives.push({ curve });
      sampled += pathLength(pts);
      length += scale !== null ? r * Math.abs(theta) * scale : 0;
      bulgeArea += (r * r * (theta - Math.sin(theta))) / 2;
      this.snap(conicAt(curve, start + theta / 2), "midpoint", layer, ctx);
    }
    if (points.length < 2) return;
    const approximate = curved && scale === null;
    const entity: MeasurableEntity = {
      kind: e.type, layer, points, bounds: boundsOf(points), length: approximate ? sampled : length,
      approximate, primitives, properties: this.properties(e, ctx),
    };
    if (curved) entity.curved = true;
    if (closed && (v.length > 2 || curved)) entity.area = Math.abs((signedArea(v) + bulgeArea) * determinant(m));
    this.add(entity, ctx);
  }

  private conic(e: Any, ctx: Context, layer: string, curve: SnapCurve, stepDeg: number, extra: Partial<MeasurableEntity>): void {
    const points = sampleConic(curve, stepDeg), bounds = conicBounds(curve);
    this.add({
      kind: e.type, layer, points, bounds, length: pathLength(points), approximate: true, curved: true,
      primitives: [{ curve }], properties: this.properties(e, ctx), ...extra,
    }, ctx, bounds);
  }

  private circle(e: Any, ctx: Context, layer: string, m: Mat): void {
    const r = num(e.radius, 0);
    if (!(r > 0) || !finite(e.center)) return;
    const curve = mapConic(m, e.center, { x: r, y: 0 }, { x: 0, y: r }, 0, TAU);
    this.snap(apply(m, e.center), "center", layer, ctx);
    for (let k = 0; k < 4; k++) this.snap(conicAt(curve, (k * Math.PI) / 2), "quadrant", layer, ctx);
    const s = uniformScale(m);
    this.conic(e, ctx, layer, curve, 2, {
      ...(s !== null ? { length: TAU * r * s, approximate: false } : {}),
      area: Math.PI * r * r * Math.abs(determinant(m)),
    });
  }

  private arc(e: Any, ctx: Context, layer: string, m: Mat): void {
    const r = num(e.radius, 0);
    if (!(r > 0) || !finite(e.center)) return;
    const start = num(e.startAngle, 0), end = num(e.endAngle, start + TAU);
    let sweep = mod(end - start);
    if (sweep < 1e-12) sweep = TAU;
    const curve = mapConic(m, e.center, { x: r, y: 0 }, { x: 0, y: r }, start, sweep);
    this.snap(apply(m, e.center), "center", layer, ctx);
    this.snap(conicAt(curve, start), "endpoint", layer, ctx);
    this.snap(conicAt(curve, start + sweep), "endpoint", layer, ctx);
    this.snap(conicAt(curve, start + sweep / 2), "midpoint", layer, ctx);
    const local: SnapCurve = { center: e.center, u: { x: r, y: 0 }, v: { x: 0, y: r }, start, sweep };
    for (let k = 0; k < 4; k++) if (withinSweep(local, (k * Math.PI) / 2)) this.snap(conicAt(curve, (k * Math.PI) / 2), "quadrant", layer, ctx);
    const s = uniformScale(m);
    this.conic(e, ctx, layer, curve, 2, s !== null ? { length: r * sweep * s, approximate: false } : {});
  }

  private ellipse(e: Any, ctx: Context, layer: string, m: Mat, clockwise = false): void {
    const major = e.majorAxisEndPoint, ratio = num(e.axisRatio, 0);
    if (!finite(e.center) || !finite(major) || !(ratio > 0) || !(major.x || major.y)) return;
    const open = e.endAngle !== undefined && e.endAngle !== null;
    const start = num(e.startAngle, 0);
    let end = open ? num(e.endAngle, start + TAU) : start + TAU;
    while (end <= start) end += TAU;
    const full = !open || Math.abs(end - start - TAU) < 1e-6;
    const sweep = full ? TAU : end - start, from = full ? 0 : start;
    // The minor axis is the normal × major: a downward normal puts it on the other side, so angles run clockwise.
    const minor = clockwise ? { x: major.y * ratio, y: -major.x * ratio } : { x: -major.y * ratio, y: major.x * ratio };
    const curve = mapConic(m, e.center, major, minor, from, sweep);
    const local: SnapCurve = { center: e.center, u: major, v: minor, start: from, sweep };
    this.snap(apply(m, e.center), "center", layer, ctx);
    for (let k = 0; k < 4; k++) if (withinSweep(local, (k * Math.PI) / 2)) this.snap(conicAt(curve, (k * Math.PI) / 2), "quadrant", layer, ctx);
    if (!full) {
      this.snap(conicAt(curve, start), "endpoint", layer, ctx);
      this.snap(conicAt(curve, start + sweep), "endpoint", layer, ctx);
      this.snap(conicAt(curve, start + sweep / 2), "midpoint", layer, ctx);
    }
    const a = Math.hypot(major.x, major.y);
    this.conic(e, ctx, layer, curve, 1, full ? { area: Math.PI * a * a * ratio * Math.abs(determinant(m)) } : {});
  }

  private insert(e: Any, ctx: Context, layer: string): void {
    if (num(e.columnCount, 1) > 1 || num(e.rowCount, 1) > 1) return;
    if (e.xScale === 0 || e.yScale === 0) return;
    const block = this.blocks[e.name];
    if (!block || ctx.stack.includes(e.name) || ctx.stack.length >= 24) return;
    const base = finite(block.position) ? block.position : { x: 0, y: 0 };
    const m = compose(ctx.m, insertMatrix(e, base));
    let clips = ctx.clips;
    const clip = readXclip(e);
    if (clip) {
      // A boundary over 256 points is refused, never replaced by its enclosing box.
      if (clip.length > XCLIP_MAX_POINTS) { this.completeBounds = false; return; }
      // The boundary is in block definition coordinates, like the block's own entities.
      clips = [...clips, clip.map((p) => apply(m, p))];
    }
    const name = String(block.cadName ?? block.name ?? e.name);
    const chain = ctx.dimension || name.startsWith("*D") ? ctx.chain
      : [...ctx.chain, { name, layer, attributes: e.handle !== undefined ? this.attribs.get(String(e.handle)) ?? [] : [] }];
    const child: Context = { ...ctx, m, layer, clips, chain, stack: [...ctx.stack, e.name] };
    for (const c of block.entities ?? []) {
      if (this.stopped) return;
      if (c?.type === "ATTDEF") continue; // definitions are replaced by the INSERT's attributes
      this.visit(c, child);
    }
  }

  private dimension(e: Any, ctx: Context, layer: string, m: Mat): void {
    const block = e.block !== undefined && e.block !== null ? this.blocks[e.block] : null;
    if (!block || ctx.stack.includes(e.block)) return this.drawn(e, ctx, layer, m);
    const props = { ...this.properties(e, ctx) };
    // The number actually drawn lives in the block's text.
    const text = (block.entities ?? []).find((c: Any) => (c?.type === "MTEXT" || c?.type === "TEXT") && typeof c.text === "string" && c.text);
    if (text) {
      props.text = text.text;
      const h = num(text.textHeight ?? text.height, 0) * (uniformScale(m) ?? 1);
      if (h > 0) props.textHeight = h;
    }
    const at = dimensionBlockOffset(e);
    const child: Context = { ...ctx, m: compose(m, [1, 0, 0, 1, at.x, at.y]), layer, dimension: props, stack: [...ctx.stack, e.block] };
    for (const c of block.entities ?? []) {
      if (this.stopped) return;
      this.visit(c, child);
    }
  }

  /** Objects picked for their properties: text boxes, hatches, solids, splines, synthesized dimensions. */
  private drawn(e: Any, ctx: Context, layer: string, m: Mat): void {
    if (e.type === "ATTRIB" && e.hidden) return;
    const shape = this.options.shapes?.get(e) ?? fallbackShape(e);
    if (!shape) return;
    const segments = shape.segments.map(([a, b]) => [apply(m, a), apply(m, b)] as [DrawingPoint, DrawingPoint]);
    const triangles = shape.triangles.map(([a, b, c]) => [apply(m, a), apply(m, b), apply(m, c)] as [DrawingPoint, DrawingPoint, DrawingPoint]);
    const all = [...segments.flat(), ...triangles.flat()];
    if (!all.length) return;
    const properties = this.properties(e, ctx);
    if (TEXT_KINDS.has(e.type)) {
      // The text box: glyphs measured along the (transformed) writing direction; inside = picked.
      const box = textBox(all, linear(m, textDirection(e)));
      this.add({ kind: e.type, layer, points: box, bounds: boundsOf(box), length: 0, approximate: false, propertiesOnly: true,
        properties, hit: { segments: [], triangles: [[box[0], box[1], box[2]], [box[0], box[2], box[3]]] } }, ctx);
      return;
    }
    let points: DrawingPoint[];
    if (e.type === "SOLID" || e.type === "3DFACE") {
      const raw: Any[] = (e.type === "SOLID" ? e.points : e.vertices) ?? [];
      const order = raw.length > 3 ? (e.type === "SOLID" ? [0, 1, 3, 2, 0] : [0, 1, 2, 3, 0]) : [0, 1, 2, 0];
      points = order.filter((i) => finite(raw[i])).map((i) => apply(m, raw[i]));
    } else if (e.type === "SPLINE" && segments.length) {
      points = [segments[0][0], ...segments.map((s) => s[1])];
    } else points = rectPoints(boundsOf(all));
    // A continuous spline's sampled outline already contains every drawn segment, exactly.
    // Keeping hit.segments too stores/tests the same polyline twice and charges each interior
    // vertex three times against the point budget. Keep disjoint segment sets unchanged.
    const outlineCoversSegments = e.type === "SPLINE" && segments.length > 0
      && segments.every((s, i) => i === 0 || (s[0].x === segments[i - 1][1].x && s[0].y === segments[i - 1][1].y));
    this.add({ kind: e.type, layer, points, bounds: boundsOf(all), length: 0, approximate: false, propertiesOnly: true,
      properties, hit: { segments: outlineCoversSegments ? [] : segments, triangles } }, ctx);
  }
}

/** Writing direction of a text entity in its own coordinates. */
function textDirection(e: Any): DrawingPoint {
  if (e.type === "MTEXT" && finite(e.direction) && (e.direction.x || e.direction.y)) return e.direction;
  const r = (num(e.rotation, 0) * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Closed 5-point rectangle around `points`, aligned with `dir` (axis-aligned when dir is degenerate). */
function textBox(points: readonly DrawingPoint[], dir: DrawingPoint): DrawingPoint[] {
  const len = Math.hypot(dir.x, dir.y);
  if (!(len > 0)) return rectPoints(boundsOf(points));
  const d = { x: dir.x / len, y: dir.y / len }, n = { x: -d.y, y: d.x };
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of points) {
    const a = p.x * d.x + p.y * d.y, b = p.x * n.x + p.y * n.y;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  const at = (a: number, b: number) => ({ x: a * d.x + b * n.x, y: a * d.y + b * n.y });
  return [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1), at(a0, b0)];
}

/** Shape from the parsed data when no scene recorded one (index built without a scene). */
function fallbackShape(e: Any): DrawnShape | null {
  const pts = (list: Any[] | undefined) => (list ?? []).filter(finite) as DrawingPoint[];
  if (e.type === "SOLID" || e.type === "3DFACE") {
    const v = pts(e.type === "SOLID" ? e.points : e.vertices);
    if (v.length < 3) return null;
    const triangles: DrawnShape["triangles"] = [[v[0], v[1], v[2]]];
    if (v.length > 3) triangles.push([v[1], v[3], v[2]]);
    return { segments: [], triangles };
  }
  if (e.type === "SPLINE") {
    const v = pts(e.fitPoints?.length ? e.fitPoints : e.controlPoints);
    return v.length > 1 ? { segments: v.slice(1).map((p, i) => [v[i], p] as [DrawingPoint, DrawingPoint]), triangles: [] } : null;
  }
  if (TEXT_KINDS.has(e.type) && typeof e.text === "string" && e.text) {
    // Rough box from the height and character count; the scene's glyph outline replaces it when drawn.
    const h = (num(e.textHeight ?? e.height, 0) * (e.type === "ATTRIB" ? num(e.scale, 1) || 1 : 1)) || 1;
    const at = e.type === "MTEXT" ? e.position : e.startPoint;
    if (!finite(at)) return null;
    const lines: string[] = e.text.split(/\\P|\n/);
    const chars = Math.max(1, ...lines.map((l) => l.length));
    const width = (e.type === "MTEXT" && num(e.width, 0) > 0 ? num(e.width, 0) : chars * h * 0.9) * (num(e.xScale, 1) || 1);
    const height = e.type === "MTEXT" ? h * 1.25 * lines.length : h;
    const dir = textDirection(e), dl = Math.hypot(dir.x, dir.y) || 1, d = { x: dir.x / dl, y: dir.y / dl }, n = { x: -d.y, y: d.x };
    const y0 = e.type === "MTEXT" ? -height : 0;
    const corner = (a: number, b: number) => ({ x: at.x + d.x * a + n.x * b, y: at.y + d.y * a + n.y * b });
    const c = [corner(0, y0), corner(width, y0), corner(width, y0 + height), corner(0, y0 + height)];
    return { segments: [], triangles: [[c[0], c[1], c[2]], [c[0], c[2], c[3]]] };
  }
  return null;
}

/** Build the index straight from a parsed document (no scene): used by tests and fallbacks. */
export function buildMeasurementGeometry(doc: unknown): MeasurementGeometry {
  return new IndexBuilder(doc, { skipPaperSpace: true }).build();
}

// ---------------------------------------------------------------------------------------------
// Scene patch (T14 8.1-5d)

const PATCHED = Symbol.for("fatcat.measurementPreparation");
const CAPTURE = Symbol.for("fatcat.measurementCapture");

/** Record the vertices of one dxf-viewer render entity (before any block transform). */
function record(shape: DrawnShape, r: Any): void {
  const v: DrawingPoint[] = (r?.vertices ?? []).map((p: Any) => ({ x: p.x, y: p.y }));
  if (r?.type === 1) for (let i = 0; i + 1 < v.length; i += 2) shape.segments.push([v[i], v[i + 1]]);
  else if (r?.type === 2) {
    for (let i = 1; i < v.length; i++) shape.segments.push([v[i - 1], v[i]]);
    if (r.shape && v.length > 2) shape.segments.push([v[v.length - 1], v[0]]);
  } else if (r?.type === 3) {
    const idx: number[] = r.indices ?? v.map((_, i) => i);
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = v[idx[i]], b = v[idx[i + 1]], c = v[idx[i + 2]];
      if (a && b && c) shape.triangles.push([a, b, c]);
    }
  }
}

/**
 * Patch a dxf-viewer DxfScene class so Build() records what each entity actually draws and leaves
 * `dxf.cadMeasurement` (MeasurementGeometry) on the parsed document. Installed before our engineering
 * and font scene patches (T14 8.1-5d).
 */
export function installMeasurementPreparation(sceneClass: unknown): void {
  const p = (sceneClass as Any)?.prototype;
  if (!p || Object.prototype.hasOwnProperty.call(p, PATCHED)) return;
  p[PATCHED] = true;
  const build = p.Build, processDxf = p._ProcessDxfEntity, processEntity = p._ProcessEntity;
  p._ProcessDxfEntity = function (this: Any, entity: Any, blockCtx: Any) {
    const shapes: WeakMap<object, DrawnShape> | undefined = this.cadMeasureShapes;
    const wanted = !!shapes && !!entity && DRAWN_KINDS.has(entity.type)
      && !(entity.type === "DIMENSION" && entity.block != null && this.blocks?.has?.(entity.block));
    if (!wanted || shapes!.has(entity)) return processDxf.call(this, entity, blockCtx);
    const outer = this[CAPTURE], shape: DrawnShape = { segments: [], triangles: [] };
    this[CAPTURE] = shape;
    try { return processDxf.call(this, entity, blockCtx); } finally {
      this[CAPTURE] = outer;
      if (shape.segments.length || shape.triangles.length) shapes!.set(entity, shape);
    }
  };
  p._ProcessEntity = function (this: Any, entity: Any, blockCtx: Any) {
    const shape: DrawnShape | undefined = this[CAPTURE];
    if (shape) record(shape, entity);
    return processEntity.call(this, entity, blockCtx);
  };
  p.Build = async function (this: Any, dxf: Any, fonts: Any) {
    this.cadMeasureShapes = new WeakMap();
    try {
      await build.call(this, dxf, fonts);
      dxf.cadMeasurement = new IndexBuilder(dxf, { shapes: this.cadMeasureShapes, skipPaperSpace: !!this.options?.suppressPaperSpace }).build();
    } finally {
      this.cadMeasureShapes = undefined;
    }
    // Only the index (and the drawing check report) is kept: every other parsed field is dropped so
    // less data goes back to the main thread (T14 8.1-5d). Pass a copy if the parsed document is reused.
    for (const key of Object.keys(dxf)) if (key !== "cadMeasurement" && key !== "cadReport") delete dxf[key];
  };
}
