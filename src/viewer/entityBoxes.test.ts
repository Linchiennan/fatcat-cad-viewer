import { describe, expect, it } from "vitest";
import { installEntityBoxes } from "./entityBoxes";

// A stand-in scene: top-level entities report their drawn points through _UpdateBounds; block definitions do not.
class Scene {
  cadBoxes: Record<string, number[]> | null = null;
  bounds: number[] = [];
  _UpdateBounds(v: { x: number; y: number }) { this.bounds.push(v.x, v.y); }
  _ProcessDxfEntity(e: { pts: { x: number; y: number }[] }, ctx: unknown = null) { if (!ctx) for (const p of e.pts) this._UpdateBounds(p); }
}
installEntityBoxes(Scene.prototype);

describe("entity boxes for scripted ZWCAD comparisons (debug only)", () => {
  it("records nothing unless asked", () => {
    const s = new Scene();
    s._ProcessDxfEntity({ handle: "A", pts: [{ x: 1, y: 2 }] } as never);
    expect(s.cadBoxes).toBeNull();
    expect(s.bounds).toEqual([1, 2]);
  });
  it("keeps one box per top-level handle, block definitions left out", () => {
    const s = new Scene();
    s.cadBoxes = {};
    s._ProcessDxfEntity({ handle: "187EA", pts: [{ x: 3, y: 1 }, { x: -1, y: 4 }] } as never);
    s._ProcessDxfEntity({ handle: "B", pts: [{ x: 9, y: 9 }] } as never, {});
    expect(s.cadBoxes).toEqual({ "187EA": [-1, 1, 3, 4] });
  });
});
