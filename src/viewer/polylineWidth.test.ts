import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";
import { widePolyline } from "./widePolyline";

// 世舜 門窗圖 10527C224：舊式 POLYLINE 甜甜圈（兩個頂點凸度 1、寬 1.25），解析器原本跳過 40／41，畫成細圓。
const dxf = ["0", "SECTION", "2", "ENTITIES",
  "0", "POLYLINE", "5", "10527C224", "8", "ARCHI", "100", "AcDb2dPolyline", "66", "1", "70", "1", "10", "0", "20", "0", "30", "0", "40", "1.25", "41", "1.25",
  "0", "VERTEX", "5", "10527C225", "8", "ARCHI", "100", "AcDb2dVertex", "10", "1185.82", "20", "599.61", "30", "0", "40", "1.25", "41", "1.25", "42", "1",
  "0", "VERTEX", "5", "10527C226", "8", "ARCHI", "100", "AcDb2dVertex", "10", "1187.57", "20", "599.61", "30", "0", "40", "1.25", "41", "1.25", "42", "1",
  "0", "SEQEND", "0", "ENDSEC", "0", "EOF"].join("\n");

describe("old-style POLYLINE widths", () => {
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
