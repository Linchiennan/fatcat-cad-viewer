import { describe, expect, it } from "vitest";
import { ocsAxes, projectObliqueEntity, projectObliquePlanes } from "./ocsPlane";

describe("entities in upright or tilted planes", () => {
  it("leaves plan entities alone, including mirrored ones", () => {
    expect(ocsAxes(undefined)).toBeNull();
    expect(ocsAxes({ x: 0, y: 0, z: 1 })).toBeNull();
    expect(ocsAxes({ x: 0, y: 0, z: -1 })).toBeNull();
    const list = [{ type: "LINE" }, { type: "LWPOLYLINE", extrusionDirection: { x: 0, y: 0, z: -1 }, vertices: [] }];
    expect(projectObliquePlanes(list)).toBe(list);
  });

  it("follows the arbitrary-axis algorithm", () => {
    // N = +Y: Ax = Wz × N = (-1,0,0), Ay = N × Ax = (0,0,1)
    const { ax, ay } = ocsAxes({ x: 0, y: 1, z: 0 })!;
    expect([ax.x, ax.y, ax.z]).toEqual([-1, 0, 0]);
    expect([ay.x, ay.y, ay.z].map((v) => v + 0)).toEqual([0, 0, 1]);
  });

  it("shows an upright profile edge-on, as CAD's plan view does (惠宇 A06 廚房: the sink's side profiles drew as two extra sinks)", () => {
    const [face, far, ...edges] = projectObliqueEntity({ type: "LWPOLYLINE", handle: "P", layer: "0", elevation: 32.29, depth: -1, extrusionDirection: { x: 0, y: 1, z: 0 }, shape: true,
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0, bulge: 1 }, { x: 10, y: 5 }, { x: 0, y: 5 }] })!;
    expect(face).toMatchObject({ type: "LWPOLYLINE", handle: "P", shape: true });
    expect(face.extrusionDirection).toBeUndefined();
    // every point sits on the plane's trace y = elevation, x mirrored
    for (const p of face.vertices) expect(p.y).toBeCloseTo(32.29, 9);
    expect(Math.min(...face.vertices.map((p: any) => p.x))).toBeCloseTo(-12.5, 6); // the bulge arc reaches 2.5 past x=10
    // the thickness moves the far face 1 along -Y and joins it at the four corners
    for (const p of far.vertices) expect(p.y).toBeCloseTo(31.29, 9);
    expect(edges).toHaveLength(4);
    expect(edges.map((e: any) => e.handle)).toEqual(["P~edge0", "P~edge1", "P~edge2", "P~edge3"]);
  });

  it("projects circles of a tilted plane to ellipses", () => {
    const s = Math.SQRT1_2, [ring] = projectObliqueEntity({ type: "CIRCLE", center: { x: 0, y: 0, z: 0 }, radius: 2, extrusionDirection: { x: 0, y: s, z: s } })!;
    const xs = ring.vertices.map((p: any) => p.x), ys = ring.vertices.map((p: any) => p.y);
    expect(Math.max(...xs)).toBeCloseTo(2, 6);
    expect(Math.max(...ys)).toBeCloseTo(2 * s, 2);
  });

  it("keeps 3D polylines and meshes, which are already in world coordinates", () => {
    expect(projectObliqueEntity({ type: "POLYLINE", is3dPolyline: true, extrusionDirection: { x: 1, y: 0, z: 0 }, vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).toBeNull();
  });
});
