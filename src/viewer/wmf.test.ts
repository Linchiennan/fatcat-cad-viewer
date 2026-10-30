import { describe, expect, it } from "vitest";
import { decodeDib, decodeWmfText, renderWmf, wmfInfo } from "./wmf";

// Builds a small WMF the way Excel writes its table previews.
function wmf(build: (rec: (fn: number, ...words: number[]) => void, bytes: (fn: number, data: number[]) => void) => void): Uint8Array {
  const body: number[] = [];
  const push = (fn: number, data: number[]) => { const words = 3 + data.length / 2; body.push(words & 0xff, (words >> 8) & 0xff, 0, 0, fn & 0xff, fn >> 8, ...data); };
  const rec = (fn: number, ...words: number[]) => push(fn, words.flatMap((w) => [w & 0xff, (w >> 8) & 0xff]));
  build(rec, push);
  push(0, []);
  return new Uint8Array([1, 0, 9, 0, 0, 3, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, ...body]);
}
const font = (height: number, charset: number, face: number[]) => {
  const d = new Array(50).fill(0);
  d[0] = height & 0xff; d[1] = (height >> 8) & 0xff; d[8] = 400 & 0xff; d[9] = 400 >> 8; d[13] = charset;
  face.forEach((b, i) => (d[18 + i] = b));
  return d;
};
const BIG5_TABLE = [0xaa, 0xed]; // 表
const MINGLIU = [0xb7, 0x73, 0xb2, 0xd3, 0xa9, 0xfa, 0xc5, 0xe9]; // 新細明體

function recorder() {
  const calls: any[] = [];
  const ctx: any = new Proxy({ calls }, {
    get: (t, k) => k in t ? (t as any)[k] : k === "measureText" ? () => ({ width: 7 }) : (...args: any[]) => calls.push([k, ...args]),
    set: (t, k, v) => { calls.push(["set " + String(k), v]); return true; },
  });
  return { ctx, calls };
}

describe("WMF preview playback", () => {
  const sample = wmf((rec, push) => {
    rec(0x0103, 8);
    rec(0x020c, 100, 200); // window 200 wide, 100 high
    push(0x02fb, font(-20, 136, MINGLIU)); rec(0x012d, 0);
    rec(0x02fa, 0, 0, 0, 0xff, 0); rec(0x012d, 1); // red cosmetic pen
    rec(0x02fc, 0, 0xff00, 0x00ff, 0); rec(0x012d, 2); // brush rgb(0,255,255)
    rec(0x0214, 10, 5); rec(0x0213, 10, 105);
    rec(0x0940, 0x0021, 0x00f0, 0, 0, 0, 30, 40, 50, 60); // PATCOPY 40x30 at (60,50)
    rec(0x001e); rec(0x012c, 0); rec(0x0416, 90, 150, 20, 30); // clip left 30 top 20 right 150 bottom 90
    push(0x0a32, [40, 0, 20, 0, 2, 0, 0, 0, ...BIG5_TABLE, 18, 0, 0, 0]); // 表 at (20,40), dx 18,0
    rec(0x0127, 0xffff);
    push(0x0a32, [0, 0, 0, 0, 1, 0, 0, 0, 0x41, 0]); // after RestoreDC no clip remains
  });

  it("reads the window extent", () => {
    expect(wmfInfo(sample)).toEqual({ width: 200, height: 100, originX: 0, originY: 0 });
  });

  it("maps the window onto the canvas and draws lines, pattern fills and Big5 text", () => {
    const { ctx, calls } = recorder();
    const result = renderWmf(sample, ctx, 400, 200);
    expect(result.skipped).toEqual({});
    expect(calls).toContainEqual(["moveTo", 10, 20]);
    expect(calls).toContainEqual(["lineTo", 210, 20]);
    expect(calls).toContainEqual(["set strokeStyle", "rgb(255,0,0)"]);
    expect(calls).toContainEqual(["fillRect", 120, 100, 80, 60]);
    expect(calls).toContainEqual(["set fillStyle", "rgb(0,255,255)"]);
    const text = calls.findIndex((c) => c[0] === "fillText" && c[1] === "表");
    expect(calls[text]).toEqual(["fillText", "表", 0, 0]);
    expect(calls.slice(0, text)).toContainEqual(["translate", 40, 80]);
    expect(calls.slice(0, text)).toContainEqual(["rect", 60, 40, 240, 140]); // clip in canvas pixels
    expect(calls.find((c) => c[0] === "set font")[1]).toMatch(/^40\.00px "新細明體","PMingLiU"/);
    const last = calls.findIndex((c) => c[0] === "fillText" && c[1] === "A");
    const sinceSave = calls.slice(calls.map((c) => c[0]).lastIndexOf("save", last), last);
    expect(sinceSave.some((c) => c[0] === "clip")).toBe(false);
  });

  it("lines up the per-byte advance array with double-byte characters", () => {
    const chars = decodeWmfText(new Uint8Array([0x31, ...BIG5_TABLE, 0x32]), 136, "新細明體");
    expect(chars).toEqual([{ text: "1", start: 0, end: 1 }, { text: "表", start: 1, end: 3 }, { text: "2", start: 3, end: 4 }]);
  });

  it("turns Symbol font letters into Greek (η, α, ε, γ in the generator table)", () => {
    expect(decodeWmfText(new TextEncoder().encode("hae"), 2, "Symbol").map((c) => c.text).join("")).toBe("ηαε");
  });

  it("rejects data that is not a WMF", () => {
    expect(() => wmfInfo(new Uint8Array(40))).toThrow(/WMF/);
  });
});

// 2×2 DIB: bottom-up rows, so the first stored row is the bottom one. Pixels: top red, green / bottom blue, white.
function dib24(): number[] {
  const h = new Array(40).fill(0);
  h[0] = 40; h[4] = 2; h[8] = 2; h[12] = 1; h[14] = 24;
  const row = (a: number[], b: number[]) => [...a, ...b, 0, 0]; // 6 bytes + 2 padding
  return [...h, ...row([255, 0, 0], [255, 255, 255]), ...row([0, 0, 255], [0, 255, 0])]; // BGR
}

describe("bitmaps inside a WMF (惠宇 X05 公設標示: the picture is one DIBSTRETCHBLT)", () => {
  it("decodes 24-bit, palette and bit-field DIBs top row first", () => {
    const d = decodeDib(new Uint8Array(dib24()));
    expect([d.width, d.height, d.bottomUp]).toEqual([2, 2, true]);
    expect(Array.from(d.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const pal = new Array(40).fill(0); pal[0] = 40; pal[4] = 2; pal[8] = 0xff; pal[9] = 0xff; pal[10] = 0xff; pal[11] = 0xff; pal[12] = 1; pal[14] = 1; // height -1: top-down
    const one = decodeDib(new Uint8Array([...pal, 0, 0, 0, 0, 255, 255, 255, 0, 0b01000000, 0, 0, 0]));
    expect(Array.from(one.rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    const bf = new Array(40).fill(0); bf[0] = 40; bf[4] = 1; bf[8] = 1; bf[12] = 1; bf[14] = 32; bf[16] = 3;
    const masks = [0x00ff0000, 0x0000ff00, 0x000000ff].flatMap(m => [m & 0xff, (m >> 8) & 0xff, (m >> 16) & 0xff, m >>> 24]);
    expect(Array.from(decodeDib(new Uint8Array([...bf, ...masks, 0x30, 0x20, 0x10, 0])).rgba)).toEqual([0x10, 0x20, 0x30, 255]);
    expect(() => decodeDib(new Uint8Array([40, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 1, 0, 24, 0, 1, 0, 0, 0, ...new Array(24).fill(0)]))).toThrow(/壓縮/);
  });

  it("draws a DIBSTRETCHBLT bitmap into its destination rectangle", () => {
    const sample = wmf((rec, push) => {
      rec(0x020c, 100, 200);
      const words = [0x0020, 0x00cc, 2, 2, 0, 0, 50, 100, 10, 20]; // SRCCOPY; source 2×2 at 0,0; destination 100×50 at (20,10)
      push(0x0b41, [...words.flatMap(w => [w & 0xff, w >> 8]), ...dib24()]);
    });
    const { ctx, calls } = recorder();
    const made: unknown[] = [];
    const result = renderWmf(sample, ctx, 400, 200, (p) => { made.push(p); return "IMG" as unknown as CanvasImageSource; });
    expect(result.skipped).toEqual({});
    expect(made).toHaveLength(1);
    expect(calls).toContainEqual(["translate", 40, 20]);
    expect(calls).toContainEqual(["drawImage", "IMG", 0, 0, 2, 2, 0, 0, 200, 100]);
  });
});
