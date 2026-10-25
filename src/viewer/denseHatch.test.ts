import { describe, expect, it } from "vitest";
import { Entity } from "dxf-viewer/src/DxfScene.js";
import { DENSE_HATCH_SEGMENTS, HATCH_BUDGET, SMALL_HATCH_SEGMENTS, installEngineeringScene } from "./engineering";

// A stand-in scene whose own hatch fill yields `n` segments, so the limits can be tried without real patterns.
const point = (x: number, y: number) => ({ x, y, clone() { return point(x, y); } });
let fills = 0;
class Scene {
  *_DecomposeHatch(e: any) { fills++; for (let i = 0; i < e.n; i++) yield new Entity({ type: Entity.Type.LINE_SEGMENTS, vertices: [point(i, 0), point(i + 1, 0)] }); }
  _GetHatchBoundaryLoops() { return [{ vertices: [point(0, 0), point(10, 0), point(10, 10)] }]; }
  _GetEntityExtrusionTransform() { return null; }
  _GetEntityLayer() { return "0"; }
  _GetEntityColor() { return 0xffffff; }
  _InterpolateSpline() { return [0, 0]; }
  async Build() { /* not used here */ }
}
installEngineeringScene(Scene);
const hatch = (handle: string, n: number) => ({ type: "HATCH", handle, patternName: "AR-CONC", patternScale: 0.1, n });

describe("hatches too dense to fill in time (上晴 B區-2 AR-CONC at scale 0.1)", () => {
  it("keeps the pattern of an ordinary hatch", () => {
    const scene: any = new Scene();
    expect([...scene._DecomposeHatch(hatch("A1", 50))]).toHaveLength(50);
    expect(scene.cadDenseHatchCount ?? 0).toBe(0);
  });

  it("draws a hatch past the per-hatch limit as its boundary, and its block copies without filling again", () => {
    const scene: any = new Scene();
    const out = [...scene._DecomposeHatch(hatch("B1", DENSE_HATCH_SEGMENTS + 5))];
    expect(out).toHaveLength(1);
    expect(out[0].vertices).toHaveLength(6); // three edges of the closed boundary
    fills = 0;
    expect([...scene._DecomposeHatch(hatch("B1", DENSE_HATCH_SEGMENTS + 5))]).toHaveLength(1);
    expect(fills).toBe(0);
    expect(scene.cadDenseHatchCount).toBe(2);
  });

  it("once the drawing has spent its pattern budget, keeps only small hatches", () => {
    const scene: any = new Scene();
    scene.cadHatchSegments = HATCH_BUDGET;
    expect([...scene._DecomposeHatch(hatch("C1", SMALL_HATCH_SEGMENTS))]).toHaveLength(SMALL_HATCH_SEGMENTS);
    expect([...scene._DecomposeHatch(hatch("C2", SMALL_HATCH_SEGMENTS + 1))]).toHaveLength(1);
    expect(scene.cadDenseHatchCount).toBe(1);
  });
});
