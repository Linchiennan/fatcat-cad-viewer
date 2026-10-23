import { describe, expect, it, beforeEach } from "vitest";
import { fixedNumber, formatMeasure, loadDecimals, saveDecimals } from "./measureFormat";

const store = new Map<string, string>();
beforeEach(() => { store.clear(); (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }; });

describe("measurement decimals", () => {
  it("shows exactly the chosen number of digits", () => {
    expect(fixedNumber(45.4441, 2)).toBe("45.44");
    expect(fixedNumber(45.5, 0)).toBe("46");
    expect(fixedNumber(12.5, 2)).toBe("12.50");
    expect(fixedNumber(1017.876, 1)).toBe("1,017.9");
  });

  it("formats a length or area in the display unit", () => {
    expect(formatMeasure(454.441, "mm", "cm", 2)).toBe("45.44 cm");
    expect(formatMeasure(10000, "mm", "cm", 1, true)).toBe("100.0 cm²");
    expect(formatMeasure(3, "drawing", "drawing", 0)).toBe("3 圖面單位");
  });

  it("remembers the choice on this device and defaults to 1", () => {
    expect(loadDecimals()).toBe(1);
    saveDecimals(0);
    expect(loadDecimals()).toBe(0);
    store.set("fatcat:measure-decimals", "9");
    expect(loadDecimals()).toBe(1);
  });
});
