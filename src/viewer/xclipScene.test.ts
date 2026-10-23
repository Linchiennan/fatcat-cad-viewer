// XCLIP display (T14 8.3) on the real DxfScene, plus the main-thread material swap.
import { describe, expect, it } from "vitest";
import { RawShaderMaterial, GLSL3 } from "three";
import { DxfScene } from "dxf-viewer/src/DxfScene.js";
import { DxfViewer } from "dxf-viewer";
import { XCLIP_APP } from "../dwg/xclipMetadata";
import { clipChain, clipMaterial, insidePolygon, installXclipScene, installXclipViewer, prepareXclips, XCLIP_BLOCK_PREFIX, XCLIP_POINT_LIMIT, type XclipTables } from "./xclipScene";

type Any = any;
const clip = (points: [number, number][]) => ({ [XCLIP_APP]: { values: [{ code: 1000, value: points.map((p) => p.join(",")).join(";") }, { code: 1070, value: 0 }] } });
const line = (x1: number, y1: number, x2: number, y2: number, layer = "L") => ({ type: "LINE", layer, vertices: [{ x: x1, y: y1 }, { x: x2, y: y2 }] });
const square = [[0, 0], [5, 0], [5, 5], [0, 5]] as [number, number][];

class Scene extends DxfScene {}
installXclipScene(Scene);

async function build(doc: Any) {
  const scene: Any = new Scene({});
  await scene.Build(doc, []);
  return { scene: scene.scene, warnings: scene.cadSceneWarnings ?? [] };
}

const layers = { tables: { layer: { layers: { L: { name: "L", color: 0xff0000 }, "0": { name: "0", color: 0xffffff } } } } };

describe("XCLIP scene preparation", () => {
  it("gives a clipped INSERT its own block that is never flattened", async () => {
    const doc = { ...layers, blocks: { B: { name: "B", position: { x: 0, y: 0 }, entities: [line(0, 0, 10, 10)] } },
      entities: [{ type: "INSERT", handle: "A1", name: "B", layer: "0", position: { x: 0, y: 0 }, xdata: clip([[0, 0], [5, 5]]) }] };
    const { scene } = await build(doc);
    const alias = XCLIP_BLOCK_PREFIX + "A1";
    expect(scene.fatcatClips.top[alias].points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]);
    expect(scene.batches.some((b: Any) => b.key.blockName === alias && b.key.geometryType === 5)).toBe(true);
  });

  it("clips nested content on synthetic layers and stacks every ancestor clip", async () => {
    const doc = { ...layers, blocks: {
      C: { name: "C", position: { x: 0, y: 0 }, entities: [line(0, 0, 3, 3)] },
      B: { name: "B", position: { x: 0, y: 0 }, entities: [{ type: "INSERT", name: "C", layer: "L", position: { x: 1, y: 1 }, xdata: clip(square) }] },
      P: { name: "P", position: { x: 0, y: 0 }, entities: [{ type: "INSERT", name: "B", layer: "L", position: { x: 10, y: 0 }, xdata: clip(square) }] },
    }, entities: [{ type: "INSERT", handle: "T", name: "P", layer: "0", position: { x: 0, y: 0 } }] };
    const { scene } = await build(doc);
    const tables: XclipTables = scene.fatcatClips;
    const tags = Object.keys(tables.nested).map(Number).filter((t) => tables.nested[t].root === "P").sort((a, b) => a - b);
    expect(tags).toHaveLength(2);
    const [outer, inner] = tags;
    expect(tables.nested[inner].parent).toBe(outer);
    // inner clip square sits at (10,0) + (1,1) in P coordinates
    expect(tables.nested[inner].points[0]).toEqual({ x: 11, y: 1 });
    const def = scene.batches.find((b: Any) => b.key.blockName === "P" && /^__fatcat_xc\d+__L$/.test(b.key.layerName ?? ""));
    expect(def).toBeTruthy();
    expect(scene.batches.some((b: Any) => b.key.blockName === "P" && b.key.geometryType === 5)).toBe(true);
    expect(clipChain(tables, "P", `__fatcat_xc${inner}__L`)).toHaveLength(2);
    expect(scene.layers.some((l: Any) => l.name === `__fatcat_xc${inner}__L` && l.color === 0xff0000)).toBe(true);
  });

  it("keeps a 40-point concave boundary as it is", () => {
    const star = Array.from({ length: 40 }, (_, i) => { const r = i % 2 ? 2 : 5, a = (i / 40) * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a)] as [number, number]; });
    const doc: Any = { blocks: { B: { name: "B", entities: [] } }, entities: [{ type: "INSERT", handle: "S", name: "B", xdata: clip(star) }] };
    const prepared = prepareXclips(doc);
    expect(prepared.top.get(XCLIP_BLOCK_PREFIX + "S")).toHaveLength(40);
    const tables: XclipTables = { top: { [XCLIP_BLOCK_PREFIX + "S"]: { points: prepared.top.get(XCLIP_BLOCK_PREFIX + "S")!, offset: { x: 0, y: 0 } } }, nested: {} };
    const poly = clipChain(tables, XCLIP_BLOCK_PREFIX + "S", "L")[0];
    expect(insidePolygon({ x: 4, y: 0.05 }, poly)).toBe(true);
    expect(insidePolygon({ x: 2.96, y: 0.47 }, poly)).toBe(false); // in the notch, inside the bounding box
  });

  it("skips a boundary over 256 points with a warning instead of failing the drawing", async () => {
    const many = Array.from({ length: XCLIP_POINT_LIMIT + 1 }, (_, i) => [Math.cos(i), Math.sin(i)] as [number, number]);
    const doc = { ...layers, blocks: { B: { name: "B", position: { x: 0, y: 0 }, entities: [line(0, 0, 1, 1)] } },
      entities: [{ type: "INSERT", handle: "H", name: "B", layer: "0", position: { x: 0, y: 0 }, xdata: clip(many) }] };
    const { scene, warnings } = await build(doc);
    expect(scene.fatcatClips).toBeUndefined();
    expect(warnings.join()).toContain("XCLIP 邊界超過256點");
    expect(scene.batches.length).toBeGreaterThan(0);
  });
});

describe("XCLIP materials", () => {
  const shaders = (DxfViewer.prototype as Any)._GenerateShaders(1, false);
  const base = () => new RawShaderMaterial({ uniforms: { color: { value: null } }, vertexShader: shaders.vertex, fragmentShader: shaders.fragment, glslVersion: GLSL3 });

  it("uses separate uniforms for inner and outer clips", () => {
    const m = clipMaterial(base(), [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: -1, y: 1 }]]);
    expect(Object.keys(m.uniforms)).toEqual(expect.arrayContaining(["fatcatClip0", "fatcatClip1"]));
    expect((m.uniforms.fatcatClip1.value as unknown[]).length).toBe(3);
    expect(m.fragmentShader).toContain("discard");
  });

  it("swaps materials of clipped block batches and releases them on Clear", () => {
    class FakeBatch {
      constructor(readonly viewer: Any, readonly scene: Any, readonly batch: Any) {}
      key = { layerName: null as string | null };
      *CreateObjects() { yield { material: this.viewer.baseMaterial, _dxfViewerLayer: null }; }
    }
    let cleared = 0;
    class FakeViewer {
      added: Any[] = [];
      baseMaterial = base();
      scene = { add: (o: Any) => this.added.push(o) };
      defaultLayer = { objects: [] as Any[], PushObject(o: Any) { this.objects.push(o); } };
      blocks = new Map<string, Any>();
      _LoadBatch() { throw new Error("not clipped: original path"); }
      Clear() { cleared++; }
    }
    installXclipViewer(FakeViewer);
    const viewer: Any = new FakeViewer();
    const definition = new FakeBatch(viewer, null, null);
    viewer.blocks.set("__fatcat_xclip_A", { batches: [definition] });
    const scene = { fatcatClips: { top: { __fatcat_xclip_A: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], offset: { x: 0, y: 0 } } }, nested: {} } };
    viewer._LoadBatch(scene, { key: { blockName: "__fatcat_xclip_A", geometryType: 5 } });
    expect(viewer.added).toHaveLength(1);
    const swapped = viewer.added[0].material;
    expect(swapped).not.toBe(viewer.baseMaterial);
    let disposed = false;
    swapped.addEventListener("dispose", () => { disposed = true; });
    viewer.Clear();
    expect(disposed).toBe(true);
    expect(cleared).toBe(1);
    expect(() => viewer._LoadBatch({}, { key: { blockName: null, geometryType: 1 } })).toThrow("original path");
  });
});
