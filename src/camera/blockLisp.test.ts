import { describe, expect, it } from "vitest";
import { angleParam, arrowBlockLisp } from "./blockLisp";
import type { ShotPoint } from "./types";

const pt = (id: string, no: number, x: number, y: number, angle: number): ShotPoint => ({ id, batchId: "b", no, x, y, angle, place: "" }) as ShotPoint;

describe("對位箭頭 LISP", () => {
  it("角度1 = tip direction + 180° (measured on the example block)", () => {
    expect(angleParam(153.3)).toBeCloseTo((333.3 * Math.PI) / 180, 6);
    expect(angleParam(255.5)).toBeCloseTo((75.5 * Math.PI) / 180, 6);
    expect(angleParam(-90)).toBeCloseTo(Math.PI / 2, 6);
  });
  it("lists points by number with marker text, escapes quotes, BOM + auto-run", () => {
    const pts = [pt("b", 2, 10.5, -3, 0), pt("a", 1, 1, 2, 90)];
    const s = arrowBlockLisp(pts, new Map([["a", "1x2"], ["b", 'q"2']]), { scale: 1.5, title: "8F" });
    expect(s.startsWith("\uFEFF")).toBe(true);
    const a = s.indexOf('(1 2 "1x2"'), b = s.indexOf('(10.5 -3 "q\\"2"');
    expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a);
    expect(s).toContain("fc:scale 1.5");
    expect(s).toContain('"對位箭頭"');
    expect(s.trimEnd().endsWith("(princ)")).toBe(true);
    expect(s.split("(").length).toBe(s.split(")").length);
    expect(s).not.toMatch(/"[^"\r\n]*\r?\n[^"]*"\)\)\r?\n\(c:/); // no raw newlines inside strings
  });
});
