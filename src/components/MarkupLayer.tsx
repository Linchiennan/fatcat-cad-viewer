import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { hitMark, markBounds, translateMark } from "../viewer/markupMove";
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
  active?: boolean;
  onMove?(index: number, mark: Mark): void;
  onText(at: DrawingPoint, width?: number): void;
  /** A text markup already on the drawing was tapped: edit it instead of adding a new one. */
  onEditText?(index: number): void;
  /** Move the drawing by screen pixels (middle-button drag while a drawing tool is on). */
  onPan?(dx: number, dy: number): void;
  /** Zoom by `factor` around screen px (x, y): the mouse wheel and a two-finger pinch while marking. */
  onZoom?(x: number, y: number, factor: number): void;
  /** The spot picked for a text markup while its text is being typed (shown as a red paw). */
  textAnchor?: TextSpot | null;
  /** Size of the text being typed, in screen pixels; the paw is drawn this tall. */
  textPx?: number;
};

/** The paw outline is 17.6 units tall; scaled so the paw is as tall as the text size. */
const PAW_UNITS = 17.6;

/**
 * Cat paw in the chosen colour exactly where the first character will appear: the text starts at (x, y) and grows
 * right and down, so the paw (drawn around its own centre) is moved half a character right and down and is as tall
 * as the text.
 */
function TextAnchorPaw({ x, y, color, size, centered }: { x: number; y: number; color: string; size: number; centered?: boolean }) {
  return (
    <g className="markup-text-anchor" data-size={size} transform={`translate(${centered ? x : x + size / 2} ${centered ? y : y + size / 2}) scale(${size / PAW_UNITS})`} style={{ fill: color, stroke: color.toLowerCase() === "#ffffff" ? "#333333" : "#ffffff" }}>
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

/** Existing markups are moved as whole objects; middle drag or two fingers pan, the wheel or a pinch zooms. */
export function MarkupLayer({ marks, tool, color, project, unproject, ppu, onAdd, onText, onEditText, onPan, onZoom, textAnchor, textPx = TEXT_PX, active = true, onMove }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [moved, setMoved] = useState<Mark | null>(null);
  const gesture = useRef<{id:number; index:number; original:Mark; start:DrawingPoint; x:number; y:number; dragged:boolean; next:Mark} | null>(null);
  const tap = useRef<{index:number; mark:Mark; x:number; y:number; time:number} | null>(null);
  const editCooldown = useRef(0);
  const screen = (e: {clientX:number;clientY:number}) => { const r=svg.current!.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; };
  const textBox = (i:number) => { const el=svg.current?.querySelector<SVGGraphicsElement>(`[data-mark-index="${i}"]`); return el?.getBBox?.(); };
  const hit = (e:{clientX:number;clientY:number}) => hitMark(marks,screen(e),project,ppu,textBox);
  const release = (id:number) => { if(svg.current?.hasPointerCapture?.(id))svg.current.releasePointerCapture(id); };
  const cancel = () => { const ids=[gesture.current?.id,drawing.current?.id,panning.current?.id,textTap.current?.id]; gesture.current=null; drawing.current=null;panning.current=null;textTap.current=null;setMoved(null);setDraft(null);tap.current=null;ids.forEach(id=>{if(id!==undefined)release(id);}); };
  useEffect(() => { cancel();setSelected(null); }, [tool,active,marks]);
  const edit = (index:number) => { if(!active)return;const now=performance.now();if(now<editCooldown.current)return;editCooldown.current=now+450;tap.current=null;onEditText?.(index); };
  const drawing = useRef<{ id: number; points: DrawingPoint[] } | null>(null);
  const panning = useRef<{ id: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<DrawingPoint[] | null>(null);
  const local = (e: ReactPointerEvent) => { const r = e.currentTarget.getBoundingClientRect(); return unproject(e.clientX - r.left, e.clientY - r.top); };
  // 文字 is placed when the finger lifts, so the first finger of a pinch does not open the text box.
  const textTap = useRef<{ id: number; p: DrawingPoint; x: number; y: number } | null>(null);
  // Two fingers zoom and pan the drawing in every markup tool (the second finger drops the stroke the first one began);
  // after a pinch nothing is drawn until every finger is up.
  const touches = useRef(new Map<number, DrawingPoint>());
  const pinch = useRef<{ d: number; x: number; y: number } | null>(null);
  const afterPinch = useRef(false);
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  const pinchSpot = () => { const [a, b] = [...touches.current.values()]; return { d: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const startPinch = (e: ReactPointerEvent<SVGSVGElement>) => {
    cancel();
    for (const id of touches.current.keys()) { try { e.currentTarget.setPointerCapture(id); } catch { /* finger already gone */ } }
    pinch.current = pinchSpot();
    afterPinch.current = true;
  };
  const movePinch = () => {
    const prev = pinch.current!, next = pinchSpot();
    onPan?.(next.x - prev.x, next.y - prev.y);
    if (prev.d > 0 && next.d > 0) zoomRef.current?.(next.x, next.y, next.d / prev.d);
    pinch.current = next;
  };
  const lift = (id: number) => {
    touches.current.delete(id);
    if (touches.current.size < 2) pinch.current = null;
    if (!touches.current.size) afterPinch.current = false;
  };
  // The wheel zooms around the mouse; a native listener because React wheel handlers cannot stop the page scrolling.
  useEffect(() => {
    const el = svg.current;
    if (!el || !active) return;
    const wheel = (e: WheelEvent) => {
      if (!zoomRef.current) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1);
      zoomRef.current(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0015));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [active]);

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!active) return;
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, screen(e));
      if (touches.current.size >= 2) { e.preventDefault(); startPinch(e); return; }
    }
    if (afterPinch.current) return;
    if (e.pointerType === "mouse" && e.button === 1) {
      // Middle button moves the drawing even while drawing tools are on (like two fingers on a phone).
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panning.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (drawing.current || gesture.current || panning.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const index = hit(e);
    if ((active && tool === 'move') || (index >= 0 && marks[index].kind === 'text')) {
      e.preventDefault();e.stopPropagation();setSelected(index >= 0 ? index : null);
      if(index < 0){tap.current=null;return;}
      const original=marks[index];
      gesture.current={id:e.pointerId,index,original,start:local(e),x:e.clientX,y:e.clientY,dragged:false,next:original};
      e.currentTarget.setPointerCapture(e.pointerId);return;
    }
    if (!active) return;
    tap.current=null;
    e.preventDefault();
    if (tool === "text") { e.currentTarget.setPointerCapture(e.pointerId); textTap.current = { id: e.pointerId, p: local(e), x: e.clientX, y: e.clientY }; return; }
    // 多行: drag out the text box first (like the box tool); its width wraps the lines.
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    drawing.current = { id: e.pointerId, points: [p, p] };
    setDraft([p, p]);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, screen(e));
      if (pinch.current) { e.preventDefault(); movePinch(); return; }
    }
    const g=gesture.current;
    if(g && g.id===e.pointerId){
      e.preventDefault();e.stopPropagation();
      if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>5)g.dragged=true;
      if(g.dragged){tap.current=null;if(active && tool==='move'){const p=local(e);g.next=translateMark(g.original,p.x-g.start.x,p.y-g.start.y);setMoved(g.next);}}
      return;
    }
    const pan = panning.current;
    if (pan && pan.id === e.pointerId) { onPan?.(e.clientX - pan.x, e.clientY - pan.y); pan.x = e.clientX; pan.y = e.clientY; return; }
    const d = drawing.current;
    if (!d || d.id !== e.pointerId) return;
    const p = local(e);
    d.points = twoPoint(tool) || tool === "mtext" ? [d.points[0], p] : [...d.points, p];
    setDraft(d.points);
  };
  const up = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") { const pinching = afterPinch.current; lift(e.pointerId); if (pinching) { release(e.pointerId); return; } }
    const t = textTap.current;
    if (t && t.id === e.pointerId) {
      textTap.current = null; release(e.pointerId);
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) <= 12) onText(t.p);
      return;
    }
    const g=gesture.current;
    if(g && g.id===e.pointerId){
      move(e);gesture.current=null;setMoved(null);release(e.pointerId);e.stopPropagation();e.preventDefault();
      if(g.dragged){editCooldown.current=performance.now()+450;tap.current=null;if(g.next!==g.original)onMove?.(g.index,g.next);return;}
      if(g.original.kind==='text'){
        const previous=tap.current,now=performance.now();
        if(previous && previous.index===g.index && previous.mark===g.original && now-previous.time<=350 && Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<=20)edit(g.index);
        else tap.current={index:g.index,mark:g.original,x:e.clientX,y:e.clientY,time:now};
      }else tap.current=null;
      return;
    }
    if (panning.current?.id === e.pointerId) { panning.current = null; release(e.pointerId); return; }
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
  const shown = marks.map((m,i)=>i===selected && moved ? moved : m);
  const all: Mark[] = pending ? [...shown, pending] : shown;
  const selection = selected !== null && shown[selected] ? markBounds(shown[selected],project,ppu) : null;

  return (
    <svg ref={svg} className={`markup-layer${!active ? " passive" : ""}`} aria-label="註記" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{if(e.pointerType==="touch")lift(e.pointerId);cancel();}} onLostPointerCapture={()=>{if(gesture.current || drawing.current || panning.current || textTap.current)cancel();}}
      onDoubleClick={e=>{if(!active)return;e.preventDefault();e.stopPropagation(); /* Pointer taps already handled editing; swallow synthetic dblclick only while marking. */}}>
      {all.map((m, i) => m.kind === "text"
        ? (() => { const [p] = project([m.at]); const px = Math.max(6, m.size * ppu); return <text key={i} data-mark-index={i} x={p.x} y={p.y + px * 0.85} fontSize={px} fill={m.color} className="markup-text">
            {textLines(m.text, px, m.width ? m.width * ppu : undefined).map((line, k) => <tspan key={k} x={p.x} dy={k ? px * TEXT_LINE_GAP : 0}>{line}</tspan>)}</text>; })()
        : m.kind === "rect" ? <rect key={i} {...box(m.points)} stroke={m.color} strokeWidth={PEN_PX} fill="none" />
        : m.kind === "arrow" ? (() => { const [a, b] = project(m.points), [l, r] = arrowHead(a, b); return <polyline key={i} points={`${a.x},${a.y} ${b.x},${b.y} ${l.x},${l.y} ${b.x},${b.y} ${r.x},${r.y}`} stroke={m.color} strokeWidth={PEN_PX} fill="none" strokeLinecap="round" strokeLinejoin="round" />; })()
        : m.kind === "circle" ? (() => { const r = box(m.points); return <ellipse key={i} cx={r.x + r.width / 2} cy={r.y + r.height / 2} rx={r.width / 2} ry={r.height / 2} stroke={m.color} strokeWidth={PEN_PX} fill="none" />; })()
        : <polyline key={i} points={path(m.points)} stroke={m.color} strokeWidth={PEN_PX} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {selection ? <rect data-mark-selection={selected} x={selection.x-6} y={selection.y-6} width={selection.width+12} height={selection.height+12} fill="none" stroke="#00cfff" strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" /> : null}
        {draft && tool === "mtext" ? (() => { const r = box([draft[0], draft.at(-1)!]); return <rect {...r} className="markup-textbox" stroke={color} />; })() : null}
        {textAnchor?.width ? (() => { const [p] = project([textAnchor.at]); return <rect x={p.x} y={p.y} width={textAnchor.width * ppu} height={textPx * TEXT_LINE_GAP * 2} className="markup-textbox" stroke={color} />; })() : null}
        {textAnchor ? (() => { const [p] = project([textAnchor.at]); // One-line text: the paw is centred on the tapped spot (the first character will be centred there too).
          // 多行 box: the paw sits in the box's first character cell.
          return <TextAnchorPaw x={p.x} y={p.y} color={color} size={textPx} centered={!textAnchor.width} />; })() : null}
    </svg>
  );
}
