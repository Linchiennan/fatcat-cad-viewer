// Measuring overlay (T15 2.2): current lines in amber with bright red points, numbers and length
// labels; kept results look the same (用戶指定：結束量測後不變灰) without the point numbers; the long-press crosshair
// with the snap marker. Never takes touches.
import type { DrawingPoint } from "../types/drawing";
import type { SnapKind } from "../viewer/measurementGeometry";
import { rightAngleCue, snapMarkPath, SNAP_MARK_NAMES, type OverlayLabel, type OverlayModel, type OverlayShape } from "./overlayModel";
import { useLabelStyle, type MeasureLabelStyle } from "../viewer/measureLabelStyle";

const AMBER = "#ffb547", RED = "#ff1f1f", DARK = "#081019", GREEN = "#36d399";
const pointsAttr = (pts: readonly DrawingPoint[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

function RightAngle({ points }: { points: DrawingPoint[] }) {
  return points.length ? <polyline className="measure-right-angle" points={pointsAttr(points)} fill="none" stroke="#a0a8b0" strokeWidth={2} strokeLinejoin="miter" pointerEvents="none" /> : null;
}

/** Width of a number in px: the canvas measures it; tests (no canvas) estimate 0.6 em per character. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, size: number): number {
  if (measureCtx === undefined) { try { measureCtx = document.createElement("canvas").getContext("2d"); } catch { measureCtx = null; } }
  if (measureCtx) {
    measureCtx.font = `700 ${size}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    const w = measureCtx.measureText(text).width;
    if (w > 0) return w;
  }
  return text.length * size * 0.6;
}

type Placed = { l: OverlayLabel; x: number; y: number; w: number; h: number; angle: number };
/** Where each number goes for the chosen style: centred on its line (box, gap) or turned with it just above (angle). */
function place(l: OverlayLabel, style: MeasureLabelStyle): Placed {
  const w = textWidth(l.text, l.size), h = l.size * 1.05;
  // Totals and angles keep their spot; l.y is a baseline, the text is drawn centred.
  if (!l.seg) return { l, x: l.x, y: l.y - l.size * 0.35, w, h, angle: 0 };
  const { a, b } = l.seg, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if (style !== "angle") return { l, x: mx, y: my, w, h, angle: 0 };
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (angle > 90) angle -= 180; else if (angle <= -90) angle += 180;
  const r = angle * Math.PI / 180, off = l.size * 0.75; // the normal pointing up the screen
  return { l, x: mx + Math.sin(r) * off, y: my - Math.cos(r) * off, w, h, angle };
}

/** The line pieces left once the numbers cut gaps in it (gap style). */
function piecesAround(points: DrawingPoint[], closed: boolean, cuts: Placed[]): DrawingPoint[][] {
  const n = points.length, last = closed && n >= 3 ? n : n - 1, out: DrawingPoint[][] = [];
  for (let i = 0; i < last; i++) {
    const a = points[i], b = points[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 0)) continue;
    const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
    const cut = cuts.find((c) => c.l.seg && c.l.seg.a === a && c.l.seg.b === b);
    if (!cut) { out.push([a, b]); continue; }
    // Half the gap: how far along the line its centre is from the number box edge, plus breathing room.
    const half = Math.min(cut.w / 2 / Math.max(Math.abs(dx), 1e-6), cut.h / 2 / Math.max(Math.abs(dy), 1e-6)) + 5;
    const t0 = len / 2 - half, t1 = len / 2 + half;
    if (t0 > 0) out.push([a, { x: a.x + dx * t0, y: a.y + dy * t0 }]);
    if (t1 < len) out.push([{ x: a.x + dx * t1, y: a.y + dy * t1 }, b]);
  }
  return out;
}

function Shape({ s, kept, style }: { s: OverlayShape; kept: boolean; style: MeasureLabelStyle }) {
  const placed = s.labels.map((l) => place(l, style));
  const gaps = style === "gap" && s.points.length > 1;
  const stroke = { stroke: AMBER, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const line = gaps
    ? <>{s.closed ? <polygon points={pointsAttr(s.points)} fill="rgba(255,181,71,0.12)" stroke="none" /> : null}
        {piecesAround(s.points, s.closed, placed).map((p, i) => <polyline key={`p${i}`} className="measure-line-piece" points={pointsAttr(p)} fill="none" {...stroke} />)}</>
    : s.closed
      ? <polygon points={pointsAttr(s.points)} fill="rgba(255,181,71,0.12)" {...stroke} />
      : <polyline points={pointsAttr(s.points)} fill="none" {...stroke} />;
  return (
    <g className={kept ? "measure-kept-shape" : "measure-current-shape"}>
      {s.points.length > 1 ? line : null}
      {s.rightAngles?.map((points, i) => <RightAngle key={`r${i}`} points={points} />)}
      {placed.map(({ l, x, y, w, h, angle }, i) => (
        <g key={`l${i}`} transform={angle ? `rotate(${angle.toFixed(2)} ${x.toFixed(1)} ${y.toFixed(1)})` : undefined}>
          {style === "box" ? <rect className="measure-label-box" x={x - w / 2 - 5} y={y - h / 2 - 2} width={w + 10} height={h + 4} rx={6}
            fill="rgba(8,16,25,0.85)" stroke="rgba(255,181,71,0.55)" strokeWidth={1} /> : null}
          <text className="measure-length-label" x={x} y={y} fontSize={l.size} fontWeight={700} textAnchor="middle" dominantBaseline="central"
            fill={RED} stroke={DARK} strokeWidth={l.stroke} paintOrder="stroke" strokeLinejoin="round">{l.text}</text>
        </g>
      ))}
      {s.dots.map((p, i) => (
        <g key={`d${i}`}>
          <circle className={kept ? "measure-kept-dot" : "measure-dot"} cx={p.x} cy={p.y} r={5} fill={RED} stroke="#fff" strokeWidth={1.5} />
          {kept ? null : <text className="measure-dot-number" x={p.x + 11} y={p.y - 11} fontSize={13} fontWeight={800} fill={RED} stroke={DARK} strokeWidth={3} paintOrder="stroke">{i + 1}</text>}
        </g>))}
    </g>
  );
}

export function MeasureOverlay({ model, aim, snapAt }: {
  model: OverlayModel;
  /** Long-press crosshair position (canvas px), or null. */
  aim: DrawingPoint | null;
  /** Snap the aim would take: where and which kind. */
  snapAt: (DrawingPoint & { kind: SnapKind; perpendicularFrom?: DrawingPoint }) | null;
}) {
  const style = useLabelStyle();
  return (
    <svg className="measure-overlay" aria-hidden="true">
      {model.kept.map((s, i) => <Shape key={i} s={s} kept style={style} />)}
      {model.current ? <Shape s={model.current} kept={false} style={style} /> : null}
      {model.outline ? <polyline className="measure-object-outline" points={pointsAttr(model.outline)} fill="none" stroke={AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {aim ? (
        <g className="measure-aim" style={{ filter: "drop-shadow(0 0 1px #000)" }}>
          <line x1={aim.x - 22} y1={aim.y} x2={aim.x + 22} y2={aim.y} stroke="#fff" strokeWidth={1.5} />
          <line x1={aim.x} y1={aim.y - 22} x2={aim.x} y2={aim.y + 22} stroke="#fff" strokeWidth={1.5} />
        </g>
      ) : null}
      {aim && snapAt ? (
        <g className="measure-snap-mark">
          {snapAt.kind === 'perpendicular' ? (snapAt.perpendicularFrom ? <RightAngle points={rightAngleCue(snapAt, snapAt.perpendicularFrom)} /> : null) : <path d={snapMarkPath(snapAt.kind, snapAt.x, snapAt.y)} fill="none" stroke={GREEN} strokeWidth={2.5} />}
          <text x={snapAt.x + 13} y={snapAt.y - 9} fontSize={12} fontWeight={800} fill={GREEN} stroke={DARK} strokeWidth={3} paintOrder="stroke">{SNAP_MARK_NAMES[snapAt.kind]}</text>
        </g>
      ) : null}
    </svg>
  );
}
