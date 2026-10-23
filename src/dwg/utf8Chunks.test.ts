import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { joinSplitUtf8 } from "./utf8Chunks";

const enc = (s: string) => new TextEncoder().encode(s), dec = (b: Uint8Array) => new TextDecoder().decode(b);
const flow = enc("流動");

describe("UTF-8 characters cut across MTEXT chunks (TOTO sheet re-saved as 2018)", () => {
  it("moves the cut lead bytes to the next chunk", () => {
    const head = enc("  1\r\nA\r\n  3\r\n最低必要水壓（流"), tail = enc("時）\r\n  0\r\nEOF\r\n");
    const cut = new Uint8Array([...head, ...flow.subarray(3, 4), ...enc("\r\n  3\r\n"), ...flow.subarray(4), ...tail]);
    expect(dec(cut)).toContain("�");
    const { bytes, joined } = joinSplitUtf8(cut);
    expect(joined).toBe(1);
    expect(dec(bytes)).toBe("  1\r\nA\r\n  3\r\n最低必要水壓（流\r\n  3\r\n動時）\r\n  0\r\nEOF\r\n");
  });

  it("leaves whole text and non-text values alone", () => {
    const fine = enc("  3\nabc中\n  1\n文\n 10\n1.0\n");
    expect(joinSplitUtf8(fine)).toEqual({ bytes: fine, joined: 0 });
  });

  const real = "../003-網頁版/test-font/resave/toilet-2018-raw.dxf";
  it.runIf(existsSync(real))("fixes the real LibreDWG output", () => {
    const { bytes, joined } = joinSplitUtf8(new Uint8Array(readFileSync(real)));
    expect(joined).toBeGreaterThan(0);
    expect(dec(bytes)).toContain("（流\r\n  3\r\n動時）");
    expect(dec(bytes)).not.toContain("�");
  });
});

import { joinSplitChunks } from "./utf8Chunks";
describe("double-byte characters cut across MTEXT chunks (結構圖 S2-A03, Big5)", () => {
  const big5 = (s: string) => new Uint8Array([...new TextEncoder().encode(s)].length ? Array.from(s).flatMap((c) => c.charCodeAt(0) < 128 ? [c.charCodeAt(0)] : [...bytesOf(c)]) : []);
  const map: Record<string, number[]> = { 支: [0xa4, 0xe4], 數: [0xbc, 0xc6], 不: [0xa4, 0xa3], 同: [0xa6, 0x50], 時: [0xae, 0xc9] };
  const bytesOf = (c: string) => map[c];
  const decode = (b: Uint8Array) => new TextDecoder("big5").decode(b);

  it("moves a lone lead byte to the next chunk so 不 decodes whole", () => {
    const cut = new Uint8Array([...big5("  3\r\n支數"), 0xa4, ...big5("\r\n  3\r\n"), 0xa3, ...big5("同時\r\n  0\r\nEOF\r\n")]);
    expect(decode(cut)).not.toContain("不同");
    const { bytes, joined } = joinSplitChunks(cut, "big5");
    expect(joined).toBe(1);
    expect(decode(bytes)).toBe("  3\r\n支數\r\n  3\r\n不同時\r\n  0\r\nEOF\r\n");
  });

  it("does not mistake a trail byte that opens the next chunk for a lead byte", () => {
    // chunk 1 ends with a lead byte; chunk 2 starts with its trail byte and is otherwise whole.
    const cut = new Uint8Array([...big5("  3\r\nA"), 0xa4, ...big5("\r\n  3\r\n"), 0xa3, ...big5("同\r\n  3\r\n時\r\n  0\r\nEOF\r\n")]);
    const { bytes, joined } = joinSplitChunks(cut, "big5");
    expect(joined).toBe(1);
    expect(decode(bytes)).toContain("A\r\n  3\r\n不同\r\n  3\r\n時");
  });

  it("leaves code pages without double-byte characters alone", () => {
    const b = new Uint8Array([0x33, 0x0a, 0xe9, 0x0a, 0x33, 0x0a, 0x41, 0x0a]);
    expect(joinSplitChunks(b, "windows-1252")).toEqual({ bytes: b, joined: 0 });
  });
});
