// The electronic whiteboard (spec 009 定案 5/6), drawn like the white board held up in the user's site photos:
// a title line (工程名稱＋工種) and rows 施工項目 / 施工位置 / 施工日期 / 查驗人員 / 照片編號. The same function draws
// the live camera preview and the exported photo, so what is seen is what is saved.
import { drawPenSignature } from "./penInk";
import type { BoardFont, Signer, Whiteboard } from "./types";

/** height / width of the board */
export const BOARD_ASPECT = 0.68;
const FONT = '"FatCat Sans", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif';

/**
 * Handwriting for the values on the board (用戶 2026-11-23：「白板字體增加落雁體，並改為預設。增加字體切換，另一種是現在的
 * 黑體」): 辰宇落雁體 2.0 Thin, SIL OFL 1.1, bundled unmodified (public/fonts). Loaded on first use; a character the font
 * lacks falls back to 黑體.
 */
export const HAND_FONT = "Luoyan Hand";
const HAND_URL = "./fonts/ChenYuluoyan-2.0-Thin.ttf";
let handLoading: Promise<void> | null = null;
export function ensureHandFont(): Promise<void> {
  if (handLoading) return handLoading;
  handLoading = (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) return;
    try { const face = new FontFace(HAND_FONT, `url(${HAND_URL})`, { display: "swap" }); document.fonts.add(face); await face.load(); } catch { /* 黑體 then */ }
  })();
  return handLoading;
}

const FONT_KEY = "fatcat.camera.boardFont";
/** The board font chosen on this device; 落雁體 handwriting unless 黑體 was picked. */
export function loadBoardFont(): BoardFont {
  try { return localStorage.getItem(FONT_KEY) === "sans" ? "sans" : "hand"; } catch { return "hand"; }
}
export function saveBoardFont(f: BoardFont): void {
  try { localStorage.setItem(FONT_KEY, f); } catch { /* private mode */ }
}
// photos from before the choice have no font: they were shot with 黑體, so they keep it
const valueFont = (board: { font?: BoardFont }, px: number) =>
  board.font === "hand" ? `400 ${px * HAND_SCALE}px "${HAND_FONT}", ${FONT}` : `500 ${px * 1.05}px ${FONT}`;
// 落雁體 comes only in Thin and its glyphs sit small in the em box: at the 黑體 size the values read like pencil
// (2026-11-23 export check), so it is drawn larger and its strokes thickened like a whiteboard marker
const HAND_SCALE = 1.4, HAND_INK = 0.07;
function drawValue(ctx: CanvasRenderingContext2D, board: { font?: BoardFont }, s: string, x: number, y: number, px: number): void {
  ctx.fillText(s, x, y);
  if (board.font !== "hand") return;
  ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = px * HAND_INK; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeText(s, x, y); ctx.restore();
}

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
 * Aluminium frame of the board (see the note inside: drawn after real site-whiteboard photos). Fills the white surface
 * and returns the frame width in pixels.
 */
function aluminiumFrame(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }): number {
  // Drawn after real Taiwanese site whiteboards (用戶 2026-11-23：「鋁框要寫實的」「你的鋁框更假了...你去上網查真實照片」;
  // reference: WTB 銀鋁框工程白板 photos): a light matte silver profile with low contrast and a few fine grooves along it,
  // a thin dark line where it meets the white panel, and light-grey plastic L corner pieces with two screws each.
  const f = Math.max(2, r.w * 0.0233), { x, y, w, h } = r;
  ctx.save();
  // a faint shadow of the board on the photo (it stands against something)
  ctx.shadowColor = "rgba(0, 0, 0, 0.22)"; ctx.shadowBlur = f * 1.2; ctx.shadowOffsetX = f * 0.2; ctx.shadowOffsetY = f * 0.4;
  ctx.fillStyle = "#c9ccce"; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "#fbfbf8"; ctx.fillRect(x + f, y + f, w - f * 2, h - f * 2);
  // matte satin bars: lit sides a touch lighter, shaded sides a touch darker (low contrast, as in the photos)
  const side = (pts: [number, number][], fill: string) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill(); };
  side([[x, y], [x + w, y], [x + w - f, y + f], [x + f, y + f]], "#d9dcde");
  side([[x, y], [x + f, y + f], [x + f, y + h - f], [x, y + h]], "#d4d7d9");
  side([[x, y + h], [x + f, y + h - f], [x + w - f, y + h - f], [x + w, y + h]], "#c2c6c9");
  side([[x + w, y], [x + w, y + h], [x + w - f, y + h - f], [x + w - f, y + f]], "#c6cacd");
  // fine grooves along the profile: a dark line with a light line beside it, at about a third and two thirds across
  const groove = (o: number) => {
    const t = Math.max(0.5, f * 0.06);
    ctx.lineWidth = t;
    ctx.strokeStyle = "rgba(120, 126, 131, 0.55)";
    ctx.strokeRect(x + o, y + o, w - o * 2, h - o * 2);
    ctx.strokeStyle = "rgba(246, 247, 248, 0.7)";
    ctx.strokeRect(x + o + t, y + o + t, w - (o + t) * 2, h - (o + t) * 2);
  };
  groove(f * 0.3); groove(f * 0.62);
  // edges: a soft grey outline and a thin dark line where the frame meets the panel
  ctx.strokeStyle = "rgba(150, 155, 159, 0.9)"; ctx.lineWidth = Math.max(0.5, f * 0.06);
  ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.strokeStyle = "rgba(95, 100, 105, 0.75)"; ctx.lineWidth = Math.max(0.6, f * 0.09);
  ctx.strokeRect(x + f, y + f, w - f * 2, h - f * 2);
  // light-grey plastic L corner pieces, a little wider than the frame, two screws each
  const arm = f * 3.1, t = f * 1.35;
  const corner = (cx: number, cy: number, sx: number, sy: number) => {
    const pts: [number, number][] = [[cx, cy], [cx + sx * arm, cy], [cx + sx * arm, cy + sy * t], [cx + sx * t, cy + sy * t], [cx + sx * t, cy + sy * arm], [cx, cy + sy * arm]];
    const g = ctx.createLinearGradient(cx, cy, cx + sx * arm, cy + sy * arm);
    g.addColorStop(0, "#e9eaeb"); g.addColorStop(1, "#cfd1d3");
    ctx.fillStyle = g;
    // the outer corner is rounded, as on the real pieces
    const rad = t * 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + sx * rad, cy);
    pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
    ctx.lineTo(cx, cy + sy * rad);
    ctx.quadraticCurveTo(cx, cy, cx + sx * rad, cy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140, 145, 149, 0.9)"; ctx.lineWidth = Math.max(0.5, f * 0.07); ctx.stroke();
    for (const [px, py] of [[cx + sx * (arm - t * 0.62), cy + sy * t * 0.5], [cx + sx * t * 0.5, cy + sy * (arm - t * 0.62)]] as [number, number][]) {
      const s = t * 0.22;
      ctx.fillStyle = "#8d9296"; ctx.beginPath(); ctx.arc(px, py, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#dfe1e3"; ctx.beginPath(); ctx.arc(px - s * 0.25, py - s * 0.25, s * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  };
  corner(x, y, 1, 1); corner(x + w, y, -1, 1); corner(x, y + h, 1, -1); corner(x + w, y + h, -1, -1);
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
    else { ctx.fillStyle = "#0a0a78"; ctx.font = valueFont(board, px); drawValue(ctx, board, fit(ctx, row.value, vw), vx, cy, px); }
  });
  ctx.restore();
}

/** 工程名稱 + 工種, as on the board title ("PARK 23 水電工程"). */
export const boardTitle = (project: string, trade: string): string => [project, trade].map((s) => s.trim()).filter(Boolean).join(" ");
