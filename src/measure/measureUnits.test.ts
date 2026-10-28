import { beforeEach, describe, expect, it } from "vitest";
import { nextUnits, changeUnits, clampPanelHeight, defaultDisplayUnit, formatLabel, formatResult, loadPanelHeight, savePanelHeight, sheetUnits } from "./measureUnits";
import { savePosition } from "../viewer/readingPosition";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  // Object.keys(localStorage) in readingPosition: expose stored keys as own properties.
  (globalThis as any).localStorage = new Proxy((globalThis as any).localStorage, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
});

describe("sheet units (T16 3.4)", () => {
  it("follows INSUNITS, else assumes centimetres; display defaults to cm", () => {
    expect(sheetUnits("k1", "mm")).toEqual({ source: "mm", display: "cm", assumed: false });
    expect(sheetUnits("k2", "drawing")).toEqual({ source: "cm", display: "cm", assumed: true });
  });

  it("the display default follows the language: 繁中 cm; English inches in the US, mm elsewhere (用戶 2026-10-28)", () => {
    expect(defaultDisplayUnit("zh-TW", ["en-US"])).toBe("cm");
    expect(defaultDisplayUnit("en", ["en-US", "zh-TW"])).toBe("in");
    expect(defaultDisplayUnit("en", ["en-GB"])).toBe("mm");
    expect(defaultDisplayUnit("en", ["de-DE"])).toBe("mm");
    expect(defaultDisplayUnit("en", ["zh-Hant-TW"])).toBe("mm");
    expect(defaultDisplayUnit("en", ["en"])).toBe("mm");
    // the default only fills in: a unit saved for the sheet stays
    expect(sheetUnits("k3", "mm", "in")).toEqual({ source: "mm", display: "in", assumed: false });
    const key = "fatcat-reading-v1:b.dxf:00";
    savePosition(key, { x: 0, y: 0, width: 10 });
    changeUnits(key, "mm", sheetUnits(key, "mm", "in"), { display: "cm" });
    expect(sheetUnits(key, "mm", "in").display).toBe("cm");
  });

  it("a saved choice wins and changing the source moves the display along", () => {
    const key = "fatcat-reading-v1:a.dxf:00";
    savePosition(key, { x: 0, y: 0, width: 10 });
    const next = changeUnits(key, "drawing", sheetUnits(key, "drawing"), { source: "mm" });
    expect(next).toEqual({ source: "mm", display: "mm", assumed: false });
    expect(sheetUnits(key, "drawing")).toEqual({ source: "mm", display: "mm", assumed: false });
    expect(changeUnits(key, "drawing", next, { display: "m" }).display).toBe("m");
    expect(changeUnits(key, "drawing", next, { source: "drawing" })).toMatchObject({ source: "drawing", display: "drawing" });
  });

  it("panel changes: source moves display along; drawing source forces drawing display", () => {
    expect(nextUnits({ source: "mm", display: "cm" }, { source: "m" })).toEqual({ source: "m", display: "m" });
    expect(nextUnits({ source: "mm", display: "cm" }, { display: "ft" })).toEqual({ source: "mm", display: "ft" });
    expect(nextUnits({ source: "mm", display: "cm" }, { source: "drawing" })).toEqual({ source: "drawing", display: "drawing" });
    expect(nextUnits({ source: "drawing", display: "drawing" }, { display: "cm" })).toEqual({ source: "drawing", display: "drawing" });
  });

  it("formats results and drawing labels (no unit word for drawing units)", () => {
    const mm = { source: "mm" as const, display: "cm" as const, assumed: false };
    expect(formatResult(mm, 1)(628)).toBe("62.8 cm");
    expect(formatResult(mm, 1)(10000, true)).toBe("100.0 cm²");
    expect(formatLabel(628, mm, 1)).toBe("62.8 cm");
    expect(formatLabel(628, { source: "drawing", display: "drawing", assumed: false }, 2)).toBe("628.00");
    // 齒輪「圖上數字顯示單位」關閉：只留換算後的數字（面積也一樣），結果面板仍用 formatResult 帶單位
    expect(formatLabel(628, mm, 1, false)).toBe("62.8");
    expect(formatLabel(10000, mm, 1, false, true)).toBe("100.0");
    expect(formatLabel(10000, mm, 1, true, true)).toBe("100.0 cm²");
  });
});

describe("panel height (T16 2.4-2)", () => {
  it("is kept between 110 and window height − 190, and ignored below 110", () => {
    expect(clampPanelHeight(50, 800)).toBe(110);
    expect(clampPanelHeight(900, 800)).toBe(610);
    expect(clampPanelHeight(500, 250)).toBe(110);
    // the panel's own floor (title + one row of mode tiles) wins over 110, even in a short window
    expect(clampPanelHeight(120, 800, 168)).toBe(168);
    expect(clampPanelHeight(300, 800, 168)).toBe(300);
    expect(clampPanelHeight(500, 250, 168)).toBe(168);
    expect(loadPanelHeight()).toBeNull();
    savePanelHeight(321.6);
    expect(loadPanelHeight()).toBe(322);
    store.set("fatcat:measure-panel-height", "90");
    expect(loadPanelHeight()).toBeNull();
  });
});
