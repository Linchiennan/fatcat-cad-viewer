import { describe, expect, it } from "vitest";
import { textLines } from "./markup";

describe("多行文字的分行", () => {
  it("keeps the typed line breaks", () => {
    expect(textLines("第一行\n第二行", 18)).toEqual(["第一行", "第二行"]);
  });
  it("wraps to the box width character by character", () => {
    const lines = textLines("一二三四五六七", 10, 30);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("一二三四五六七");
  });
  it("a single line without a box stays one line", () => {
    expect(textLines("此處漏水", 18)).toEqual(["此處漏水"]);
  });
});
