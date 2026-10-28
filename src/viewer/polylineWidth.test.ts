import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { widePolyline } from "./widePolyline";
import { polylineVertexWidths } from "./engineering";

// 世舜 門窗圖 10527C224：舊式 POLYLINE 甜甜圈（兩個頂點凸度 1、寬 1.25），解析器原本跳過 40／41，畫成細圓。
const dxf = ["0", "SECTION", "2", "ENTITIES",
  "0", "POLYLINE", "5", "10527C224", "8", "ARCHI", "100", "AcDb2dPolyline", "66", "1", "70", "1", "10", "0", "20", "0", "30", "0", "40", "1.25", "41", "1.25",
  "0", "VERTEX", "5", "10527C225", "8", "ARCHI", "100", "AcDb2dVertex", "10", "1185.82", "20", "599.61", "30", "0", "40", "1.25", "41", "1.25", "42", "1",
  "0", "VERTEX", "5", "10527C226", "8", "ARCHI", "100", "AcDb2dVertex", "10", "1187.57", "20", "599.61", "30", "0", "40", "1.25", "41", "1.25", "42", "1",
  "0", "SEQEND", "0", "ENDSEC", "0", "EOF"].join("\n");

describe("old-style POLYLINE widths", () => {
  // t2-16C客變 1CA60：預設寬 20 → 0，頂點只寫起點寬 20（終點 0 被省略），ZWCAD 是錐形箭頭
  it("fills a vertex width left out with the polyline default, so a 20 → 0 arrow tapers", () => {
    const e = { type: "POLYLINE", startWidth: 20, endWidth: 0, shape: false, vertices: [{ x: 0, y: 0, startWidth: 20 }, { x: 30, y: 0 }] };
    const v = polylineVertexWidths(e);
    expect(v.map((p: { startWidth: number; endWidth: number }) => [p.startWidth, p.endWidth])).toEqual([[20, 0], [20, 0]]);
    const ys = widePolyline(v, false, 20).flatMap((m) => m.vertices.filter((p) => p.x > 29.9).map((p) => p.y));
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(0.01); // the tip is a point
    expect(polylineVertexWidths({ type: "LWPOLYLINE", vertices: [{ x: 0, y: 0 }] })).toEqual([{ x: 0, y: 0 }]);
  });
  it("reads the default and per-vertex widths and fills the donut ring", () => {
    const e = new DxfParser().parseSync(dxf).entities[0];
    expect([e.startWidth, e.endWidth]).toEqual([1.25, 1.25]);
    expect(e.vertices.map((v: { startWidth: number; endWidth: number; bulge: number }) => [v.startWidth, v.endWidth, v.bulge])).toEqual([[1.25, 1.25, 1], [1.25, 1.25, 1]]);
    const meshes = widePolyline(e.vertices, true, e.startWidth);
    const xs = meshes.flatMap((m) => m.vertices.map((p) => p.x));
    // ring from the centre line radius 0.875 ± 0.625: outer diameter 3.0 (ZWCAD's donut 1185.2 to 1188.2)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.0, 2);
  });
});
