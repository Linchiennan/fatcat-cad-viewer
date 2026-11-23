// The electronic whiteboard (spec 009 定案 5/6), drawn like the white board held up in the user's site photos:
// a title line (工程名稱＋工種) and rows 施工項目 / 施工位置 / 施工日期 / 查驗人員 / 照片編號. The same function draws
// the live camera preview and the exported photo, so what is seen is what is saved.
import { drawPenSignature } from "./penInk";
import type { Signer, Whiteboard } from "./types";

/** height / width of the board */
export const BOARD_ASPECT = 0.68;
const FONT = '"FatCat Sans", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif';

export type BoardText = { title: string; no: string };
export type BoardRow = { label: string; value: string; signature?: Signer };

export function boardRows(board: Whiteboard, text: BoardText, signer?: Signer | null): BoardRow[] {
  return [
    { label: "施工項目", value: board.item },
    { label: "施工位置", value: board.place },
    { label: "施工日期", value: board.date },
    { label: "查驗人員", value: board.inspector, ...(signer ? { signature: signer } : {}) },
    { label: "照片編號", value: text.no },
  ];
}

/** Board rectangle in pixels of a picture w × h; kept inside the picture. */
export function boardRect(board: Pick<Whiteboard, "x" | "y" | "width">, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const bw = Math.min(Math.max(board.width, 0.12), 0.9) * w;
  const bh = Math.min(bw * BOARD_ASPECT, h * 0.95);
  const x = Math.min(Math.max(board.x * w, 0), w - bw);
  const y = Math.min(Math.max(board.y * h, 0), h - bh);
  return { x, y, w: bw, h: bh };
}

/** Longest text that fits `max` pixels, with an ellipsis when cut. */
function fit(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

/** Ink of a signature inside a box (the strokes keep their own aspect, centred and left-aligned). */
export function drawSignature(ctx: CanvasRenderingContext2D, signer: Signer, x: number, y: number, w: number, h: number): void {
  const sw = Math.min(w, h * signer.aspect), sh = sw / signer.aspect;
  const ox = x, oy = y + (h - sh) / 2;
  // fountain-pen ink (用戶 2026-11-23：「電子簽名的筆觸改成鋼筆」), as on the signature pad
  drawPenSignature(ctx, signer.strokes, ox, oy, sw, sh, Math.max(1.6, sh * 0.075));
}

/**
 * Aluminium frame of the board: four bevelled bars lit from the top left (light top/left, darker bottom/right) with a
 * fine brushed grain, grey plastic corner caps, a soft shadow under the board and a thin shadow line on the white surface.
 * Fills the white surface and returns the frame width in pixels.
 */
function aluminiumFrame(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }): number {
  // 用戶 2026-11-23：「鋁框要寫實的，邊框再瘦1/3」— 2.3 % of the board width (was 3.5 %), a rounded anodised profile
  const f = Math.max(2, r.w * 0.0233), { x, y, w, h } = r;
  ctx.save();
  // soft shadow of the whole board on the photo
  ctx.shadowColor = "rgba(0, 0, 0, 0.32)"; ctx.shadowBlur = f * 2.2; ctx.shadowOffsetX = f * 0.35; ctx.shadowOffsetY = f * 0.7;
  ctx.fillStyle = "#9aa1a7"; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  // white surface, with the frame's shadow falling on it along the top and left
  ctx.fillStyle = "#fbfbf8"; ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
  const lip = f * 0.9;
  let g = ctx.createLinearGradient(0, y + f, 0, y + f + lip);
  g.addColorStop(0, "rgba(0, 0, 0, 0.16)"); g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g; ctx.fillRect(x + f, y + f, w - f * 2, lip);
  g = ctx.createLinearGradient(x + f, 0, x + f + lip, 0);
  g.addColorStop(0, "rgba(0, 0, 0, 0.12)"); g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g; ctx.fillRect(x + f, y + f, lip, h - f * 2);
  // a rounded profile across the bar, outer edge → inner lip: dark rim, narrow highlight, satin face, darker lip.
  // The lit sides (top, left) are brighter than the shaded ones (bottom, right).
  const profile = (lit: boolean): [number, string][] => lit
    ? [[0, "#7c838a"], [0.12, "#c9ced3"], [0.26, "#fbfcfd"], [0.4, "#e3e7ea"], [0.72, "#c3c9ce"], [0.9, "#9ba2a8"], [1, "#6c737a"]]
    : [[0, "#5f666d"], [0.12, "#9fa6ac"], [0.26, "#d5dade"], [0.4, "#b9bfc4"], [0.72, "#9da4aa"], [0.9, "#7f868c"], [1, "#565d64"]];
  const bar = (pts: [number, number][], from: [number, number], to: [number, number], lit: boolean) => {
    const gr = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
    for (const [o, c] of profile(lit)) gr.addColorStop(o, c);
    ctx.fillStyle = gr;
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
  };
  bar([[x, y], [x + w, y], [x + w - f, y + f], [x + f, y + f]], [0, y], [0, y + f], true);                     // top: outer → inner
  bar([[x, y], [x + f, y + f], [x + f, y + h - f], [x, y + h]], [x, 0], [x + f, 0], true);                     // left
  bar([[x, y + h], [x + f, y + h - f], [x + w - f, y + h - f], [x + w, y + h]], [0, y + h], [0, y + h - f], false); // bottom
  bar([[x + w, y], [x + w, y + h], [x + w - f, y + h - f], [x + w - f, y + f]], [x + w, 0], [x + w - f, 0], false); // right
  // brushed grain: fine, uneven streaks along each bar (seeded, the same on every photo)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.lineWidth = Math.max(0.4, f * 0.035);
  for (let k = 0; k < 14; k++) {
    const o = f * (0.15 + rnd() * 0.7), a = 0.05 + rnd() * 0.1, light = rnd() > 0.4;
    ctx.strokeStyle = light ? `rgba(255, 255, 255, ${a})` : `rgba(40, 45, 50, ${a})`;
    const s0 = rnd() * 0.3, s1 = 0.7 + rnd() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + w * s0, y + o); ctx.lineTo(x + w * s1, y + o);                 // top
    ctx.moveTo(x + w * s0, y + h - o); ctx.lineTo(x + w * s1, y + h - o);         // bottom
    ctx.moveTo(x + o, y + h * s0); ctx.lineTo(x + o, y + h * s1);                 // left
    ctx.moveTo(x + w - o, y + h * s0); ctx.lineTo(x + w - o, y + h * s1);         // right
    ctx.stroke();
  }
  // mitred joints at the corners
  ctx.strokeStyle = "rgba(30, 34, 38, 0.55)"; ctx.lineWidth = Math.max(0.5, f * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + f, y + f); ctx.moveTo(x + w, y); ctx.lineTo(x + w - f, y + f);
  ctx.moveTo(x, y + h); ctx.lineTo(x + f, y + h - f); ctx.moveTo(x + w, y + h); ctx.lineTo(x + w - f, y + h - f);
  ctx.stroke();
  // crisp outer edge
  ctx.strokeStyle = "rgba(35, 39, 43, 0.8)"; ctx.lineWidth = Math.max(0.6, f * 0.07);
  ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  // small dark-grey plastic corner caps, a touch of shine on the lit corner
  const cap = f * 1.3;
  for (const [cx, cy] of [[x, y], [x + w - cap, y], [x, y + h - cap], [x + w - cap, y + h - cap]] as [number, number][]) {
    const cg = ctx.createRadialGradient(cx + cap * 0.35, cy + cap * 0.3, cap * 0.05, cx + cap / 2, cy + cap / 2, cap * 0.75);
    cg.addColorStop(0, "#6e747a"); cg.addColorStop(0.6, "#3f4449"); cg.addColorStop(1, "#2a2e32");
    ctx.fillStyle = cg;
    ctx.beginPath();
    const round = (ctx as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
    if (typeof round === "function") round.call(ctx, cx, cy, cap, cap, cap * 0.32);
    else ctx.rect(cx, cy, cap, cap);
    ctx.fill();
  }
  ctx.restore();
  return f;
}

/** Draw the board on a picture of w × h pixels. */
export function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, board: Whiteboard, text: BoardText, signer?: Signer | null): void {
  const outer = boardRect(board, w, h);
  // aluminium frame round a white surface, like a real site whiteboard (用戶 2026-11-23：「電子白板的邊框增加真實白板的鋁框
  // 的效果」); the writing sits on the surface inside it
  const frame = aluminiumFrame(ctx, outer);
  const r = { x: outer.x + frame, y: outer.y + frame, w: outer.w - frame * 2, h: outer.h - frame * 2 };
  const pad = r.w * 0.045, line = Math.max(1, r.w * 0.004);
  ctx.save();
  const titlePx = r.h * 0.1;
  ctx.fillStyle = "#111";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // a long project name shrinks to fit (down to 60 %) before it is cut
  ctx.font = `700 ${titlePx}px ${FONT}`;
  const room = r.w - pad * 2, wide = ctx.measureText(text.title).width;
  // shrink to 97 % of the room, not exactly 100 %: at exactly the room the measured width rounds a hair over and the
  // title was cut to "…水電…" (export, 2026-11-23)
  if (wide > room) ctx.font = `700 ${Math.max(titlePx * 0.6, (titlePx * room * 0.97) / wide)}px ${FONT}`;
  ctx.fillText(fit(ctx, text.title, room), r.x + r.w / 2, r.y + r.h * 0.12);
  const rows = boardRows(board, text, signer);
  const top = r.y + r.h * 0.24, rowH = (r.h * 0.72) / rows.length, labelW = r.w * 0.3;
  const px = rowH * 0.5;
  rows.forEach((row, i) => {
    const cy = top + rowH * i + rowH / 2;
    ctx.strokeStyle = "#b5b5b5"; ctx.lineWidth = line;
    ctx.beginPath(); ctx.moveTo(r.x + pad, top + rowH * (i + 1)); ctx.lineTo(r.x + r.w - pad, top + rowH * (i + 1)); ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#444"; ctx.font = `${px}px ${FONT}`;
    ctx.fillText(row.label + "：", r.x + pad, cy);
    const vx = r.x + pad + labelW, vw = r.w - pad * 2 - labelW;
    if (row.signature) drawSignature(ctx, row.signature, vx, cy - rowH * 0.45, vw, rowH * 0.9);
    else { ctx.fillStyle = "#0a0a78"; ctx.font = `500 ${px * 1.05}px ${FONT}`; ctx.fillText(fit(ctx, row.value, vw), vx, cy); }
  });
  ctx.restore();
}

/** 工程名稱 + 工種, as on the board title ("PARK 23 水電工程"). */
export const boardTitle = (project: string, trade: string): string => [project, trade].map((s) => s.trim()).filter(Boolean).join(" ");
