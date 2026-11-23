// Colours for a drawing put on white paper (用戶 2026-11-23：「輸出的對位圖，背景要改成白色，黃色改成橘色」): the screen is
// dark, so white lines (ACI 7) turn black, and yellows (ACI 2, 40–59), which are lost on white, turn orange (ACI 30),
// as in the white-background recordings (memory: 白底黃改橘). Everything else keeps its colour.

export const PAPER_BACKGROUND = 0xffffff;
export const PAPER_ORANGE = 0xff7f00; // ACI 30

/** 彩色: the colours above; 黑白: the whole drawing black (the 對位圖 default, only the photo arrows keep their colour —
 * 用戶 2026-11-23：「對位圖增加一個底圖黑白版的PDF，只保留箭頭原色。這個為預設」). */
export type PaperMode = "color" | "mono";

/** The colour to draw `hex` with on white paper. */
export function paperColor(hex: number, mode: PaperMode = "color"): number {
  if (mode === "mono") return 0x000000;
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  // white and the palest greys vanish on paper
  if (s < 0.15 && l > 0.85) return 0x000000;
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  // bright yellows, from yellow-orange (ACI 40, 45°) to yellow (ACI 2 / 50, 60°) and a little past
  if (h >= 40 && h <= 70 && s >= 0.4 && max >= 0.6) return PAPER_ORANGE;
  return hex;
}
