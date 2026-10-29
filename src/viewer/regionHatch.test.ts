import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { installEngineeringScene, prepareCad } from "./engineering";

// 鴻群 t4 消防管線：管子是一個 REGION（雙線外框）裡面填 ANSI31。面域形狀是 ACIS 讀不到，App 只剩斜線像虛線。
// 填充線的迴圈記著來源物件（97/330 = 面域代碼），那個迴圈就是面域外框，照面域的圖層與顏色畫出來。
const square = (x0: number, src: string[]) => [
  "92", "1", "93", "4",
  "72", "1", "10", `${x0}`, "20", "0", "11", `${x0 + 10}`, "21", "0",
  "72", "1", "10", `${x0 + 10}`, "20", "0", "11", `${x0 + 10}`, "21", "10",
  "72", "1", "10", `${x0 + 10}`, "20", "10", "11", `${x0}`, "21", "10",
  "72", "1", "10", `${x0}`, "20", "10", "11", `${x0}`, "21", "0",
  "97", `${src.length}`, ...src.flatMap(h => ["330", h]),
];
const region = (handle: string, color: string) => ["0", "REGION", "5", handle, "330", "1F", "100", "AcDbEntity", "8", "F1", "62", color,
  "100", "AcDbModelerGeometry", "70", "1", "1", "mogoo o m o", "1", "ni ^ *+0;:,4"];
const hatch = (loops: string[][]) => ["0", "HATCH", "5", "B1", "8", "F1", "62", "8", "100", "AcDbHatch",
  "10", "0", "20", "0", "30", "0", "2", "ANSI31", "70", "0", "71", "1", "91", `${loops.length}`, ...loops.flat(),
  "75", "0", "76", "1", "52", "0", "41", "1", "77", "0", "78", "0", "98", "0"];
const doc = (...ents: string[][]) => new DxfParser().parseSync(["0", "SECTION", "2", "ENTITIES", ...ents.flat(), "0", "ENDSEC", "0", "EOF"].join("\n"));

describe("REGION outlines taken from the hatches filled from them", () => {
  it("keeps the region's handle, layer and colour instead of skipping it", () => {
    const d = doc(region("AA", "3"));
    expect(d.entities).toHaveLength(1);
    expect(d.entities[0]).toMatchObject({ type: "REGION", handle: "AA", layer: "F1", colorIndex: 3 });
    expect(d.cadUnsupported?.REGION).toBeUndefined();
  });

  it("links the hatch loop to its region and stops calling that region unsupported", () => {
    const d = doc(region("AA", "3"), region("BB", "5"), hatch([square(0, ["AA"]), square(20, [])]));
    const report = prepareCad(d);
    const h = d.entities.find((e: { type: string }) => e.type === "HATCH");
    expect(h.cadRegionOutlines).toHaveLength(1);
    expect(h.cadRegionOutlines[0].region.handle).toBe("AA");
    expect(h.cadRegionOutlines[0].loops).toHaveLength(1);
    // BB has no hatch: still reported, and only it
    expect(report.warnings.filter(w => w.startsWith("未支援物件 REGION"))).toEqual(["未支援物件 REGION：1（ACIS 實體，DWG 解析庫未提供形狀資料，請在電腦 CAD 查看）"]);
  });

  it("draws the linked loop in the region's colour after the hatch's own lines", () => {
    const d = doc(region("AA", "3"), hatch([square(0, ["AA"]), square(20, [])]));
    prepareCad(d);
    const h = d.entities.find((e: { type: string }) => e.type === "HATCH");
    const point = (x: number, y: number) => ({ x, y, clone() { return point(x, y); } });
    class Scene {
      *_DecomposeHatch() { yield { fill: true }; }
      _GetHatchBoundaryLoops(e: { boundaryLoops: { edges: { start: { x: number; y: number } }[] }[] }) {
        return e.boundaryLoops.map(l => ({ vertices: l.edges.map(g => point(g.start.x, g.start.y)) }));
      }
      _GetEntityExtrusionTransform() { return null; }
      _GetEntityLayer(e: { layer: string }) { return e.layer; }
      _GetEntityColor(e: { color: number }) { return e.color; }
      _InterpolateSpline() { return [0, 0]; }
      async Build() { /* not used here */ }
    }
    installEngineeringScene(Scene);
    const out = [...(new Scene() as any)._DecomposeHatch(h, null)];
    expect(out[0]).toEqual({ fill: true });
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ layer: "F1", color: 0x00ff00 });
    expect(out[1].vertices.map((v: { x: number; y: number }) => [v.x, v.y])).toEqual([[0, 0], [10, 0], [10, 0], [10, 10], [10, 10], [0, 10], [0, 10], [0, 0]]);
  });
});
