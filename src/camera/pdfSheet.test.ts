import { describe, expect, it } from "vitest";
import { joinRuns, pageRasterScale, toGrey } from "./pdfSheet";

describe("PDF base 對位圖 (用戶 2026-11-23 選 B 支援 PDF)", () => {
  it("draws at the asked dpi, lowered for a sheet too big to hold", () => {
    expect(pageRasterScale(1191, 842, 300)).toBeCloseTo(300 / 72); // A3 at 300 dpi
    const big = pageRasterScale(3370, 2384, 300); // A0
    expect(3370 * big).toBeLessThanOrEqual(12000 + 1e-6);
    expect(3370 * 2384 * big * big).toBeLessThanOrEqual(48e6 + 1);
    expect(pageRasterScale(1191, 842, 250, 16e6) * 1191 * pageRasterScale(1191, 842, 250, 16e6) * 842).toBeLessThanOrEqual(16e6 + 1);
  });

  it("turns the page grey by luminance and leaves alpha", () => {
    const px = new Uint8ClampedArray([255, 0, 0, 200, 255, 255, 255, 255]);
    toGrey(px);
    expect([...px]).toEqual([76, 76, 76, 200, 255, 255, 255, 255]);
  });

  it("joins the characters of one label written apart, not the next line or a far word", () => {
    const run = (text: string, x0: number, y: number) => ({ text, x0, x1: x0 + 10, y, h: 10, level: true });
    const out = joinRuns([run("主", 100, 500), run("臥", 111, 500), run("浴", 100, 470), run("室", 300, 470)]);
    expect(out.map((o) => o.text).sort()).toEqual(["主臥", "室", "浴"]);
    const bed = out.find((o) => o.text === "主臥")!;
    expect(bed.x).toBeCloseTo(110.5); expect(bed.y).toBeCloseTo(505);
  });
});
