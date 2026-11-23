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

/** Draw the board on a picture of w × h pixels. */
export function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, board: Whiteboard, text: BoardText, signer?: Signer | null): void {
  const r = boardRect(board, w, h);
  const pad = r.w * 0.045, line = Math.max(1, r.w * 0.004);
  ctx.save();
  ctx.fillStyle = "#fbfbf8";
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = line * 2;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
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
