// Measuring overlay (T15 2.2): current lines in amber with bright red points, numbers and length
// labels; kept results in grey; the long-press crosshair with the snap marker. Never takes touches.
import type { DrawingPoint } from "../types/drawing";
import type { SnapKind } from "../viewer/measurementGeometry";
import { rightAngleCue, snapMarkPath, SNAP_MARK_NAMES, type OverlayModel, type OverlayShape } from "./overlayModel";

const AMBER = "#ffb547", RED = "#ff1f1f", DARK = "#081019", GREY = "#8a979f", GREY_TEXT = "#a7b4bd", GREEN = "#36d399";
const pointsAttr = (pts: readonly DrawingPoint[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

function RightAngle({ points }: { points: DrawingPoint[] }) {
  return points.length ? <polyline className="measure-right-angle" points={pointsAttr(points)} fill="none" stroke="#a0a8b0" strokeWidth={2} strokeLinejoin="miter" pointerEvents="none" /> : null;
}

function Shape({ s, kept }: { s: OverlayShape; kept: boolean }) {
  const color = kept ? GREY : AMBER;
  const line = s.closed
    ? <polygon points={pointsAttr(s.points)} fill={kept ? "none" : "rgba(255,181,71,0.12)"} stroke={color} strokeWidth={2} strokeLinejoin="round" />
    : <polyline points={pointsAttr(s.points)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <g className={kept ? "measure-kept-shape" : "measure-current-shape"}>
      {s.points.length > 1 ? line : null}
      {s.rightAngles?.map((points, i) => <RightAngle key={`r${i}`} points={points} />)}
      {s.labels.map((l, i) => (
        <text key={`l${i}`} className="measure-length-label" x={l.x} y={l.y} fontSize={l.size} fontWeight={700} textAnchor="middle"
          fill={kept ? GREY_TEXT : RED} stroke={DARK} strokeWidth={l.stroke} paintOrder="stroke" strokeLinejoin="round">{l.text}</text>
      ))}
      {s.dots.map((p, i) => kept
        ? <circle key={`d${i}`} className="measure-kept-dot" cx={p.x} cy={p.y} r={4} fill={GREY} stroke={DARK} strokeWidth={1.5} />
        : <g key={`d${i}`}>
            <circle className="measure-dot" cx={p.x} cy={p.y} r={5} fill={RED} stroke="#fff" strokeWidth={1.5} />
            <text className="measure-dot-number" x={p.x + 11} y={p.y - 11} fontSize={13} fontWeight={800} fill={RED} stroke={DARK} strokeWidth={3} paintOrder="stroke">{i + 1}</text>
          </g>)}
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
  return (
    <svg className="measure-overlay" aria-hidden="true">
      {model.kept.map((s, i) => <Shape key={i} s={s} kept />)}
      {model.current ? <Shape s={model.current} kept={false} /> : null}
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
