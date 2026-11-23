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
  const f = Math.max(3, r.w * 0.035), { x, y, w, h } = r;
  ctx.save();
  // soft shadow under the whole board
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)"; ctx.shadowBlur = f * 1.6; ctx.shadowOffsetX = f * 0.25; ctx.shadowOffsetY = f * 0.5;
  ctx.fillStyle = "#a9aeb3"; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  // white surface
  ctx.fillStyle = "#fbfbf8"; ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
  const bar = (pts: [number, number][], from: [number, number], to: [number, number], stops: [number, string][]) => {
    const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill();
  };
  const lit: [number, string][] = [[0, "#f4f6f8"], [0.45, "#d3d8dc"], [1, "#a3a9ae"]];
  const shade: [number, string][] = [[0, "#c5cace"], [0.5, "#9ea4a9"], [1, "#7d8388"]];
  bar([[x, y], [x + w, y], [x + w - f, y + f], [x + f, y + f]], [0, y], [0, y + f], lit);                 // top
  bar([[x, y], [x + f, y + f], [x + f, y + h - f], [x, y + h]], [x, 0], [x + f, 0], lit);                 // left
  bar([[x, y + h], [x + f, y + h - f], [x + w - f, y + h - f], [x + w, y + h]], [0, y + h - f], [0, y + h], shade.slice().reverse() as [number, string][]); // bottom
  bar([[x + w, y], [x + w, y + h], [x + w - f, y + h - f], [x + w - f, y + f]], [x + w - f, 0], [x + w, 0], shade.slice().reverse() as [number, string][]); // right
  // brushed grain along the bars
  ctx.globalAlpha = 0.18; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(0.5, f * 0.05);
  for (let k = 1; k < 4; k++) {
    const o = (f * k) / 4;
    ctx.beginPath();
    ctx.moveTo(x + o, y + o); ctx.lineTo(x + w - o, y + o);
    ctx.moveTo(x + o, y + o); ctx.lineTo(x + o, y + h - o);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // edges: a dark outline outside, a thin shadow where the frame meets the surface
  ctx.strokeStyle = "rgba(40, 44, 48, 0.85)"; ctx.lineWidth = Math.max(1, f * 0.08);
  ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.28)"; ctx.lineWidth = Math.max(1, f * 0.12);
  ctx.strokeRect(x + f, y + f, w - f * 2, h - f * 2);
  // grey plastic corner caps
  const cap = f * 1.5;
  for (const [cx, cy] of [[x, y], [x + w - cap, y], [x, y + h - cap], [x + w - cap, y + h - cap]] as [number, number][]) {
    const g = ctx.createLinearGradient(cx, cy, cx + cap, cy + cap);
    g.addColorStop(0, "#8b9096"); g.addColorStop(1, "#4f5459");
    ctx.fillStyle = g;
    ctx.beginPath();
    const round = (ctx as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect;
    if (typeof round === "function") round.call(ctx, cx, cy, cap, cap, cap * 0.3);
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
  if (wide > room) ctx.font = `700 ${Math.max(titlePx * 0.6, (titlePx * room) / wide)}px ${FONT}`;
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
