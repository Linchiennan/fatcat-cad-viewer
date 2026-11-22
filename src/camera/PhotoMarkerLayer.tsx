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
const HOLD_FOR_FREE_MS = 450;

type Props = {
  points: readonly ShotPoint[];
  /** text in each circle by point id ("21" / "21x2") */
  labels: ReadonlyMap<string, string>;
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
};

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
 * The arrow of the example block 「對位箭頭」 (measured in ZWCAD, 8F-室內隔間對位圖.dwg): the triangle with its tip at
 * r·√2 in the shot direction and its base through the centre (base corners r·√2 to each side), minus the circle. Its
 * sides touch the circle at ±45°, so it is three pieces: the tip, and a fin on each side between the tangent point,
 * the base corner and the circle. Each piece starts with a point it can be fanned from (tip, base corners).
 */
export function wedgePieces(cx: number, cy: number, dx: number, dy: number, r: number, segments = 12): { x: number; y: number }[][] {
  const a = Math.atan2(dy, dx), at = (t: number, k: number) => ({ x: cx + Math.cos(t) * r * k, y: cy + Math.sin(t) * r * k });
  const arc = (from: number, to: number, n: number) => Array.from({ length: n + 1 }, (_, i) => at(from + ((to - from) * i) / n, 1));
  const q = Math.PI / 4, half = Math.max(2, Math.round(segments / 2));
  return [
    [at(a, Math.SQRT2), ...arc(a + q, a - q, segments)],
    [at(a + 2 * q, Math.SQRT2), ...arc(a + 2 * q, a + q, half)],
    [at(a - 2 * q, Math.SQRT2), ...arc(a - 2 * q, a - q, half)],
  ];
}

/** The arrow on screen as an SVG path `d` string (three closed pieces). */
export function arrowPath(cx: number, cy: number, angle: number, scale = 1): string {
  const d = screenDirection(angle);
  return wedgePieces(cx, cy, d.x, d.y, MARKER_RADIUS_PX * scale)
    .map((piece) => piece.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("") + "Z").join("");
}

type Drag = { id: string; kind: "move" | "turn"; pointerId: number; start: number; moved: boolean; free: boolean };

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
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    props.onSelect(id);
    setDrag({ id, kind, pointerId: e.pointerId, start: performance.now(), moved: false, free: false });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const r = svg.current!.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const point = props.points.find((p) => p.id === drag.id);
    if (!point) return;
    const free = drag.moved ? drag.free : performance.now() - drag.start >= HOLD_FOR_FREE_MS;
    if (!drag.moved) setDrag({ ...drag, moved: true, free });
    if (drag.kind === "move") { const at = props.unproject(x, y); setGhost({ id: drag.id, x: at.x, y: at.y }); return; }
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
      {props.points.map((p) => {
        const g = ghost?.id === p.id ? ghost : null;
        const [c] = props.project([{ x: g?.x ?? p.x, y: g?.y ?? p.y }]);
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return null;
        const angle = g?.angle ?? p.angle, selected = props.selectedId === p.id;
        const label = props.labels.get(p.id) ?? String(p.no), k = props.scale ?? 1;
        return (
          <g key={p.id} data-photo-marker={p.id} className={selected ? "selected" : undefined}>
            {selected ? <circle cx={c.x} cy={c.y} r={MARKER_RADIUS_PX * k + 6} className="photo-marker-ring" /> : null}
            <path d={arrowPath(c.x, c.y, angle, k)} fill={MARKER_RED} className="photo-marker-arrow"
              onPointerDown={(e) => begin(e, p.id, "turn")} />
            <circle cx={c.x} cy={c.y} r={MARKER_RADIUS_PX * k} strokeWidth={1.4 * Math.max(0.7, k)} className="photo-marker-circle" stroke={MARKER_RED}
              onPointerDown={(e) => begin(e, p.id, "move")} />
            <text x={c.x} y={c.y} className="photo-marker-text" fill={MARKER_RED} fontSize={(label.length > 3 ? 10.5 : label.length > 2 ? 13 : 16) * k}
              textAnchor="middle" dominantBaseline="central">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}
