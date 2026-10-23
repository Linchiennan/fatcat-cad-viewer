// XCLIP boundaries moved from the DXF OBJECTS section onto INSERT extended data (T13 4.4, 8-4).
// Owner: P4 group B. cadDocument (ours) writes the same application name for layout viewports.
// LibreDWG writes the clip as a SPATIAL_FILTER object reached through the INSERT's extension
// dictionary; dxf-viewer never reads OBJECTS but keeps entity XDATA, so the boundary is copied there.
import type { DrawingPoint } from "../types/drawing";
import { applyEdits, containsAscii, scanPairs, type ByteEdit, type DxfPair } from "./dxfLines";

/** XDATA application name carrying "x,y;x,y;…" in group 1000. */
export const XCLIP_APP = "FATCAT_XCLIP";

type Filter = { count: number; points: DrawingPoint[]; enabled: boolean; matrix: number[] };
type Insert = { handle: string; xdict: string; annotated: boolean; end: number };

const upper = (s: string) => s.toLocaleUpperCase("en-US");
const WANTED = new Set([0, 3, 5, 10, 20, 40, 70, 71, 350, 360, 1001]);

/** Corners of a 2-point rectangle in order (x1,y1) (x2,y1) (x2,y2) (x1,y2); other polygons as they are. */
export function expandClipRectangle(points: readonly DrawingPoint[]): DrawingPoint[] {
  if (points.length !== 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const [a, b] = points;
  return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
}

/** Boundary in block coordinates: with >= 24 matrix values, the first of the last two 3x4 matrices is applied. */
export function transformClipBoundary(points: readonly DrawingPoint[], matrix: readonly number[]): DrawingPoint[] {
  if (matrix.length < 24) return points.map((p) => ({ x: p.x, y: p.y }));
  const m = matrix.slice(matrix.length - 24, matrix.length - 12);
  return expandClipRectangle(points).map((p) => ({ x: m[0] * p.x + m[1] * p.y + m[3], y: m[4] * p.x + m[5] * p.y + m[7] }));
}

/** Copy SPATIAL_FILTER boundaries onto their INSERT records. Idempotent: already annotated INSERTs are skipped. */
export function annotateDxfXclips(bytes: Uint8Array): Uint8Array {
  if (!containsAscii(bytes, "SPATIAL_FILTER")) return bytes;
  const dictionaries = new Map<string, Map<string, string>>(), filters = new Map<string, Filter>(), inserts: Insert[] = [];
  let type = "", handle = "", dict: Map<string, string> | null = null, pendingKey: string | null = null;
  let filter: Filter | null = null, insert: Insert | null = null, xIndex = 0, yIndex = 0, gotCount = false, gotEnabled = false;
  const finish = (at: number) => {
    if (type === "DICTIONARY" && dict && handle) dictionaries.set(upper(handle), dict);
    if (type === "SPATIAL_FILTER" && filter && handle) filters.set(upper(handle), filter);
    if (type === "INSERT" && insert) { insert.end = at; if (insert.handle) inserts.push(insert); }
  };
  scanPairs(bytes, (p: DxfPair) => {
    if (p.code === 0) {
      finish(p.codeStart);
      type = p.value; handle = ""; dict = null; pendingKey = null; filter = null; insert = null;
      if (type === "DICTIONARY") dict = new Map();
      else if (type === "SPATIAL_FILTER") { filter = { count: 0, points: [], enabled: true, matrix: [] }; xIndex = 0; yIndex = 0; gotCount = false; gotEnabled = false; }
      else if (type === "INSERT") insert = { handle: "", xdict: "", annotated: false, end: bytes.length };
      return;
    }
    if (p.code === 5 && !handle) { handle = p.value; if (insert) insert.handle = p.value; return; }
    if (dict) {
      if (p.code === 3) pendingKey = p.value;
      else if ((p.code === 350 || p.code === 360) && pendingKey !== null) { dict.set(pendingKey, upper(p.value)); pendingKey = null; }
    } else if (filter) {
      if (p.code === 70 && !gotCount) { filter.count = Number(p.value); gotCount = true; }
      else if (p.code === 10 && xIndex < filter.count) { (filter.points[xIndex] ??= { x: NaN, y: NaN }).x = Number(p.value); xIndex++; }
      else if (p.code === 20 && yIndex < filter.count) { (filter.points[yIndex] ??= { x: NaN, y: NaN }).y = Number(p.value); yIndex++; }
      else if (p.code === 71 && !gotEnabled) { filter.enabled = Number(p.value) !== 0; gotEnabled = true; }
      else if (p.code === 40) filter.matrix.push(Number(p.value));
    } else if (insert) {
      if (p.code === 360 && !insert.xdict) insert.xdict = upper(p.value);
      else if (p.code === 1001 && p.value === XCLIP_APP) insert.annotated = true;
    }
  }, (code) => WANTED.has(code));
  finish(bytes.length);

  const edits: ByteEdit[] = [];
  for (const ins of inserts) {
    if (ins.annotated || !ins.xdict) continue;
    const filterDict = dictionaries.get(ins.xdict)?.get("ACAD_FILTER");
    const spatial = filterDict ? dictionaries.get(filterDict)?.get("SPATIAL") : undefined;
    const f = spatial ? filters.get(spatial) : undefined;
    if (!f || !f.enabled || f.count < 2 || f.points.length < 2) continue;
    if (f.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const boundary = transformClipBoundary(f.points, f.matrix);
    if (boundary.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const value = boundary.map((p) => String(p.x) + "," + String(p.y)).join(";");
    edits.push({ start: ins.end, end: ins.end, text: `1001\r\n${XCLIP_APP}\r\n1000\r\n${value}\r\n1070\r\n0\r\n` });
  }
  return applyEdits(bytes, edits);
}

/** Boundary of a parsed entity's XCLIP xdata; null when absent, fewer than 2 points or any non-finite number. */
export function parseDxfXclip(entity: unknown): DrawingPoint[] | null {
  const section = (entity as { xdata?: Record<string, { values?: { code: number; value: unknown }[] }> } | null)?.xdata?.[XCLIP_APP];
  const raw = section?.values?.find((v) => Number(v.code) === 1000)?.value;
  if (typeof raw !== "string") return null;
  const points: DrawingPoint[] = [];
  for (const part of raw.split(";")) {
    if (!part.trim()) continue;
    const xy = part.split(",");
    if (xy.length !== 2) return null;
    const x = Number(xy[0]), y = Number(xy[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !xy[0].trim() || !xy[1].trim()) return null;
    points.push({ x, y });
  }
  return points.length >= 2 ? points : null;
}
