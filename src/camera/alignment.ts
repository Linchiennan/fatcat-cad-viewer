// 對位圖 (spec 009 定案 2): the photo points painted on the exported sheet (PDF), and the same points as a
// marker-only DXF in drawing coordinates, to INSERT into the original DWG in CAD where it lines up exactly.
import type { DrawingPoint } from "../viewer/savedView";
import { MARKER_RADIUS_PX, MARKER_RED, screenDirection, wedgePieces } from "./PhotoMarkerLayer";
import type { ShotPoint } from "./types";

/** Paint the points on an export picture (`project` gives picture units; `scale` = output pixels per unit;
 * `radius` = circle radius in picture units, from markerUnitRadius × picture units per drawing unit). */
export function paintPhotoMarkers(ctx: CanvasRenderingContext2D, points: readonly ShotPoint[], labels: ReadonlyMap<string, string>,
  project: (pts: readonly DrawingPoint[]) => DrawingPoint[], scale: number, radius = MARKER_RADIUS_PX): void {
  const k = radius / MARKER_RADIUS_PX;
  if (!(k > 0)) return;
  ctx.save();
  ctx.scale(scale, scale);
  for (const p of points) {
    const [c] = project([{ x: p.x, y: p.y }]);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const d = screenDirection(p.angle);
    ctx.fillStyle = MARKER_RED;
    ctx.beginPath();
    for (const w of wedgePieces(c.x, c.y, d.x, d.y, MARKER_RADIUS_PX * k)) { w.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); }
    ctx.fill();
    ctx.strokeStyle = MARKER_RED; ctx.lineWidth = 1.4 * Math.max(0.7, k);
    ctx.beginPath(); ctx.arc(c.x, c.y, MARKER_RADIUS_PX * k, 0, Math.PI * 2); ctx.stroke();
    const label = labels.get(p.id) ?? String(p.no);
    ctx.font = `700 ${(label.length > 3 ? 10.5 : label.length > 2 ? 13 : 16) * k}px "FatCat Sans", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, c.x, c.y);
  }
  ctx.restore();
}

const n = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

/**
 * Marker-only DXF (R12, ASCII names) in drawing coordinates: a circle, its number and the solid wedge for each
 * point, on layer PHOTO-POINTS (red). `radius` is the circle radius in drawing units.
 */
export function markerDxf(points: readonly ShotPoint[], labels: ReadonlyMap<string, string>, radius: number): string {
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === "number" ? n(value) : value);
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, 1);
  g(0, "LAYER"); g(2, "PHOTO-POINTS"); g(70, 0); g(62, 1); g(6, "CONTINUOUS");
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const p of points) {
    g(0, "CIRCLE"); g(8, "PHOTO-POINTS"); g(10, p.x); g(20, p.y); g(30, 0); g(40, radius);
    const label = labels.get(p.id) ?? String(p.no), h = radius * (label.length > 3 ? 0.55 : 0.75);
    g(0, "TEXT"); g(8, "PHOTO-POINTS"); g(10, p.x); g(20, p.y); g(30, 0); g(40, h); g(1, label);
    g(72, 1); g(73, 2); g(11, p.x); g(21, p.y); g(31, 0);
    // the same wedge as on screen, in drawing units, as a fan of SOLID triangles from the tip
    const a = (p.angle * Math.PI) / 180;
    for (const w of wedgePieces(p.x, p.y, Math.cos(a), Math.sin(a), radius)) for (let i = 1; i + 1 < w.length; i++) {
      g(0, "SOLID"); g(8, "PHOTO-POINTS"); g(10, w[0].x); g(20, w[0].y); g(30, 0); g(11, w[i].x); g(21, w[i].y); g(31, 0);
      g(12, w[i + 1].x); g(22, w[i + 1].y); g(32, 0); g(13, w[i + 1].x); g(23, w[i + 1].y); g(33, 0);
    }
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

/**
 * Circle radius in drawing units: 17/2000 of the sheet width at 100 %. One rule for the screen, the sheet PDF and the
 * DXF, so the marker is a fixed size on the drawing and zooms with it like a CAD block (用戶 2026-11-22：「建築圖縮小，
 * 他沒跟著縮小」). On the 8F example (7,885 units wide) that is r ≈ 67, near the user's own 「對位箭頭」 block (r = 53).
 */
export function markerUnitRadius(sheetWidth: number, markerScale = 1): number {
  return Math.max(sheetWidth * (MARKER_RADIUS_PX / 2000) * markerScale, 1e-6);
}
/** The DXF circle radius (same as on screen). */
export const dxfRadius = markerUnitRadius;
