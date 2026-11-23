import { describe, expect, it } from "vitest";
import { PAPER_ORANGE, paperColor } from "./paperColors";

describe("對位圖 on white paper (用戶 2026-11-23：背景白色，黃色改橘色)", () => {
  it("turns white black and yellows orange", () => {
    expect(paperColor(0xffffff)).toBe(0x000000); // ACI 7
    expect(paperColor(0xf0f0f0)).toBe(0x000000);
    expect(paperColor(0xffff00)).toBe(PAPER_ORANGE); // ACI 2 / 50
    expect(paperColor(0xffbf00)).toBe(PAPER_ORANGE); // ACI 40
    expect(paperColor(0xffff7f)).toBe(PAPER_ORANGE); // ACI 51
  });
  it("keeps the other colours", () => {
    for (const c of [0xff0000, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0x808080, 0xc0c0c0, 0xff7f00, 0x000000, 0x4c4c00, 0xbfff00]) expect(paperColor(c)).toBe(c);
  });
  it("黑白: the whole drawing black (用戶 2026-11-23)", () => {
    for (const c of [0xffffff, 0xffff00, 0xff0000, 0x00ffff, 0x808080, 0x000000]) expect(paperColor(c, "mono")).toBe(0x000000);
  });
});
