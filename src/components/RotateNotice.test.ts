import { describe, expect, it } from "vitest";
import { isPhoneSideways } from "./RotateNotice";

const s = (coarse: boolean, screenW: number, screenH: number, orientation?: string) => ({ coarse, screenW, screenH, orientation, innerW: screenW, innerH: screenH });

describe("isPhoneSideways", () => {
  it("phone held sideways: notice", () => {
    expect(isPhoneSideways(s(true, 915, 412, "landscape-primary"))).toBe(true);
    expect(isPhoneSideways(s(true, 412, 915, "landscape-secondary"))).toBe(true); // some browsers keep screen.width portrait
    expect(isPhoneSideways(s(true, 740, 360))).toBe(true);
  });
  it("phone upright, also in split screen: no notice", () => {
    expect(isPhoneSideways(s(true, 412, 915, "portrait-primary"))).toBe(false);
    expect(isPhoneSideways({ ...s(true, 412, 915, "portrait-primary"), innerW: 412, innerH: 300 })).toBe(false);
  });
  it("tablets and computers may turn", () => {
    expect(isPhoneSideways(s(true, 1280, 800, "landscape-primary"))).toBe(false);
    expect(isPhoneSideways(s(true, 1024, 768, "landscape-primary"))).toBe(false);
    expect(isPhoneSideways(s(false, 1366, 500, "landscape-primary"))).toBe(false);
  });
});
