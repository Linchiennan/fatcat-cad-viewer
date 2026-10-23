import { describe, expect, it } from "vitest";
import { normalizeLineType } from "./engineering";

describe("complex line type detection", () => {
  it("treats LibreDWG's shape flag without a shape as a plain dash pattern", () => {
    const center: any = { complex: true, elements: [
      { length: 22, flags: 4, shape: 0, styleHandle: "0" }, { length: -8.5, flags: 4, shape: 0, styleHandle: "0" },
    ] };
    normalizeLineType(center);
    expect(center.complex).toBe(false);
    expect(center.elements.map((e: any) => e.flags)).toEqual([0, 0]);
  });

  it("keeps real text and shape elements complex", () => {
    const gas: any = { elements: [{ length: 10, flags: 2, text: "GAS", styleHandle: "11" }, { length: -2, flags: 0 }] };
    const batt: any = { elements: [{ length: 0, flags: 4, shape: 132, styleHandle: "2A" }] };
    normalizeLineType(gas); normalizeLineType(batt);
    expect(gas.complex).toBe(true);
    expect(batt.complex).toBe(true);
  });

  it("keeps the rotation bit while dropping an empty text bit", () => {
    const lt: any = { elements: [{ length: 5, flags: 3, text: "" }] };
    normalizeLineType(lt);
    expect(lt.elements[0].flags).toBe(1);
    expect(lt.complex).toBe(false);
  });
});

import { prepareCad } from "./engineering";
describe("xref load state for the top strip", () => {
  it("marks xrefs with content as loaded and panel-disabled ones as not missing", () => {
    const report = prepareCad({ tables: { layer: { layers: {} } }, entities: [], blocks: {
      a: { name: "a", type: 4, xrefPath: "a.dwg", entities: [{ type: "LINE" }] },
      b: { name: "b", type: 4, xrefPath: "b.dwg", entities: [] },
      c: { name: "c", type: 4, xrefPath: "c.dwg", entities: [] },
    }, cadXrefStatuses: [{ name: "c", status: "已關閉" }] });
    const missing = report.xrefs.filter((x) => !x.loaded && !x.disabled).map((x) => x.name);
    expect(missing).toEqual(["b"]);
  });

  it("ignores plain blocks that LibreDWG gives a path but no xref flag", () => {
    const report = prepareCad({ tables: { layer: { layers: {} } }, entities: [], blocks: {
      閘閥: { name: "閘閥", type: 0, xrefPath: "閘閥", entities: [{ type: "LINE" }] },
    } });
    expect(report.xrefs).toEqual([]);
  });
});

describe("off layers inside blocks", () => {
  const dxf = (overrides?: Record<string, boolean>) => ({
    tables: { layer: { layers: { "0": { name: "0", visible: true }, FEHD: { name: "FEHD", visible: false, color: 8421504 }, A: { name: "A", visible: true } } } },
    entities: [{ type: "INSERT", name: "出口標示燈A", layer: "0", position: { x: 0, y: 0 } }],
    blocks: { 出口標示燈A: { name: "出口標示燈A", entities: [{ type: "CIRCLE", layer: "FEHD", center: { x: 0, y: 0 }, radius: 1000 }, { type: "LINE", layer: "A", vertices: [] }] } },
    ...(overrides ? { cadLayerVisibility: overrides } : {}),
  });
  const variantEntities = (d: any) => d.blocks[d.entities[0].name].entities;

  it("hides nested entities on a layer that is off in the drawing, as CAD does", () => {
    const d: any = dxf();
    const report = prepareCad(d);
    expect(variantEntities(d).find((e: any) => e.type === "CIRCLE").hidden).toBe(true);
    expect(variantEntities(d).find((e: any) => e.type === "LINE").hidden).toBeUndefined();
    expect(report.blockLayers).toEqual(expect.arrayContaining(["FEHD", "A"]));
  });

  it("shows them again when the viewer turned the layer on", () => {
    const d: any = dxf({ FEHD: true });
    prepareCad(d);
    expect(variantEntities(d).find((e: any) => e.type === "CIRCLE").hidden).toBeUndefined();
  });
});

describe("layer-0 content inheriting an off layer", () => {
  it("hides it like CAD when the INSERT that carries it sits on an off layer", () => {
    const d: any = {
      tables: { layer: { layers: { "0": { name: "0", visible: true }, OFF: { name: "OFF", visible: false } } } },
      entities: [{ type: "INSERT", name: "外", layer: "0", position: { x: 0, y: 0 } }],
      blocks: { 外: { name: "外", entities: [{ type: "INSERT", name: "內", layer: "OFF", position: { x: 0, y: 0 } }] }, 內: { name: "內", entities: [{ type: "CIRCLE", layer: "0", center: { x: 0, y: 0 }, radius: 5 }] } },
    };
    prepareCad(d);
    const outer = d.blocks[d.entities[0].name].entities[0];
    expect(outer.hidden).toBe(true);
  });
});
