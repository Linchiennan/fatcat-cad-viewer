// Photo points on the drawing (spec 009 定案 2/4/7), drawn like the user's 對位圖: a red circle with the number
// ("21" or "21x2") and a triangle outside it pointing where the camera looks. Screen-sized, so they stay readable
// at any zoom. Taps on empty drawing add a point while placing; a point is dragged to move it and its triangle is
// dragged to turn it (45° steps; hold still half a second before dragging for any angle). Pan / pinch still reach
// the engine: only the markers themselves take the pointer.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "../i18n/translations";
import type { DrawingPoint } from "../viewer/savedView";
import type { ShotPoint } from "./types";

export const MARKER_RADIUS_PX = 17;
export const MARKER_RED = "#ff2a1a";
/** inside of a point that has its photo (用戶 2026-11-22：「箭頭有拍完照片，內部改成綠色代表完成」); screen only, the
 * exported 對位圖 keeps the user's red */
export const MARKER_DONE = "#22c55e";
const HOLD_FOR_FREE_MS = 450;

type Props = {
  points: readonly ShotPoint[];
  /** text in each circle by point id ("21" / "21x2") */
  labels: ReadonlyMap<string, string>;
  /** ids of points that already have a photo: drawn filled green (done) */
  done?: ReadonlySet<string>;
  selectedId: string | null;
  /** taps on the drawing add a point */
  placing: boolean;
  project(points: readonly DrawingPoint[]): DrawingPoint[];
  unproject(x: number, y: number): DrawingPoint;
  ppu: number;
  onAdd(at: DrawingPoint): void;
  onSelect(id: string | null): void;
  onMove(id: string, at: DrawingPoint): void;
  onTurn(id: string, angle: number): void;
  /** size of every marker (1 = normal), set with the panel slider */
  scale?: number;
  /** sheet width in drawing units: markers are sized on the drawing (markerUnitRadius) and zoom with it */
  sheetWidth?: number;
};

/**
 * Marker size factor on screen (1 = MARKER_RADIUS_PX): the radius in drawing units × pixels per unit, so the marker
 * shrinks and grows with the drawing like a CAD block (用戶 2026-11-22：「建築圖縮小，他沒跟著縮小」). Without a sheet
 * width (not known yet) it falls back to the fixed screen size.
 */
export function screenMarkerScale(sheetWidth: number | undefined, ppu: number, scale = 1): number {
  if (!(sheetWidth && sheetWidth > 0 && ppu > 0)) return scale;
  return (sheetWidth * (MARKER_RADIUS_PX / 2000) * scale * ppu) / MARKER_RADIUS_PX;
}

/** Screen direction of a drawing angle (degrees CCW from +X); screen y grows downward. */
export function screenDirection(angle: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180;
  return { x: Math.cos(a), y: -Math.sin(a) };
}

/** Drawing angle (degrees CCW from +X) of a screen drag from the centre. */
export function angleFromScreen(dx: number, dy: number): number {
  return ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
}

/**
 * Arrow size in circle radii: the tip reaches ARROW_TIP from the centre and the base, through the centre, reaches
 * ARROW_WIDTH to each side. The example block 「對位箭頭」 (ZWCAD, 8F-室內隔間對位圖.dwg) is √2 / √2, so the tip sticks
 * out no further than the side fins and the direction is hard to read on a phone (用戶 2026-11-22：「箭頭方向太不明顯了」
 * → 「是箭頭兩邊要加大」→ 選「加寬 1.4」): longer tip, wider base. The exported LISP still inserts the user's own block, unchanged.
 */
export const ARROW_TIP = 2.2;
export const ARROW_WIDTH = 1.4;

/**
 * The arrow: the triangle (tip k·r ahead, base corners w·r to each side of the centre) minus the circle, as three
 * pieces that can each be fanned from their first point: the tip piece between the two tangents from the tip, and
 * one side piece each (base corner, circle at ±90°, arc to the tangent point, tip). Needs the sides outside the
 * circle, i.e. w ≥ k/√(k²−1); smaller w is raised to that (then the sides are the tangents, as in the example block).
 */
export function wedgePieces(cx: number, cy: number, dx: number, dy: number, r: number, k = ARROW_TIP, w = ARROW_WIDTH, segments = 12): { x: number; y: number }[][] {
  const a = Math.atan2(dy, dx), at = (t: number, m: number) => ({ x: cx + Math.cos(t) * r * m, y: cy + Math.sin(t) * r * m });
  const arc = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => at(from + ((to - from) * i) / n, 1));
  const th = Math.acos(1 / k), wide = Math.max(w, k / Math.sqrt(k * k - 1)), p = Math.PI / 2, half = Math.max(2, Math.round(segments / 2));
  const tip = at(a, k);
  return [
    [tip, ...arc(a + th, a - th, segments)],
    [at(a + p, wide), ...arc(a + p, a + th, half), tip],
    [at(a - p, wide), ...arc(a - p, a - th, half), tip],
  ];
}

/** The arrow on screen as an SVG path `d` string (three closed pieces). */
export function arrowPath(cx: number, cy: number, angle: number, scale = 1): string {
  const d = screenDirection(angle);
  return wedgePieces(cx, cy, d.x, d.y, MARKER_RADIUS_PX * scale)
    .map((piece) => piece.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("") + "Z").join("");
}

/** Finger grips in px: a fingertip is about 44 px across. Moving takes the circle plus a margin (at least 22 px
 * radius); turning takes the ring around it out past the arrow tip (at least 22 px beyond the move grip). */
export function moveGripRadius(scale = 1): number {
  return Math.max(MARKER_RADIUS_PX * scale + 4, 22);
}
/** 用戶 2026-11-22：「要加大定點時箭頭的轉圈範圍，現在過小」: at least 80 px (was 44), always well past the arrow tip. */
export const TURN_GRIP_MIN_PX = 80;
export function turnGripRadius(scale = 1): number {
  return Math.max(MARKER_RADIUS_PX * scale * ARROW_TIP + 30, moveGripRadius(scale) + 50, TURN_GRIP_MIN_PX);
}

/** ox / oy: finger minus marker centre at the start, so a moved point keeps its place under the finger */
/** Circle line width: in proportion to the marker (2.5 px at normal size, as before), at least a thin hairline. */
export function markerLine(k: number): number {
  return Math.max(0.5, 2.5 * k);
}
/** Number size in px for a label at marker size k. */
export function markerFont(label: string, k: number): number {
  return (label.length > 3 ? 10.5 : label.length > 2 ? 13 : 16) * k;
}
/** Below this the number is a blot that hides the circle and arrow, so it is left out until the drawing is zoomed in. */
export const MIN_TEXT_PX = 5;

type Drag = { id: string; kind: "move" | "turn"; pointerId: number; start: number; moved: boolean; free: boolean; ox: number; oy: number };

export function PhotoMarkerLayer(props: Props) {
  const { t } = useI18n();
  const svg = useRef<SVGSVGElement>(null);
  const live = useRef(props);
  live.current = props;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<{ id: string; x?: number; y?: number; angle?: number } | null>(null);

  // Taps on the drawing (not on a marker) while placing: observe in the capture phase and leave pan/pinch alone.
  useEffect(() => {
    const root = svg.current?.parentElement;
    if (!root) return;
    const pointers = new Set<number>();
    let tap: { id: number; x: number; y: number; moved: boolean } | null = null;
    const local = (e: PointerEvent) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-photo-marker]")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.add(e.pointerId);
      tap = pointers.size > 1 ? null : { id: e.pointerId, ...local(e), moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!tap || tap.id !== e.pointerId) return;
      const p = local(e);
      if (Math.hypot(p.x - tap.x, p.y - tap.y) > 6) tap.moved = true;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      const t0 = tap; tap = null;
      if (!t0 || t0.id !== e.pointerId || t0.moved) return;
      const s = live.current;
      if (s.placing) s.onAdd(s.unproject(t0.x, t0.y));
      else s.onSelect(null);
    };
    const cancel = (e: PointerEvent) => { pointers.delete(e.pointerId); tap = null; };
    root.addEventListener("pointerdown", down, true); root.addEventListener("pointermove", move, true);
    root.addEventListener("pointerup", up, true); root.addEventListener("pointercancel", cancel, true);
    return () => {
      root.removeEventListener("pointerdown", down, true); root.removeEventListener("pointermove", move, true);
      root.removeEventListener("pointerup", up, true); root.removeEventListener("pointercancel", cancel, true);
    };
  }, []);

  const begin = (e: ReactPointerEvent, id: string, kind: Drag["kind"]) => {
    e.stopPropagation(); e.preventDefault();
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* pointer already gone: the drag still works without capture */ }
    props.onSelect(id);
    const r = svg.current?.getBoundingClientRect(), pt = props.points.find((q) => q.id === id);
    const [c] = pt ? props.project([{ x: pt.x, y: pt.y }]) : [{ x: NaN, y: NaN }];
    const ox = r && Number.isFinite(c.x) ? e.clientX - r.left - c.x : 0, oy = r && Number.isFinite(c.y) ? e.clientY - r.top - c.y : 0;
    setDrag({ id, kind, pointerId: e.pointerId, start: performance.now(), moved: false, free: false, ox, oy });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const r = svg.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const point = props.points.find((p) => p.id === drag.id);
    if (!point) return;
    const free = drag.moved ? drag.free : performance.now() - drag.start >= HOLD_FOR_FREE_MS;
    if (!drag.moved) setDrag({ ...drag, moved: true, free });
    if (drag.kind === "move") { const at = props.unproject(x - drag.ox, y - drag.oy); setGhost({ id: drag.id, x: at.x, y: at.y }); return; }
    const [c] = props.project([{ x: point.x, y: point.y }]);
    // smooth, follows the finger (用戶 2026-11-22：箭頭要能滑順調整)
    void free;
    setGhost({ id: drag.id, angle: Math.round(angleFromScreen(x - c.x, y - c.y) * 10) / 10 });
  };
  const endDrag = (e: ReactPointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (ghost?.id === drag.id) {
      if (drag.kind === "move" && ghost.x !== undefined && ghost.y !== undefined) props.onMove(drag.id, { x: ghost.x, y: ghost.y });
      if (drag.kind === "turn" && ghost.angle !== undefined) props.onTurn(drag.id, ghost.angle);
    }
    setDrag(null); setGhost(null);
  };

  if (!(props.ppu > 0)) return <svg ref={svg} className="photo-marker-layer" aria-hidden="true" />;
  return (
    <svg ref={svg} className={"photo-marker-layer" + (props.placing ? " placing" : "")} aria-label={t("camera.markersLabel")}
      onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {/* the selected point last, so its grips are on top of its neighbours */}
      {[...props.points].sort((a, b) => Number(a.id === props.selectedId) - Number(b.id === props.selectedId)).map((p) => {
        const g = ghost?.id === p.id ? ghost : null;
        const [c] = props.project([{ x: g?.x ?? p.x, y: g?.y ?? p.y }]);
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
        const angle = g?.angle ?? p.angle, selected = props.selectedId === p.id, isDone = !!props.done?.has(p.id);
        const label = props.labels.get(p.id) ?? String(p.no), k = screenMarkerScale(props.sheetWidth, props.ppu, props.scale ?? 1);
        return (
          <g key={p.id} data-photo-marker={p.id} className={selected ? "selected" : undefined}>
            {selected ? <circle cx={c.x} cy={c.y} r={MARKER_RADIUS_PX * k * 1.3 + 2} strokeWidth={Math.max(1, 3 * k)} className="photo-marker-ring" /> : null}
            {/* finger-sized grips (用戶 2026-11-22：箭頭在手機上移動困難): the circle and a margin around it moves it;
                on the selected point anywhere around the circle turns it (only there, so taps between points still
                add points while placing). Invisible; the drawn arrow and circle are unchanged. */}
            {selected && !props.placing ? <circle cx={c.x} cy={c.y} r={turnGripRadius(k)} className="photo-marker-grip photo-marker-turn"
              onPointerDown={(e) => begin(e, p.id, "turn")} /> : null}
            <path d={arrowPath(c.x, c.y, angle, k)} fill={MARKER_RED} className="photo-marker-arrow"
              onPointerDown={(e) => begin(e, p.id, "turn")} />
            <circle cx={c.x} cy={c.y} r={MARKER_RADIUS_PX * k} strokeWidth={markerLine(k)} className="photo-marker-circle" stroke={MARKER_RED} fill={isDone ? MARKER_DONE : "none"} />
            <circle cx={c.x} cy={c.y} r={props.placing ? Math.max(MARKER_RADIUS_PX * k + 2, 8) : moveGripRadius(k)} className="photo-marker-grip"
              onPointerDown={(e) => begin(e, p.id, "move")} />
            {markerFont(label, k) >= MIN_TEXT_PX ? <text x={c.x} y={c.y} className="photo-marker-text" fill={isDone ? "#fff" : MARKER_RED} fontSize={markerFont(label, k)}
              textAnchor="middle" dominantBaseline="central">{label}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
