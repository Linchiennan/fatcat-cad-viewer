// 對位圖 (spec 009 定案 2): the photo points painted on the exported sheet (PDF), and the same points as a
// marker-only DXF in drawing coordinates, to INSERT into the original DWG in CAD where it lines up exactly.
import type { DrawingPoint } from "../viewer/savedView";
import { arrowTriangle, MARKER_RADIUS_PX, MARKER_RED, screenDirection } from "./PhotoMarkerLayer";
import type { ShotPoint } from "./types";

/** Paint the points on an export picture (`project` gives picture units; `scale` = output pixels per unit). */
export function paintPhotoMarkers(ctx: CanvasRenderingContext2D, points: readonly ShotPoint[], labels: ReadonlyMap<string, string>,
  project: (pts: readonly DrawingPoint[]) => DrawingPoint[], scale: number): void {
  ctx.save();
  ctx.scale(scale, scale);
  for (const p of points) {
    const [c] = project([{ x: p.x, y: p.y }]);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const tri = arrowTriangle(c.x, c.y, p.angle).split(" ").map((s) => s.split(",").map(Number));
    ctx.fillStyle = MARKER_RED;
    ctx.beginPath(); ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = MARKER_RED; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, MARKER_RADIUS_PX, 0, Math.PI * 2); ctx.stroke();
    const label = labels.get(p.id) ?? String(p.no);
    ctx.font = `700 ${label.length > 3 ? 11 : 14}px "FatCat Sans", sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, c.x, c.y);
  }
  ctx.restore();
}

const n = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

/**
 * Marker-only DXF (R12, ASCII names) in drawing coordinates: a circle, its number and a solid triangle for each
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
  const k = radius / MARKER_RADIUS_PX; // screen px of the on-screen marker → drawing units
  for (const p of points) {
    g(0, "CIRCLE"); g(8, "PHOTO-POINTS"); g(10, p.x); g(20, p.y); g(30, 0); g(40, radius);
    const label = labels.get(p.id) ?? String(p.no), h = radius * (label.length > 3 ? 0.55 : 0.75);
    g(0, "TEXT"); g(8, "PHOTO-POINTS"); g(10, p.x); g(20, p.y); g(30, 0); g(40, h); g(1, label);
    g(72, 1); g(73, 2); g(11, p.x); g(21, p.y); g(31, 0);
    // the same triangle as on screen, in drawing units (screen y is drawing -y)
    const d = screenDirection(p.angle), dir = { x: d.x, y: -d.y }, nrm = { x: -dir.y, y: dir.x };
    const tip = { x: p.x + dir.x * (radius + 13 * k), y: p.y + dir.y * (radius + 13 * k) };
    const base = { x: p.x + dir.x * (radius - 2 * k), y: p.y + dir.y * (radius - 2 * k) }, w = 9 * k;
    const a = { x: base.x + nrm.x * w, y: base.y + nrm.y * w }, b = { x: base.x - nrm.x * w, y: base.y - nrm.y * w };
    g(0, "SOLID"); g(8, "PHOTO-POINTS"); g(10, tip.x); g(20, tip.y); g(30, 0); g(11, a.x); g(21, a.y); g(31, 0);
    g(12, b.x); g(22, b.y); g(32, 0); g(13, b.x); g(23, b.y); g(33, 0);
  }
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

/** Circle radius in drawing units for the DXF: about the size the circles have on the exported sheet. */
export function dxfRadius(sheetWidth: number): number {
  return Math.max(sheetWidth * (MARKER_RADIUS_PX / 2000), 1e-6);
}
