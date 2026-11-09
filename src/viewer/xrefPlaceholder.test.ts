import { describe, expect, it } from "vitest";
import { addMissingXrefTexts } from "./xrefPlaceholder";

const xref = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: 4, xrefPath: "\\\\Pc-01\\圖\\" + name + ".dwg", entities: [], position: { x: 10, y: 20, z: 0 }, ...extra });

describe("missing xref placeholder text", () => {
  it("height is the current style's last height, not the saved TEXTSIZE, as ZWCAD reopens it (測試圖 10 → 2.5)", () => {
    const dxf: any = { header: { $TEXTSIZE: 10, $TEXTSTYLE: "Standard" }, tables: { style: { styles: { Standard: { fixedTextHeight: 0, lastHeight: 2.5 } } } }, blocks: { R0: xref("R0") } };
    addMissingXrefTexts(dxf, new Set());
    expect(dxf.blocks.R0.entities[0].textHeight).toBe(2.5);
    dxf.tables.style.styles.Standard.fixedTextHeight = 4; dxf.blocks.R0.entities = [];
    addMissingXrefTexts(dxf, new Set());
    expect(dxf.blocks.R0.entities[0].textHeight).toBe(4);
  });
  it("draws the saved path with the host's current style, layer, ByLayer, as ZWCAD (給水-2F)", () => {
    const dxf: any = { header: { $TEXTSIZE: 15, $TEXTSTYLE: "NAME", $CLAYER: "W-給水-L-CW", $CECOLOR: 256 }, tables: { style: { styles: { NAME: { fixedTextHeight: 0, lastHeight: 15 } } } }, blocks: { "X-2F": xref("X-2F") } };
    expect(addMissingXrefTexts(dxf, new Set())).toBe(1);
    const [t] = dxf.blocks["X-2F"].entities;
    expect(t).toMatchObject({ type: "TEXT", text: "外部參考 \\\\Pc-01\\圖\\X-2F.dwg", textHeight: 15, styleName: "NAME", layer: "W-給水-L-CW", colorIndex: 256, startPoint: { x: 10, y: 20 } });
  });
  it("falls back to 2.5 / Standard / 0 without header values", () => {
    const dxf: any = { blocks: { R0: xref("R0") } };
    addMissingXrefTexts(dxf, new Set());
    expect(dxf.blocks.R0.entities[0]).toMatchObject({ textHeight: 2.5, styleName: "Standard", layer: "0" });
  });
  it("leaves loaded, unloaded, turned-off, not-needed and plain blocks alone", () => {
    const dxf: any = { header: {}, blocks: {
      loaded: xref("loaded", { entities: [{ type: "LINE" }] }),
      unloaded: xref("unloaded", { cadXrefUnloaded: true }),
      off: xref("off"),
      nested: xref("nested", { cadXrefNotNeeded: true }),
      plain: xref("plain", { type: 0 }),
    } };
    expect(addMissingXrefTexts(dxf, new Set(["off"]))).toBe(0);
    expect(dxf.blocks.loaded.entities).toHaveLength(1);
    for (const n of ["unloaded", "off", "nested", "plain"]) expect(dxf.blocks[n].entities).toHaveLength(0);
  });
});
