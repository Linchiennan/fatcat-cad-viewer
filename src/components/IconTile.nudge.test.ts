// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { nudgeIntoView } from "./IconTile";

const tipAt = (left: number, width: number) => {
  const el = document.createElement("span");
  el.getBoundingClientRect = () => {
    const shift = parseFloat(el.style.marginLeft || "0");
    return { left: left + shift, right: left + shift + width, width, top: 0, bottom: 40, height: 40, x: left + shift, y: 0, toJSON() {} } as DOMRect;
  };
  return el;
};

describe("long-press bubble stays on screen (註記 手繪 ran 97px off a 320px phone)", () => {
  it("moves a bubble off the left edge to 8px in", () => {
    const el = tipAt(-97, 240);
    expect(nudgeIntoView(el, 320)).toBe(105);
    expect(el.style.marginLeft).toBe("105px");
  });
  it("moves a bubble off the right edge back in", () => {
    const el = tipAt(217, 104); // 搜尋 關閉 at 217..321
    expect(nudgeIntoView(el, 320)).toBe(-9);
  });
  it("leaves a bubble that fits, and resets an earlier shift", () => {
    const el = tipAt(40, 200);
    el.style.marginLeft = "30px";
    expect(nudgeIntoView(el, 320)).toBe(0);
    expect(el.style.marginLeft).toBe("");
  });
});
