import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoPanel, infoPlacement } from "./InfoPanel";

const fmt = (v: number, area = false) => `${v}${area ? "²" : ""}`;

describe("tap-to-inspect card", () => {
  it("shows text, layer, and the blocks a symbol belongs to with their attribute values (16B16C JK29D2D)", () => {
    const html = renderToStaticMarkup(<InfoPanel format={fmt} onHideLayer={() => {}} onClose={() => {}} entity={{
      kind: "TEXT", layer: "E電燈-器具", propertiesOnly: true, points: [], length: 0, approximate: false, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      properties: { text: "{\C2;浴}", colorIndex: 2, textHeight: 15, handle: "57A" },
      blockChain: [{ name: "水電圖B戶1130305", attributes: [] }, { name: "JK29D2D", attributes: [{ tag: "KENCAD", text: "JK29D2D00" }] }],
    }} />);
    for (const s of ["物件資訊", "文字", "浴", "E電燈-器具", "色號 2", "所屬圖塊（由外到內）", "水電圖B戶1130305", "JK29D2D", "KENCAD", "JK29D2D00", "隱藏圖層「E電燈-器具」"]) expect(html).toContain(s);
  });

  it("asks for a tap before anything is picked, and shows length for a line", () => {
    expect(renderToStaticMarkup(<InfoPanel format={fmt} entity={null} onHideLayer={() => {}} onClose={() => {}} />)).toContain("點圖面上的線、文字或符號");
    const line = renderToStaticMarkup(<InfoPanel format={fmt} onHideLayer={() => {}} onClose={() => {}} entity={{
      kind: "LINE", layer: "A", points: [], length: 125.5, approximate: false, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, properties: { colorIndex: 256, lineType: "BYLAYER" } }} />);
    expect(line).toContain("直線"); expect(line).toContain("125.5"); expect(line).toContain("隨圖層");
  });
});

describe("info card placement", () => {
  it("goes to the side away from the tap and stops short of it (16B16C symbol at 468 of 844)", () => {
    const p = infoPlacement(468, 844);
    expect(p.onTop).toBe(true);
    expect(78 + p.maxHeight).toBeLessThan(468);
    const q = infoPlacement(200, 844);
    expect(q.onTop).toBe(false);
    expect(844 - 108 - q.maxHeight).toBeGreaterThan(200);
  });
});
