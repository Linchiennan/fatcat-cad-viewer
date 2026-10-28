import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { DxfScene } from "dxf-viewer/src/DxfScene.js";

// 太原段 排水 HATCH 1B0C3：兩個並排的方框各是一個外框迴圈，每個迴圈後面跟著來源物件數 97 與代碼 330。
// 線段邊把 97 當成曲線邊欄位吃掉，第二個迴圈整個沒讀到（ZWCAD 兩格都有斜線，App 只畫左格）。
const box = (x0: number, x1: number, src: string) => [
  "92", "1", "93", "4",
  "72", "1", "10", `${x0}`, "20", "50", "11", `${x1}`, "21", "50",
  "72", "1", "10", `${x1}`, "20", "50", "11", `${x1}`, "21", "0",
  "72", "1", "10", `${x1}`, "20", "0", "11", `${x0}`, "21", "0",
  "72", "1", "10", `${x0}`, "20", "0", "11", `${x0}`, "21", "50",
  "97", "1", "330", src,
];
const dxf = (pairs: string[]) => ["0", "SECTION", "2", "ENTITIES", "0", "HATCH", "5", "1B0C3", "8", "0", "100", "AcDbHatch",
  "10", "0", "20", "0", "30", "0", "2", "ANSI31", "70", "0", "71", "1", "91", "2", ...pairs,
  "75", "0", "76", "1", "52", "0", "41", "1", "77", "0", "78", "0", "98", "0", "0", "ENDSEC", "0", "EOF"].join("\n");

// B13 浴室排水 6AD5B：9 × 95 的牆，存的 ANSI31 圖樣間距 6.25，但 41（比例）= 50。ZWCAD 依存的圖樣畫密斜線；
// 換成內建 ANSI31 × 50（間距約 159）只剩角落一筆。
const b13 = ["0", "SECTION", "2", "ENTITIES", "0", "HATCH", "5", "6AD5B", "8", "0", "100", "AcDbHatch",
  "10", "0", "20", "0", "30", "0", "2", "ANSI31", "70", "0", "71", "0", "91", "1",
  "92", "1", "93", "4",
  "72", "1", "10", "2864.806", "20", "1090.269", "11", "2873.806", "21", "1090.269",
  "72", "1", "10", "2873.806", "20", "1090.269", "11", "2873.806", "21", "1185.332",
  "72", "1", "10", "2873.806", "20", "1185.332", "11", "2864.806", "21", "1185.332",
  "72", "1", "10", "2864.806", "20", "1185.332", "11", "2864.806", "21", "1090.269", "97", "0",
  "75", "0", "76", "1", "52", "0", "41", "50", "77", "0", "78", "1",
  "53", "45", "43", "-25458.2397", "44", "-46098.2526", "45", "-4.4194174", "46", "4.4194174", "79", "0",
  "98", "1", "10", "-25458.2397", "20", "-46098.2526", "0", "ENDSEC", "0", "EOF"].join("\n");

describe("HATCH pattern stored in the drawing", () => {
  it("draws the stored ANSI31 lines, not the named pattern scaled by 41", async () => {
    const d = new DxfParser().parseSync(b13);
    class Scene extends DxfScene {}
    const scene = new Scene({}) as unknown as { _DecomposeHatch(e: unknown, ctx: unknown): Iterable<{ vertices: unknown[] }> };
    const segments = [...scene._DecomposeHatch(d.entities[0], null)].reduce((n, e) => n + e.vertices.length / 2, 0);
    // 斜向跨距 (9 + 95) / √2 ≈ 73.5，間距 6.25 → 12 條；換成內建 ANSI31 × 50 只會有 0～1 條
    expect(segments).toBeGreaterThanOrEqual(10);
  });
});

describe("HATCH boundary loops with source objects", () => {
  it("reads every loop when line edges are followed by the source-object count", () => {
    const doc = new DxfParser().parseSync(dxf([...box(0, 140, "1B0C5"), ...box(140, 280, "1B0C4")]));
    const loops = doc.entities[0].boundaryLoops;
    expect(loops.length).toBe(2);
    expect(loops.map((l: { edges: unknown[]; sourceRefs: string[] }) => [l.edges.length, l.sourceRefs])).toEqual([[4, ["1B0C5"]], [4, ["1B0C4"]]]);
  });
});
