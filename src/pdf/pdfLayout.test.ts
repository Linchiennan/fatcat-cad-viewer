import { describe, expect, it } from "vitest";
import { canvasSize, pageScale, pixelRatio, typedPage, wheelFactor, zoomBy, zoomIn, zoomOut, zoomText } from "./pdfLayout";

describe("PDF zoom by hand (用戶 2026-10-27：看 PDF 要能縮放)", () => {
  it("multiplies by a pinch / wheel factor within 25 %…600 %", () => {
    expect(zoomBy(1, 2)).toBe(2);
    expect(zoomBy(4, 3)).toBe(6);
    expect(zoomBy(0.5, 0.1)).toBe(0.25);
    expect(zoomBy(1, NaN)).toBe(1);
  });
  it("one wheel notch up is one zoom step, down undoes it", () => {
    expect(wheelFactor(-100)).toBeCloseTo(1.25, 6);
    expect(wheelFactor(-100) * wheelFactor(100)).toBeCloseTo(1, 9);
  });
});

describe("PDF page layout (T17 3.3)", () => {
  it("fits the page width to the scroll area minus 36 px", () => {
    expect(pageScale(1280, 1244, 1)).toBe(1);
    expect(pageScale(1280, 622, 1.25)).toBe(2.5);
    expect(pageScale(10, 1000, 1)).toBe(0.05);
  });

  it("caps canvas pixels at about 12 million, 8192 a side, ratio at most 2", () => {
    expect(pixelRatio(1000, 1000, 3)).toBe(2);
    const a0 = canvasSize(9000, 6000, 2);
    expect(a0.width * a0.height).toBeLessThanOrEqual(12_000_000);
    expect(Math.max(a0.width, a0.height)).toBeLessThanOrEqual(8192);
    expect(canvasSize(0.2, 0.2, 1)).toMatchObject({ width: 1, height: 1 });
  });

  it("typed page numbers are whole and clamped; empty or text does nothing", () => {
    expect(typedPage("9", 2)).toBe(2);
    expect(typedPage("0", 2)).toBe(1);
    expect(typedPage("1.8", 2)).toBe(1);
    expect(typedPage("", 2)).toBeNull();
    expect(typedPage("abc", 2)).toBeNull();
  });

  it("zoom steps of 1.25 between 25% and 600%", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomIn(5.9)).toBe(6);
    expect(zoomOut(0.3)).toBe(0.25);
    expect(zoomText(1.25 * 1.25)).toBe("156%");
  });
});
