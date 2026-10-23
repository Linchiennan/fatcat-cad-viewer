import { describe, expect, it } from "vitest";
import { MTextFormatParser } from "dxf-viewer/src/MTextFormatParser.js";

const parse = (text: string) => { const p = new MTextFormatParser(); p.Parse(text); return p.GetContent(); };
const { HEIGHT, SCOPE } = MTextFormatParser.EntityType;

describe("MTEXT \\H height codes (scripts/patch-mtext-height.mjs)", () => {
  it("emits relative and absolute heights in their own scope", () => {
    expect(HEIGHT).toBe(6);
    const out = parse("{\\H0.12x;ab}c\\H2.5;d");
    expect(out[0].type).toBe(SCOPE);
    expect(out[0].content[0]).toEqual({ type: HEIGHT, height: 0.12, relative: true });
    expect(out[0].content[1]).toMatchObject({ content: "ab" });
    expect(out[1]).toMatchObject({ content: "c" });
    expect(out[2]).toEqual({ type: HEIGHT, height: 2.5, relative: false });
    expect(out[3]).toMatchObject({ content: "d" });
  });

  it("ignores invalid heights and keeps the surrounding text", () => {
    const out = parse("a\\H0x;b\\Habc;c");
    expect(out.filter((e: any) => e.type === HEIGHT)).toHaveLength(0);
    expect(out.map((e: any) => e.content).join("")).toBe("abc");
  });
});
