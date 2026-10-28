// A SPLINE saved with fit points only (group 11, no control points) was skipped by the scene, so the curve went
// missing (外框比對 單位1: t2-16C客變, W12 鑄鐵管固定方式). CAD fits a C2 cubic through every fit point with chord-length
// parameters, its ends following the saved tangents (groups 12/13) or else free (zero curvature); Catmull-Rom was
// visibly tighter than ZWCAD on W12 (58% image fit), so open curves use the same cubic here.
import { throughPoints } from "../dwg/missingBlocks";
import { Entity } from "dxf-viewer/src/DxfScene.js";
type Any = any;
type P = { x: number; y: number };
const STEPS = 16;

/** Second derivatives of a cubic spline through (t, y): `d0`/`d1` clamp the end slopes, null leaves an end free. */
function curvatures(t: number[], y: number[], d0: number | null, d1: number | null): number[] {
  const n = t.length, a = new Array(n).fill(0), b = new Array(n).fill(0), c = new Array(n).fill(0), r = new Array(n).fill(0);
  const h = (i: number) => t[i + 1] - t[i], s = (i: number) => (y[i + 1] - y[i]) / h(i);
  if (d0 === null) b[0] = 1; else { b[0] = 2 * h(0); c[0] = h(0); r[0] = 6 * (s(0) - d0); }
  for (let i = 1; i < n - 1; i++) { a[i] = h(i - 1); b[i] = 2 * (h(i - 1) + h(i)); c[i] = h(i); r[i] = 6 * (s(i) - s(i - 1)); }
  if (d1 === null) b[n - 1] = 1; else { a[n - 1] = h(n - 2); b[n - 1] = 2 * h(n - 2); r[n - 1] = 6 * (d1 - s(n - 2)); }
  for (let i = 1; i < n; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; r[i] -= m * r[i - 1]; }
  const out = new Array(n).fill(0);
  out[n - 1] = r[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) out[i] = (r[i] - c[i] * out[i + 1]) / b[i];
  return out;
}

const unit = (v: Any): P | null => { const l = Math.hypot(v?.x ?? 0, v?.y ?? 0); return l > 1e-12 ? { x: v.x / l, y: v.y / l } : null; };

/** Points along the cubic through `fit` (open curve), `start`/`end` the tangent directions when CAD saved them. */
export function cubicThrough(fit: P[], start: Any = null, end: Any = null): P[] {
  const t = [0];
  for (let i = 1; i < fit.length; i++) t.push(t[i - 1] + Math.max(Math.hypot(fit[i].x - fit[i - 1].x, fit[i].y - fit[i - 1].y), 1e-9));
  const s0 = unit(start), s1 = unit(end);
  const mx = curvatures(t, fit.map((p) => p.x), s0?.x ?? null, s1?.x ?? null);
  const my = curvatures(t, fit.map((p) => p.y), s0?.y ?? null, s1?.y ?? null);
  const out: P[] = [];
  for (let i = 0; i < fit.length - 1; i++) {
    const h = t[i + 1] - t[i];
    for (let k = 0; k < STEPS; k++) {
      const u = k / STEPS, A = 1 - u, B = u, f = h * h / 6 * ((A ** 3 - A)), g = h * h / 6 * ((B ** 3 - B));
      out.push({ x: A * fit[i].x + B * fit[i + 1].x + f * mx[i] + g * mx[i + 1], y: A * fit[i].y + B * fit[i + 1].y + f * my[i] + g * my[i + 1] });
    }
  }
  out.push(fit[fit.length - 1]);
  return out;
}

/** Polyline vertices for a fit-point-only spline, or null when the spline has control points (or too few points). */
export function fitSplineVertices(e: Any): P[] | null {
  if ((e?.controlPoints?.length ?? 0) >= 2) return null;
  const fit: P[] = (e?.fitPoints ?? []).filter((p: Any) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map((p: Any) => ({ x: p.x, y: p.y }));
  if (fit.length < 2) return null;
  return e.closed ? throughPoints(fit, true) : cubicThrough(fit, e.startTangent, e.endTangent);
}

export function installFitSplines(p: Any): void {
  if (p.cadFitSplinesInstalled) return;
  p.cadFitSplinesInstalled = true;
  const decompose = p._DecomposeSpline;
  p._DecomposeSpline = function* (entity: Any, blockCtx: Any = null) {
    const vertices = fitSplineVertices(entity);
    if (!vertices) { yield* decompose.call(this, entity, blockCtx); return; }
    yield new Entity({ type: Entity.Type.POLYLINE, vertices, layer: this._GetEntityLayer(entity, blockCtx),
      color: this._GetEntityColor(entity, blockCtx), lineType: this._GetLineType(entity, null, blockCtx) });
  };
}
