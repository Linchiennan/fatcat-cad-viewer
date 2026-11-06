import { describe, expect, it } from "vitest";
import { sheetLabelHeight } from "./cadEngine";

// 06-11F-給水放樣 配置：量測數字「16.4」佔半個螢幕——標籤用了視埠內模型字高（15），沒乘視埠比例
describe("measurement label height on a layout", () => {
  const text = (h: number) => ({ type: "TEXT", textHeight: h });
  const doc = (space: string) => ({
    cadActiveSpace: space,
    entities: [{ type: "INSERT", name: "VP", xScale: 1 / 15 }, text(0.5)],
    blocks: { VP: { name: "VP", entities: [{ type: "DIMENSION", block: "*D1" }, { type: "DIMENSION", block: "*D2" }] }, "*D1": { name: "*D1", entities: [text(15)] }, "*D2": { name: "*D2", entities: [text(15)] } },
  });
  it("takes the viewport's dimension numbers at their size on the sheet", () => {
    expect(sheetLabelHeight(doc("配置1"))).toBeCloseTo(1, 9);
  });
});
