import { describe, expect, it } from "vitest";
import { atBestDpi, sheetDpis } from "./bestDpi";

const drawn = (dpi: number, downscaled = false) => ({ dpi, downscaled });

describe("對位圖 dpi (用戶 2026-11-23：到 300)", () => {
  it("tries 300 then 250, iPhone only 250", () => {
    expect(sheetDpis(false)).toEqual([300, 250]);
    expect(sheetDpis(true)).toEqual([250]);
  });
  it("keeps 300 when it is drawn at full size", async () => {
    const tried: number[] = [];
    expect(await atBestDpi([300, 250], async (d) => { tried.push(d); return drawn(d); })).toEqual(drawn(300));
    expect(tried).toEqual([300]);
  });
  it("falls back to 250 when 300 fails or had to shrink", async () => {
    expect(await atBestDpi([300, 250], async (d) => { if (d === 300) throw new Error("too large"); return drawn(d); })).toEqual(drawn(250));
    expect(await atBestDpi([300, 250], async (d) => (d === 300 ? drawn(210, true) : drawn(250)))).toEqual(drawn(250));
  });
  it("keeps the sharpest when every size had to shrink, and reports the error when none was drawn", async () => {
    expect(await atBestDpi([300, 250], async (d) => drawn(d === 300 ? 210 : 175, true))).toEqual(drawn(210, true));
    await expect(atBestDpi([300, 250], async () => { throw new Error("no"); })).rejects.toThrow("no");
  });
});
