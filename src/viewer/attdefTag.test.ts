import { describe, expect, it } from "vitest";
import { attdefAsText } from "./attdefTag";

// 碁創潭子 屋頂排水平面圖 ATTDEF 2B5：模型空間的屬性定義，ZWCAD 顯示標籤「配置同綠景3」，App 原本沒畫。
describe("attribute definition on the sheet", () => {
  it("shows its tag as text with the definition's placement and style", () => {
    const e = { type: "ATTDEF", handle: "2B5", layer: "0", tag: "配置同綠景3", text: "配置同B1", prompt: "CIRRCUIT-NO.:",
      startPoint: { x: 2470.58, y: 206.85 }, textHeight: 50, textStyle: "C4", horizontalJustification: 0, verticalJustification: 0 };
    expect(attdefAsText(e)).toMatchObject({ type: "TEXT", text: "配置同綠景3", styleName: "C4", textHeight: 50, startPoint: { x: 2470.58, y: 206.85 }, halign: 0, valign: 0, cadAttdef: true });
  });
  it("keeps mirrored / backward generation and leaves other entities alone", () => {
    expect(attdefAsText({ type: "ATTDEF", tag: "A", backwards: true, mirrored: true }).textGenerationFlag).toBe(6);
    const line = { type: "LINE" };
    expect(attdefAsText(line)).toBe(line);
    const empty = { type: "ATTDEF", tag: "" };
    expect(attdefAsText(empty)).toBe(empty);
  });
});
