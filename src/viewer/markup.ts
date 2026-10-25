// Red-pen markups on a drawing, kept in drawing coordinates so they stay on the drawing while
// panning and zooming. Saved per drawing and sheet in this device only; never uploaded.
import type { DrawingPoint } from "./savedView";

/** pen: freehand; line / arrow: one straight segment (drag end to end, the arrow points at the end);
 * rect / circle / ellipse: drag a box (circle keeps it square). */
/** "none": markup mode with no tool picked (the default) — the drawing pans and zooms as in plain viewing. */
export type MarkTool = "none" | "pen" | "line" | "arrow" | "rect" | "circle" | "ellipse" | "text" | "mtext" | "move";
export type Mark =
  | { kind: "pen"; color: string; points: DrawingPoint[] }
  | { kind: "rect"; color: string; points: [DrawingPoint, DrawingPoint] }
  | { kind: "circle"; color: string; points: [DrawingPoint, DrawingPoint] } // ellipse inside the box (a circle when square)
  | { kind: "arrow"; color: string; points: [DrawingPoint, DrawingPoint] } // head at the second point
  // size in drawing units; width (drawing units) only for a 多行 text box: lines wrap to it.
  | { kind: "text"; color: string; at: DrawingPoint; text: string; size: number; width?: number };

// Nine colours, shown three at a time (swipe the strip for the next three).
export const MARK_COLORS = [
  { name: "紅", value: "#ff3b30" },
  { name: "綠", value: "#34c759" },
  { name: "藍", value: "#0a84ff" },
  { name: "黃", value: "#ffd60a" },
  { name: "橘", value: "#ff9500" },
  { name: "紫", value: "#af52de" },
  { name: "粉紅", value: "#ff6fae" },
  { name: "白", value: "#ffffff" },
  { name: "黑", value: "#1c1c1e" },
] as const;
export const PEN_PX = 3;
export const ARROW_HEAD_PX = 16;

/** The two short strokes of an arrow head at `b`, pointing from `a` (screen pixels). */
export function arrowHead(a: DrawingPoint, b: DrawingPoint, size = ARROW_HEAD_PX): [DrawingPoint, DrawingPoint] {
  const ang = Math.atan2(b.y - a.y, b.x - a.x), spread = Math.PI / 7;
  return [
    { x: b.x - size * Math.cos(ang - spread), y: b.y - size * Math.sin(ang - spread) },
    { x: b.x - size * Math.cos(ang + spread), y: b.y - size * Math.sin(ang + spread) },
  ];
}

/** A box dragged from `a` to `b` made square (same width and height, toward the drag). */
export function squareBox(a: DrawingPoint, b: DrawingPoint): [DrawingPoint, DrawingPoint] {
  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return [a, { x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side }];
}
export const TEXT_PX = 18;
/** Text markup size range in screen pixels at the zoom it was written (the size control's limits). */
export const TEXT_PX_MIN = 8;
export const TEXT_PX_MAX = 96;
const TEXT_PX_KEY = "fatcat:markup-text-px";
export const clampTextPx = (n: number) => Math.round(Math.min(TEXT_PX_MAX, Math.max(TEXT_PX_MIN, Number.isFinite(n) ? n : TEXT_PX)));
/** The size last used for a text markup on this device (default 18 px). */
export function loadTextPx(): number {
  try { const n = Number(localStorage.getItem(TEXT_PX_KEY)); return n > 0 ? clampTextPx(n) : TEXT_PX; } catch { return TEXT_PX; }
}
export function saveTextPx(n: number): void {
  try { localStorage.setItem(TEXT_PX_KEY, String(clampTextPx(n))); } catch { /* private mode: this visit only */ }
}
export const TEXT_FONT = '"Noto Sans CJK TC","Noto Sans TC",sans-serif';
/** Line spacing of multi-line text, in font sizes. */
export const TEXT_LINE_GAP = 1.25;
let measureCtx: CanvasRenderingContext2D | null | undefined;
/**
 * The lines a text markup is drawn in: its own line breaks, and when it has a box width, wrapped
 * character by character so no line is wider than the box (Chinese has no spaces to break at).
 */
export function textLines(text: string, fontPx: number, widthPx?: number): string[] {
  const paras = text.split("\n");
  if (!widthPx || widthPx <= 0) return paras;
  if (measureCtx === undefined) {
    try { measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null; } catch { measureCtx = null; }
  }
  const ctx = measureCtx;
  if (ctx) ctx.font = `bold ${fontPx}px ${TEXT_FONT}`;
  const width = (s: string) => (ctx ? ctx.measureText(s).width : [...s].length * fontPx);
  const out: string[] = [];
  for (const para of paras) {
    let line = "";
    for (const ch of para) {
      if (line && width(line + ch) > widthPx) { out.push(line); line = ch; } else line += ch;
    }
    out.push(line);
  }
  return out;
}

const storageKey = (viewKey: string) => viewKey + ":markup";

export function loadMarks(viewKey: string): Mark[] {
  try {
    const raw = localStorage.getItem(storageKey(viewKey));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isMark) : [];
  } catch { return []; }
}

export function saveMarks(viewKey: string, marks: readonly Mark[]): boolean {
  try {
    if (marks.length) localStorage.setItem(storageKey(viewKey), JSON.stringify(marks));
    else localStorage.removeItem(storageKey(viewKey));
    return true;
  } catch { return false; }
}

const isPoint = (p: unknown): p is DrawingPoint => !!p && Number.isFinite((p as DrawingPoint).x) && Number.isFinite((p as DrawingPoint).y);
function isMark(m: unknown): m is Mark {
  const x = m as Mark;
  if (!x || typeof x.color !== "string") return false;
  if (x.kind === "pen") return Array.isArray(x.points) && x.points.length > 1 && x.points.every(isPoint);
  if (x.kind === "rect" || x.kind === "circle" || x.kind === "arrow") return Array.isArray(x.points) && x.points.length === 2 && x.points.every(isPoint);
  if (x.kind === "text") return isPoint(x.at) && typeof x.text === "string" && x.text.length > 0 && x.size > 0 && (x.width === undefined || x.width > 0);
  return false;
}

/** Drop freehand points closer than `minUnits` to the previous kept one (keeps the last point). */
export function thinStroke(points: readonly DrawingPoint[], minUnits: number): DrawingPoint[] {
  const out: DrawingPoint[] = [];
  for (const p of points) {
    const q = out.at(-1);
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) >= minUnits) out.push(p);
  }
  const last = points.at(-1);
  if (last && out.at(-1) !== last) out.push(last);
  return out;
}

type Project = (points: readonly DrawingPoint[]) => DrawingPoint[];

/** Draw marks onto a 2D canvas whose pixels are `scale` times the screen pixels. */
export function paintMarks(ctx: CanvasRenderingContext2D, marks: readonly Mark[], project: Project, ppu: number, scale: number): void {
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const m of marks) {
    ctx.strokeStyle = m.color; ctx.fillStyle = m.color; ctx.lineWidth = PEN_PX * scale;
    if (m.kind === "text") {
      const [p] = project([m.at]);
      const px = Math.max(6, m.size * ppu) * scale;
      const lines = textLines(m.text, px, m.width ? m.width * ppu * scale : undefined);
      ctx.font = `bold ${px}px ${TEXT_FONT}`;
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(2, px / 6); ctx.strokeStyle = "rgba(0,0,0,0.75)";
      lines.forEach((line, k) => {
        const y = p.y * scale + k * px * TEXT_LINE_GAP;
        ctx.strokeText(line, p.x * scale, y);
        ctx.fillText(line, p.x * scale, y);
      });
      continue;
    }
    const pts = project(m.points);
    ctx.beginPath();
    if (m.kind === "rect") {
      const [a, b] = pts;
      ctx.rect(Math.min(a.x, b.x) * scale, Math.min(a.y, b.y) * scale, Math.abs(b.x - a.x) * scale, Math.abs(b.y - a.y) * scale);
    } else if (m.kind === "arrow") {
      const [a, b] = pts, [l, r] = arrowHead(a, b, ARROW_HEAD_PX);
      ctx.moveTo(a.x * scale, a.y * scale); ctx.lineTo(b.x * scale, b.y * scale);
      ctx.moveTo(l.x * scale, l.y * scale); ctx.lineTo(b.x * scale, b.y * scale); ctx.lineTo(r.x * scale, r.y * scale);
    } else if (m.kind === "circle") {
      const [a, b] = pts;
      ctx.ellipse((a.x + b.x) / 2 * scale, (a.y + b.y) / 2 * scale, Math.abs(b.x - a.x) / 2 * scale, Math.abs(b.y - a.y) / 2 * scale, 0, 0, Math.PI * 2);
    } else pts.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
    ctx.stroke();
  }
  ctx.restore();
}

/** File name for a shared markup picture: 標註_<drawing>_<yyyymmdd-hhmm>.png */
export function shareFileName(drawingName: string, when = new Date()): string {
  const base = drawingName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `標註_${base}_${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}.png`;
}
