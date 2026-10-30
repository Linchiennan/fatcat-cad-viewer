import { describe, expect, it } from "vitest";
import { prepareCad } from "./engineering";

// 14F 牆板放樣：外參「03-14F-動力插座」插在「!外參-器具平面圖」，這層在 14F 關閉（不是凍結）。
// CAD：插入的圖層關閉只藏圖塊裡 0 層的東西，放在自己圖層的插座照樣顯示；凍結才全部藏。App 原本整個外參都不見。
const doc = (frozen: boolean) => ({
  tables: { layer: { layers: {
    "0": { name: "0" },
    "器具平面圖": { name: "器具平面圖", visible: false, frozen },
    "牆板": { name: "牆板" },
  } } },
  blocks: {
    "插座": { name: "插座", entities: [{ type: "CIRCLE", layer: "0", radius: 1 }] },
    "動力插座": { name: "動力插座", entities: [
      { type: "INSERT", name: "插座", layer: "牆板" },
      { type: "LINE", layer: "0", vertices: [] },
    ] },
  },
  entities: [{ type: "INSERT", handle: "X", name: "動力插座", layer: "器具平面圖" }],
});

describe("an INSERT on an off layer", () => {
  it("keeps its content on other layers and hides its layer-0 content", () => {
    const d: any = doc(false);
    const report = prepareCad(d);
    const top = d.entities[0];
    expect(top.layer).toBe("0"); // not hidden by the off layer as a whole
    expect(top.cadInsertLayer).toBe("器具平面圖");
    const inside = d.blocks[top.name].entities;
    expect(inside.find((e: any) => e.type === "INSERT")).toMatchObject({ layer: "牆板" });
    expect(inside.find((e: any) => e.type === "INSERT").hidden).toBeFalsy();
    expect(inside.find((e: any) => e.type === "LINE")).toMatchObject({ layer: "器具平面圖", hidden: true });
    expect(report.blockLayers).toContain("器具平面圖"); // turning it on in the panel rebuilds
  });
  it("hides everything when the layer is frozen", () => {
    const d: any = doc(true);
    prepareCad(d);
    expect(d.entities[0].layer).toBe("器具平面圖");
  });
  it("a nested INSERT on an off layer still shows its own-layer content", () => {
    const d: any = doc(false);
    d.tables.layer.layers["牆板"].visible = false;
    d.blocks["插座"].entities.push({ type: "TEXT", layer: "文字", text: "P" });
    d.tables.layer.layers["文字"] = { name: "文字" };
    prepareCad(d);
    const outer = d.blocks[d.entities[0].name].entities.find((e: any) => e.type === "INSERT");
    expect(outer.hidden).toBeFalsy();
    const inner = d.blocks[outer.name].entities;
    expect(inner.find((e: any) => e.type === "CIRCLE").hidden).toBe(true);
    expect(inner.find((e: any) => e.type === "TEXT").hidden).toBeFalsy();
  });
});
