import type { KeptMeasurement } from '../viewer/measurementGeometry';
import { isComplete } from '../viewer/measureResults';
import { MAX_KEPT } from './measureState';
// Separate namespace: reading-position pruning must never delete measurements.
const keyOf = (viewKey: string) => `fatcat-measurements-v1:${viewKey}`;
function valid(value: unknown): value is KeptMeasurement {
  if (!value || typeof value !== 'object') return false;
  const r = value as KeptMeasurement;
  if (!['distance','path','area','angle','object'].includes(r.mode) || !Array.isArray(r.points) || !r.points.length || r.points.length > 600_000) return false;
  if (!r.points.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  if (!r.points.every(p=>!p.perpendicularFrom || (Number.isFinite(p.perpendicularFrom.x) && Number.isFinite(p.perpendicularFrom.y)))) return false;
  if (r.mode === 'object' && (!r.object || !Number.isFinite(r.object.length) || r.object.length < 0 || (r.object.area !== undefined && !Number.isFinite(r.object.area)) || typeof r.object.approximate !== 'boolean')) return false;
  return isComplete(r);
}
export function loadMeasurements(viewKey: string): KeptMeasurement[] {
  if (!viewKey) return [];
  try { const value: unknown = JSON.parse(localStorage.getItem(keyOf(viewKey)) ?? '[]'); return Array.isArray(value) ? value.filter(valid).slice(-MAX_KEPT) : []; } catch { return []; }
}
export function saveMeasurements(viewKey: string, kept: readonly KeptMeasurement[]): boolean {
  if (!viewKey || !kept.every(valid)) return false;
  try { if (kept.length) localStorage.setItem(keyOf(viewKey), JSON.stringify(kept.slice(-MAX_KEPT))); else localStorage.removeItem(keyOf(viewKey)); return true; } catch { return false; }
}
