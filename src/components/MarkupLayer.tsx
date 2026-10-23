import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DrawingPoint } from "../viewer/savedView";
import { arrowHead, PEN_PX, squareBox, TEXT_LINE_GAP, TEXT_PX, textLines, thinStroke, type Mark, type MarkTool } from "../viewer/markup";

/** Where a text markup goes: its top-left corner, and for a 多行 text box the box width (drawing units). */
export type TextSpot = { at: DrawingPoint; width?: number };

type Props = {
  marks: readonly Mark[];
  tool: MarkTool;
  color: string;
  project(points: readonly DrawingPoint[]): DrawingPoint[];
  unproject(x: number, y: number): DrawingPoint;
  ppu: number;
  onAdd(mark: Mark): void;
  onText(at: DrawingPoint, width?: number): void;
  /** A text markup already on the drawing was tapped: edit it instead of adding a new one. */
  onEditText?(index: number): void;
  /** Move the drawing by screen pixels (middle-button drag while a drawing tool is on). */
  onPan?(dx: number, dy: number): void;
  /** The spot picked for a text markup while its text is being typed (shown as a red paw). */
  textAnchor?: TextSpot | null;
};

/** Cat paw in the chosen colour on the spot where the text will go (the text starts at its top-left). */
function TextAnchorPaw({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g className="markup-text-anchor" transform={`translate(${x} ${y}) scale(1.6)`} style={{ fill: color, stroke: color.toLowerCase() === "#ffffff" ? "#333333" : "#ffffff" }}>
      <ellipse cx="-5.6" cy="-3.6" rx="1.7" ry="2.1" transform="rotate(-26 -5.6 -3.6)" />
      <ellipse cx="-2" cy="-6.6" rx="1.8" ry="2.2" />
      <ellipse cx="2" cy="-6.6" rx="1.8" ry="2.2" />
      <ellipse cx="5.6" cy="-3.6" rx="1.7" ry="2.1" transform="rotate(26 5.6 -3.6)" />
      <path d="M0 -2.6C4.6 -2.6 8 1 8 4.6C8 7.6 5.6 8.8 3.2 8.4C1.8 8.2 1 7.6 0 7.6C-1 7.6 -1.8 8.2 -3.2 8.4C-5.6 8.8 -8 7.6 -8 4.6C-8 1 -4.6 -2.6 0 -2.6Z" />
    </g>
  );
}

/** Tools drawn by dragging from one corner / end to the other. */
const twoPoint = (t: MarkTool) => t === "rect" || t === "circle" || t === "ellipse" || t === "line" || t === "arrow";

/** The finished shape for a two-point drag with tool `t`. */
function twoPointMark(t: MarkTool, color: string, a: DrawingPoint, b: DrawingPoint): Mark {
  if (t === "rect") return { kind: "rect", color, points: [a, b] };
  if (t === "circle") return { kind: "circle", color, points: squareBox(a, b) };
  if (t === "ellipse") return { kind: "circle", color, points: [a, b] };
  if (t === "arrow") return { kind: "arrow", color, points: [a, b] };
  return { kind: "pen", color, points: [a, b] };
}

/**
 * Markups drawn over the drawing. With 移動 selected the layer lets touches through to the drawing
 * (pan / pinch); with a pen, line, box, circle or text tool one finger draws. 直線 is one straight
 * segment: press at one end, drag, release at the other.
 */
export function MarkupLayer({ marks, tool, color, project, unproject, ppu, onAdd, onText, onEditText, onPan, textAnchor }: Props) {
  const drawing = useRef<{ id: number; points: DrawingPoint[] } | null>(null);
  const panning = useRef<{ id: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DrawingPoint[] | null>(null);
  const local = (e: ReactPointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); return unproject(e.clientX - r.left, e.clientY - r.top); };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button === 1) {
      // Middle button moves the drawing even while drawing tools are on (like two fingers on a phone).
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panning.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "move" || drawing.current) return;
    e.preventDefault();
    if (tool === "text") { onText(local(e)); return; }
    // 多行: drag out the text box first (like the box tool); its width wraps the lines.
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    drawing.current = { id: e.pointerId, points: [p, p] };
    setDraft([p, p]);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const pan = panning.current;
    if (pan && pan.id === e.pointerId) { onPan?.(e.clientX - pan.x, e.clientY - pan.y); pan.x = e.clientX; pan.y = e.clientY; return; }
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    const p = local(e);
    d.points = twoPoint(tool) || tool === "mtext" ? [d.points[0], p] : [...d.points, p];
    setDraft(d.points);
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (panning.current?.id === e.pointerId) { panning.current = null; return; }
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    drawing.current = null;
    setDraft(null);
    const [a, b] = [d.points[0], d.points.at(-1)!];
    const tooSmall = Math.hypot((b.x - a.x) * ppu, (b.y - a.y) * ppu) < 4 && d.points.length < 4;
    if (tool === "mtext") {
      // A tap (or a box too narrow to write in) still writes multi-line text there, just without wrapping.
      if (tooSmall || Math.abs(b.x - a.x) * ppu < 24) { onText(a); return; }
      const [sa, sb] = project([a, b]);
      onText(unproject(Math.min(sa.x, sb.x), Math.min(sa.y, sb.y)), Math.abs(sb.x - sa.x) / ppu);
      return;
    }
    if (tooSmall) return;
    if (twoPoint(tool)) onAdd(twoPointMark(tool, color, a, b));
    else onAdd({ kind: "pen", color, points: thinStroke(d.points, 1.5 / ppu) });
  };

  const path = (pts: DrawingPoint[]) => project(pts).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const box = (pts: readonly DrawingPoint[]) => { const [a, b] = project(pts); return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }; };
  const pending: Mark | null = !draft || tool === "mtext" ? null : twoPoint(tool) ? twoPointMark(tool, color, draft[0], draft.at(-1)!) : { kind: "pen", color, points: draft };
  const all: Mark[] = pending ? [...marks, pending] : [...marks];

  return (
    <svg className={`markup-layer${tool === "move" ? " passive" : ""}`} aria-label="標註" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {all.map((m, i) => m.kind === "text"
        ? (() => { const [p] = project([m.at]); const px = Math.max(6, m.size * ppu); return <text key={i} x={p.x} y={p.y + px * 0.85} fontSize={px} fill={m.color} className="markup-text"
            onPointerDown={i < marks.length && onEditText ? (e) => { if (e.pointerType === "mouse" && e.button !== 0) return; e.stopPropagation(); e.preventDefault(); onEditText(i); } : undefined}>
            {textLines(m.text, px, m.width ? m.width * ppu : undefined).map((line, k) => <tspan key={k} x={p.x} dy={k ? px * TEXT_LINE_GAP : 0}>{line}</tspan>)}</text>; })()
        : m.kind === "rect" ? <rect key={i} {...box(m.points)} stroke={m.color} strokeWidth={PEN_PX} fill="none" />
        : m.kind === "arrow" ? (() => { const [a, b] = project(m.points), [l, r] = arrowHead(a, b); return <polyline key={i} points={`${a.x},${a.y} ${b.x},${b.y} ${l.x},${l.y} ${b.x},${b.y} ${r.x},${r.y}`} stroke={m.color} strokeWidth={PEN_PX} fill="none" strokeLinecap="round" strokeLinejoin="round" />; })()
        : m.kind === "circle" ? (() => { const r = box(m.points); return <ellipse key={i} cx={r.x + r.width / 2} cy={r.y + r.height / 2} rx={r.width / 2} ry={r.height / 2} stroke={m.color} strokeWidth={PEN_PX} fill="none" />; })()
        : <polyline key={i} points={path(m.points)} stroke={m.color} strokeWidth={PEN_PX} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {draft && tool === "mtext" ? (() => { const r = box([draft[0], draft.at(-1)!]); return <rect {...r} className="markup-textbox" stroke={color} />; })() : null}
        {textAnchor?.width ? (() => { const [p] = project([textAnchor.at]); return <rect x={p.x} y={p.y} width={textAnchor.width * ppu} height={TEXT_PX * TEXT_LINE_GAP * 2} className="markup-textbox" stroke={color} />; })() : null}
        {textAnchor ? (() => { const [p] = project([textAnchor.at]); return <TextAnchorPaw x={p.x} y={p.y} color={color} />; })() : null}
    </svg>
  );
}
