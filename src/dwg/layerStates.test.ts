import { describe, expect, it } from "vitest";
import { restoreLayerStates, type LayerState } from "./layerStates";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const layer = (name: string, color: number, flags = 0) => `  0\nLAYER\n  2\n${name}\n 70\n     ${flags}\n 62\n   ${color}\n`;
const dxf = (layers: string) =>
  `  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n3\n${layers}  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n  0\nLINE\n  8\nA\n 62\n    -5\n  0\nENDSEC\n  0\nEOF\n`;
const state = (s: Partial<LayerState> = {}): LayerState => ({ off: false, frozen: false, frozenInNew: false, ...s });

describe("layer state restore (T13 4.3)", () => {
  it("restores on / off / frozen from the reader and leaves entity colours alone", () => {
    const states = new Map([["A", state()], ["b", state({ off: true })], ["C", state({ frozen: true, frozenInNew: true })]]);
    const out = dec(restoreLayerStates(enc(dxf(layer("A", -1) + layer("B", 2) + layer("C", -3, 4))), states));
    expect(out).toContain("  2\nA\n 70\n     0\n 62\n   1\n");
    expect(out).toContain("  2\nB\n 70\n     0\n 62\n   -2\n");
    expect(out).toContain("  2\nC\n 70\n     7\n 62\n   3\n");
    expect(out).toContain("LINE\n  8\nA\n 62\n    -5\n");
  });

  it("turns every layer on when no state was read", () => {
    const out = dec(restoreLayerStates(enc(dxf(layer("A", -1, 1) + layer("B", -7))), null));
    expect(out).toContain("A\n 70\n     1\n 62\n   1\n");
    expect(out).toContain("B\n 70\n     0\n 62\n   7\n");
  });

  it("returns the same bytes when nothing differs", () => {
    const src = enc(dxf(layer("A", 1)));
    expect(restoreLayerStates(src, new Map([["A", state()]]))).toBe(src);
  });
});

describe("layer names in the drawing's code page", () => {
  it("matches Big5 and \\U+ escaped names against the reader's Unicode names", () => {
    const big5 = new Uint8Array([0xb5, 0xb9, 0xa4, 0xf4]); // 給水
    const head = new TextEncoder().encode("  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n  0\nLAYER\n  2\n");
    const tail = new TextEncoder().encode("\n 70\n0\n 62\n-3\n  0\nLAYER\n  2\n\\U+6392\\U+6C34\n 70\n0\n 62\n-4\n  0\nENDTAB\n  0\nEOF\n");
    const src = new Uint8Array([...head, ...big5, ...tail]);
    const states = new Map([["給水", state({ off: true })], ["排水", state({ frozen: true })]]);
    const out = restoreLayerStates(src, states, "big5");
    const text = new TextDecoder("big5").decode(out);
    expect(text).toContain("給水\n 70\n0\n 62\n-3\n");
    expect(text).toContain("\\U+6392\\U+6C34\n 70\n1\n 62\n4\n");
  });
});
