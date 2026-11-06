import { describe, expect, it } from "vitest";
import { Entity } from "dxf-viewer/src/DxfScene.js";
import { DENSE_HATCH_SEGMENTS, HATCH_BUDGET, SMALL_HATCH_SEGMENTS, installEngineeringScene } from "./engineering";

// A stand-in scene whose own hatch fill yields `n` segments, so the limits can be tried without real patterns.
const point = (x: number, y: number) => ({ x, y, clone() { return point(x, y); } });
let fills = 0;
class Scene {
  *_DecomposeHatch(e: any) {
    if (e.isSolid) { yield new Entity({ type: Entity.Type.TRIANGLES, vertices: [point(0, 0), point(10, 0), point(10, 10)], indices: [0, 1, 2] }); return; }
    fills++; for (let i = 0; i < e.n; i++) yield new Entity({ type: Entity.Type.LINE_SEGMENTS, vertices: [point(i, 0), point(i + 1, 0)] });
  }
  _GetHatchBoundaryLoops() { return [{ vertices: [point(0, 0), point(10, 0), point(10, 10)] }]; }
  _GetEntityExtrusionTransform() { return null; }
  _GetEntityLayer() { return "0"; }
  _GetEntityColor() { return 0xffffff; }
  _InterpolateSpline() { return [0, 0]; }
  async Build() { /* not used here */ }
}
installEngineeringScene(Scene);
const hatch = (handle: string, n: number) => ({ type: "HATCH", handle, patternName: "AR-CONC", patternScale: 0.1, n });
// A pattern of more line families than the shader holds keeps the earlier fallbacks.
const tooMany = Array.from({ length: 17 }, (_, i) => ({ angle: i / 10, base: { x: 0, y: 0 }, offset: { x: 0, y: 1 + i } }));
const heavy = (handle: string, n: number) => ({ ...hatch(handle, n), definitionLines: tooMany });

describe("hatches too dense to fill in time (上晴 B區-2 AR-CONC at scale 0.1)", () => {
  it("keeps the pattern of an ordinary hatch", () => {
    const scene: any = new Scene();
    expect([...scene._DecomposeHatch(hatch("A1", 50))]).toHaveLength(50);
    expect(scene.cadDenseHatchCount ?? 0).toBe(0);
  });

  it("draws a hatch past either limit as a fill whose pattern the graphics card draws (上晴 A區0420 地坪石材)", () => {
    const scene: any = new Scene();
    const out = [...scene._DecomposeHatch(hatch("G1", DENSE_HATCH_SEGMENTS + 5))];
    expect(out.map((x: any) => x.type)).toEqual([Entity.Type.TRIANGLES]);
    expect(out[0].cadPattern).toHaveLength(13); // AR-CONC's line families
    scene.cadHatchSegments = HATCH_BUDGET;
    expect([...scene._DecomposeHatch(hatch("G2", SMALL_HATCH_SEGMENTS + 1))][0].cadPattern).toHaveLength(13);
    expect(scene.cadDenseHatchCount ?? 0).toBe(0);
    expect(scene.cadSolidDenseHatchCount ?? 0).toBe(0);
  });

  it("draws one the shader cannot hold past the per-hatch limit solid with its boundary, copies included", () => {
    const scene: any = new Scene();
    const out = [...scene._DecomposeHatch(heavy("B1", DENSE_HATCH_SEGMENTS + 5))];
    expect(out.map((x: any) => x.type)).toEqual([Entity.Type.TRIANGLES, Entity.Type.LINE_SEGMENTS]);
    expect(out[1].vertices).toHaveLength(6); // three edges of the closed boundary
    fills = 0;
    expect([...scene._DecomposeHatch(heavy("B1", DENSE_HATCH_SEGMENTS + 5))]).toHaveLength(2);
    expect(fills).toBe(0); // the pattern is not run again for a block copy
    expect(scene.cadSolidDenseHatchCount).toBe(2);
    expect(scene.cadDenseHatchCount ?? 0).toBe(0);
  });

  it("once the drawing has spent its pattern budget, keeps only small hatches", () => {
    const scene: any = new Scene();
    scene.cadHatchSegments = HATCH_BUDGET;
    expect([...scene._DecomposeHatch(hatch("C1", SMALL_HATCH_SEGMENTS))]).toHaveLength(SMALL_HATCH_SEGMENTS);
    expect([...scene._DecomposeHatch(heavy("C2", SMALL_HATCH_SEGMENTS + 1))]).toHaveLength(1); // outline only, not solid
    expect(scene.cadDenseHatchCount).toBe(1);
    expect(scene.cadSolidDenseHatchCount ?? 0).toBe(0);
  });
});
