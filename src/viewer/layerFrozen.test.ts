import { describe, expect, it } from "vitest";
import DxfParser from "dxf-viewer/src/parser/DxfParser.js";

// 碁創潭子 10175E-B10100905：圖層 AC 的 70=2（新視埠預設凍結），ZWCAD 模型空間照常顯示 120 個圖塊，App 原本當成凍結藏起來。
const layer = (name: string, flags: number) => ["0", "LAYER", "2", name, "70", `${flags}`, "62", "3", "6", "CONTINUOUS"];
const dxf = ["0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "3",
  ...layer("AC", 2), ...layer("FZ", 1), ...layer("ON", 0), "0", "ENDTAB", "0", "ENDSEC", "0", "EOF"].join("\n");

describe("layer frozen flag", () => {
  it("treats only bit 1 as frozen; bit 2 is frozen in new viewports and still shows", () => {
    const layers = new DxfParser().parseSync(dxf).tables.layer.layers;
    expect([layers.AC.frozen, layers.FZ.frozen, layers.ON.frozen]).toEqual([false, true, false]);
  });
});
