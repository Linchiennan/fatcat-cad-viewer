// The 工程相機 對位圖 at the sharpest dpi the device can draw (用戶 2026-11-23：「對位圖怎麼不能到300?」「改」):
// 300 dpi first, then 250. An attempt that fails, or only got through by shrinking the picture (the output engine's
// own fallback goes down 70 % a step, to about 210 dpi), gives way to the next; when every one had to shrink, the
// sharpest picture is kept. An iPhone or iPad starts at 250: A3 at 300 dpi is over its canvas limit, where it can
// draw a blank picture instead of failing.

/** dpi to try for the 對位圖, best first. */
export function sheetDpis(appleMobile: boolean): number[] {
  return appleMobile ? [250] : [300, 250];
}

/** Run `attempt` at each dpi until one is drawn at full size; else the sharpest drawn; else the last error. */
export async function atBestDpi<R extends { dpi: number; downscaled: boolean }>(dpis: readonly number[], attempt: (dpi: number) => Promise<R>): Promise<R> {
  let best: R | null = null, error: unknown = null;
  for (const dpi of dpis) {
    try {
      const r = await attempt(dpi);
      if (!r.downscaled) return r;
      if (!best || r.dpi > best.dpi) best = r;
    } catch (e) {
      error = e;
    }
  }
  if (best) return best;
  throw error ?? new Error("no dpi to try");
}
