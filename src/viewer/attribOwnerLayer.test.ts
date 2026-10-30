import { describe, expect, it } from "vitest";
import { prepareCad } from "./engineering";

// 13F 牆板放樣：外參 03-13F-動力插座 的「分路編號A」插在 E-插作-迴路（主圖把它關掉），屬性數字在 0 層。
// CAD 的 0 層屬性跟著所屬插入的圖層：圖層關掉就不顯示；App 原本照 0 層畫出 96 個白色數字。
const doc = () => ({
  tables: { layer: { layers: {
    "0": { name: "0", color: 0xffffff },
    "外參": { name: "外參", color: 0xffffff },
    "迴路": { name: "迴路", color: 0xff0000, visible: false },
  } } },
  blocks: {
    "分路編號A": { name: "分路編號A", entities: [{ type: "CIRCLE", layer: "0", radius: 1 }] },
    "03-13F-動力插座": { name: "03-13F-動力插座", entities: [
      { type: "INSERT", handle: "A1", name: "分路編號A", layer: "迴路" },
      { type: "ATTRIB", handle: "A2", ownerHandle: "A1", layer: "0", text: "4", colorIndex: 256 },
      { type: "TEXT", handle: "A3", layer: "0", text: "插座" },
    ] },
  },
  entities: [
    { type: "INSERT", handle: "X1", name: "03-13F-動力插座", layer: "外參" },
    { type: "INSERT", handle: "B1", name: "分路編號A", layer: "迴路" },
    { type: "ATTRIB", handle: "B2", ownerHandle: "B1", layer: "0", text: "5", colorIndex: 256 },
  ],
});

describe("attributes on layer 0 follow the INSERT they belong to", () => {
  it("inside a block (an xref): hidden with the INSERT's off layer, in its colour", () => {
    const d: any = doc();
    prepareCad(d);
    const xref = d.blocks[d.entities[0].name];
    const attrib = xref.entities.find((e: any) => e.type === "ATTRIB"), text = xref.entities.find((e: any) => e.type === "TEXT");
    expect(attrib).toMatchObject({ layer: "迴路", hidden: true, trueColor: 0xff0000 });
    expect(text.layer).toBe("外參"); // other layer-0 content keeps following the xref INSERT
    expect(text.hidden).toBeFalsy();
  });
  it("at the top: drawn on the INSERT's layer, so turning that layer off hides it", () => {
    const d: any = doc();
    prepareCad(d);
    expect(d.entities[2]).toMatchObject({ type: "ATTRIB", layer: "迴路" });
  });
});

describe("an xref's attributes keep pointing at their INSERT after renaming", () => {
  it("renames the owner handle with the same prefix as the INSERT handle", async () => {
    const src = (await import("node:fs")).readFileSync("src/viewer/xrefs.ts", "utf8");
    expect(src).toContain("ownerHandle:ns+e.ownerHandle");
  });
});
