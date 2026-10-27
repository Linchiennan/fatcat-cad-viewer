// The strand of brown wool along the top of the paw bar (用戶 2026-10-27：毛線要真實、有毛邊、沿著底下按鈕的形狀貼合).
// It rests on the bar's upper outline: the buttons' rounded tops, the ears and the paw's toes, read from the DOM, and
// droops a little across each gap. scripts/make-yarn.py draws the wool (src/assets/yarn.png, 600 x 20 CSS px at 3x);
// here it is bent along that line slice by slice on a canvas that never takes clicks.
import { useLayoutEffect, useRef } from "react";
import yarnUrl from "../assets/yarn.png";

const ABOVE = 48, BELOW = 30;        // canvas reach above / below the bar's top edge (CSS px)
const TILE_W = 600, TILE_H = 20, PX = 3;
const DRAW_H = 13;                   // drawn height of the 20 px tile: a fine wool strand, not a rope (core ≈ 5 px)
const LIFT = 7;                      // the strand floats this far above the outline: clear of the buttons (用戶：不要緊貼、吃到按鈕)
const PAW_ROOM = 10, PAW_DROP = 5;   // room round the paw's toes (sides included); net 5 px more than LIFT above them
const SAG = 3.5;                     // droop across a gap between buttons
const MID_SAG = 5;                   // droop of the span between the paw's two top toes
const CORNER = 14;                   // the buttons' border radius

let yarn: HTMLImageElement | null = null;
const waiting = new Set<() => void>();
function yarnImage(onLoad: () => void): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (!yarn) {
    yarn = new Image();
    yarn.onload = () => { for (const f of waiting) f(); waiting.clear(); };
    yarn.src = yarnUrl;
  }
  if (yarn.complete && yarn.naturalWidth) return yarn;
  waiting.add(onLoad);
  return null;
}

/** Highest outline point per CSS px column of the bar (bar coordinates, y down from the bar's top edge). */
function outline(bar: HTMLElement): { top: Float64Array; width: number; paw: [number, number] | null } {
  // Measure the buttons at rest: a pressed button shrinks a little (:active scale), and pressing one re-renders the bar,
  // so the strand followed the shrunk button (用戶：按貓耳按鈕會影響毛線). The class is removed before anything paints.
  bar.classList.add("yarn-measure");
  try { return measure(bar); } finally { bar.classList.remove("yarn-measure"); }
}

function measure(bar: HTMLElement): { top: Float64Array; width: number; paw: [number, number] | null } {
  const box = bar.getBoundingClientRect(), width = bar.offsetWidth;
  const zoom = width ? box.width / width : 1;
  const top = new Float64Array(width + 1).fill(Infinity);
  const put = (cx: number, cy: number) => {
    const x = Math.round((cx - box.left) / zoom), y = (cy - box.top) / zoom;
    if (x >= 0 && x <= width && y < top[x]) top[x] = y;
  };
  for (const btn of Array.from(bar.querySelectorAll<HTMLElement>(":scope > .glove-btn"))) {
    if (!btn.classList.contains("glove-paw")) {
      const r = btn.getBoundingClientRect(), rad = CORNER * zoom;
      for (let cx = r.left; cx <= r.right; cx += zoom) {
        const d = Math.min(cx - r.left, r.right - cx);
        put(cx, r.top + (d < rad ? rad - Math.sqrt(Math.max(0, rad * rad - (rad - d) ** 2)) : 0));
      }
    }
    for (const el of Array.from(btn.querySelectorAll<SVGGeometryElement>(".glove-ears path, .glove-paw path, .glove-paw ellipse"))) {
      const m = el.getScreenCTM(), paw = !!el.closest(".glove-paw");
      if (!m || typeof el.getTotalLength !== "function") continue;
      const len = el.getTotalLength(), steps = Math.max(24, Math.ceil(len * Math.hypot(m.a, m.b) * 1.5));
      for (let i = 0; i <= steps; i++) {
        const p = el.getPointAtLength((len * i) / steps), q = new DOMPoint(p.x, p.y).matrixTransform(m);
        if (!paw) { put(q.x, q.y); continue; }
        // The paw gets a ring of room on every side, not only above: each point stands for a disc of PAW_ROOM px
        // (用戶：中間貓爪的毛線再擴大一點，是左右碰到). Lowered by PAW_DROP so the room above stays as it was.
        for (let dx = -PAW_ROOM; dx <= PAW_ROOM; dx++)
          put(q.x + dx * zoom, q.y - (Math.sqrt(PAW_ROOM * PAW_ROOM - dx * dx) - PAW_DROP) * zoom);
      }
    }
  }
  const p = bar.querySelector<HTMLElement>(":scope > .glove-paw")?.getBoundingClientRect();
  const paw: [number, number] | null = p ? [Math.round((p.left - box.left) / zoom), Math.round((p.right - box.left) / zoom)] : null;
  return { top, width, paw };
}

/** Where the strand's centre runs: resting on the outline, bridging gaps with a little droop, never inside a shape. */
export function strandLine(top: Float64Array, paw: [number, number] | null = null): Float64Array {
  const n = top.length, base = new Float64Array(n), sag = new Float64Array(n);
  const known = [...top.keys()].filter((i) => Number.isFinite(top[i]));
  if (!known.length) return base.fill(-LIFT);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(top[i])) { base[i] = top[i]; continue; }
    const a = [...known].reverse().find((k) => k < i), b = known.find((k) => k > i);
    if (a === undefined) base[i] = top[b!];
    else if (b === undefined) base[i] = top[a];
    else { const t = (i - a) / (b - a); base[i] = top[a] + (top[b] - top[a]) * t; sag[i] = SAG * Math.sin(Math.PI * t); }
  }
  // A strand does not dip into narrow notches (between the paw's toes, the cleft between the ears): close every dip
  // narrower than 2 x BRIDGE px (a morphological closing of the outline seen as a height), then droop over real gaps.
  const BRIDGE = 9;
  const up = new Float64Array(n), closed = new Float64Array(n);
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = Math.max(0, i - BRIDGE); j <= Math.min(n - 1, i + BRIDGE); j++) m = Math.min(m, base[j]); up[i] = m; }
  for (let i = 0; i < n; i++) { let m = -Infinity; for (let j = Math.max(0, i - BRIDGE); j <= Math.min(n - 1, i + BRIDGE); j++) m = Math.max(m, up[j]); closed[i] = m; }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = closed[i] - LIFT + (closed[i] === base[i] ? sag[i] : 0);
  // a little stiffness: smooth, then never let the smoothing push the strand into a button
  const out = new Float64Array(n), k = 4;
  for (let i = 0; i < n; i++) {
    let s = 0, w = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) { const g = 1 - Math.abs(j - i) / (k + 1); s += y[j] * g; w += g; }
    out[i] = Math.min(s / w, Number.isFinite(top[i]) ? top[i] - LIFT : Infinity);
  }
  // Over the paw the strand spans its top toes; let it hang a little in the middle (用戶：正中間的毛線要有點下垂).
  // It droops into the room kept round the toes, so it still does not touch them.
  if (paw) {
    // between the two top toes: their centres sit at 32.9 % and 67.1 % of the paw cell (PawShape: toes at 35 / 65 of a
    // drawing 114 % wide, from -7 %); the strand hangs lowest half-way between them
    const w = paw[1] - paw[0], a = Math.round(paw[0] + 0.329 * w), b = Math.round(paw[0] + 0.671 * w);
    for (let i = Math.max(0, a); i <= Math.min(n - 1, b); i++) out[i] += MID_SAG * Math.sin((Math.PI * (i - a)) / (b - a));
  }
  return out;
}

export function YarnLine() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = canvas.current, bar = c?.parentElement;
    // Test pages (jsdom) have no layout to rest on: the strand is simply not drawn.
    if (!c || !bar || typeof ResizeObserver === "undefined" || typeof requestAnimationFrame === "undefined") return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const img = yarnImage(schedule);
      const ctx = c.getContext("2d");
      if (!img || !ctx) return;
      const { top, width, paw } = outline(bar);
      if (!width) return;
      const box = bar.getBoundingClientRect(), zoom = box.width / width || 1;
      const scale = (window.devicePixelRatio || 1) * zoom, h = ABOVE + BELOW;
      c.width = Math.round(width * scale); c.height = Math.round(h * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, width, h);
      const line = strandLine(top, paw);
      let s = 0;
      for (let x = 0; x < width; x++) {
        const y0 = line[x] + ABOVE, y1 = line[x + 1] + ABOVE, len = Math.hypot(1, y1 - y0);
        // the tile is scaled to DRAW_H, so it advances DRAW_H / TILE_H source px per drawn px
        const k = TILE_H / DRAW_H, src = ((s * k) % TILE_W) * PX, srcW = Math.min(len * k * PX, TILE_W * PX - src);
        ctx.save();
        ctx.translate(x, y0);
        ctx.rotate(Math.atan2(y1 - y0, 1));
        ctx.drawImage(img, src, 0, Math.max(1, srcW), TILE_H * PX, 0, -DRAW_H / 2, len + 0.6, DRAW_H);
        ctx.restore();
        s += len;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const watch = new ResizeObserver(schedule);
    watch.observe(bar);
    for (const btn of Array.from(bar.children)) watch.observe(btn);
    schedule();
    return () => { watch.disconnect(); if (frame) cancelAnimationFrame(frame); };
  });
  return <canvas className="glove-yarn" ref={canvas} aria-hidden="true" />;
}
