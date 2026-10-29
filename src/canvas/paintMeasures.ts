// Measuring marks on a shared / exported picture (用戶 2026-10-29：量測的數據在分享時要保留). Draws what MeasureOverlay
// shows on screen — lines, area fill, number boxes, points and their numbers — in the same colours and number style,
// on a canvas whose pixels are `scale` times the screen pixels. The long-press crosshair is not part of the picture.
import type { DrawingPoint } from "../types/drawing";
import type { OverlayModel, OverlayShape } from "./overlayModel";
import { DARK, dotNumberAt, piecesAround, place, RED, withAlpha } from "./MeasureOverlay";
import { measureColorHex, type MeasureColors, type MeasureLabelStyle } from "../viewer/measureLabelStyle";

/** The page font, as the overlay's text uses it (its box widths are measured in it). */
let FONT = "sans-serif";
try { FONT = getComputedStyle(document.body).fontFamily || FONT; } catch { /* no document (tests) */ }

function path(ctx: CanvasRenderingContext2D, pts: readonly DrawingPoint[], closed: boolean) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (closed) ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function shape(ctx: CanvasRenderingContext2D, s: OverlayShape, kept: boolean, style: MeasureLabelStyle, colors: MeasureColors) {
  const lineHex = measureColorHex(colors.line), textHex = measureColorHex(colors.text), boxHex = measureColorHex(colors.box);
  const placed = s.labels.map((l) => place(l, style));
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (s.points.length > 1) {
    if (s.closed) { path(ctx, s.points, true); ctx.fillStyle = withAlpha(lineHex, 0.12); ctx.fill(); }
    ctx.strokeStyle = lineHex; ctx.lineWidth = 2;
    const pieces = style === "gap" ? piecesAround(s.points, s.closed, placed) : [s.closed ? [...s.points, s.points[0]] : s.points];
    for (const p of pieces) { path(ctx, p, false); ctx.stroke(); }
  }
  for (const r of s.rightAngles ?? []) { ctx.strokeStyle = "#a0a8b0"; ctx.lineWidth = 2; ctx.lineJoin = "miter"; path(ctx, r, false); ctx.stroke(); ctx.lineJoin = "round"; }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const { l, x, y, w, h, angle } of placed) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle * Math.PI / 180);
    if (style === "box") {
      roundRect(ctx, -w / 2 - 5, -h / 2 - 2, w + 10, h + 4, 6);
      ctx.fillStyle = "rgba(8,16,25,0.85)"; ctx.fill();
      ctx.strokeStyle = withAlpha(boxHex, 0.55); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.font = `700 ${l.size}px ${FONT}`;
    ctx.strokeStyle = DARK; ctx.lineWidth = l.stroke; ctx.strokeText(l.text, 0, 0);
    ctx.fillStyle = textHex; ctx.fillText(l.text, 0, 0);
    ctx.restore();
  }
  s.dots.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = RED; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    if (kept) return;
    const at = dotNumberAt(s.dots, i, s.closed);
    ctx.font = `800 13px ${FONT}`;
    ctx.strokeStyle = DARK; ctx.lineWidth = 3; ctx.strokeText(String(i + 1), at.x, at.y);
    ctx.fillStyle = RED; ctx.fillText(String(i + 1), at.x, at.y);
  });
}

/** Paint the measuring overlay (screen-px coordinates) onto a picture `scale` times larger. */
export function paintMeasures(ctx: CanvasRenderingContext2D, model: OverlayModel, style: MeasureLabelStyle, colors: MeasureColors, scale: number): void {
  ctx.save();
  ctx.scale(scale, scale);
  for (const s of model.kept) shape(ctx, s, true, style, colors);
  if (model.current) shape(ctx, model.current, false, style, colors);
  if (model.outline && model.outline.length > 1) {
    ctx.strokeStyle = measureColorHex(colors.line); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    path(ctx, model.outline, false); ctx.stroke();
  }
  ctx.restore();
}
