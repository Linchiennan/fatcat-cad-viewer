import { describe, expect, it } from "vitest";
import { clipBoundary, selectCadSpace } from "./cadDocument";
import { parseDxfXclip } from "../dwg/xclipMetadata";

const viewport = (extra: Record<string, unknown> = {}) => ({
  type: "VIEWPORT", handle: "VP", layer: "0", cadSpace: "P", inPaperSpace: true, id: 2, status: 1, flags: 65536, clipHandle: "CL",
  width: 10, height: 10, viewHeight: 10, position: { x: 5, y: 5, z: 0 }, viewCenter: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 }, twist: 0, frozen: [], ...extra,
});
const square = { type: "LWPOLYLINE", handle: "CL", layer: "0", cadSpace: "P", inPaperSpace: true, shape: true,
  vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] };

describe("object-clipped layout viewports", () => {
  it("reads a closed polyline boundary as its vertices", () => {
    expect(clipBoundary(square)).toEqual(square.vertices);
  });

  it("subdivides bulge arcs onto the true circle", () => {
    // Two half-circle bulges make a full circle of radius 1 around (1,0).
    const ring = clipBoundary({ type: "LWPOLYLINE", vertices: [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0, bulge: 1 }] })!;
    expect(ring.length).toBeGreaterThan(8);
    for (const p of ring) expect(Math.hypot(p.x - 1, p.y)).toBeCloseTo(1, 6);
    expect(ring.some((p) => p.y < -0.5) && ring.some((p) => p.y > 0.5)).toBe(true);
  });

  it("approximates circle boundaries and rejects unsupported objects", () => {
    const ring = clipBoundary({ type: "CIRCLE", center: { x: 3, y: 4 }, radius: 2 })!;
    expect(ring).toHaveLength(48);
    for (const p of ring) expect(Math.hypot(p.x - 3, p.y - 4)).toBeCloseTo(2, 9);
    expect(clipBoundary({ type: "SPLINE" })).toBeNull();
  });

  it("clips the viewport by the boundary transformed into model coordinates", () => {
    const doc = { entities: [{ type: "LINE", handle: "M", layer: "0", cadSpace: "Model" }, square, viewport()], blocks: {}, tables: {} };
    const paper = selectCadSpace(doc, "P");
    const insert = paper.entities.find((e: any) => e.type === "INSERT");
    expect(insert).toBeTruthy();
    expect(paper.blocks[insert.name].entities.map((e: any) => e.handle)).toEqual(["M"]);
    expect(parseDxfXclip(insert)).toEqual([{ x: -5, y: -5 }, { x: -1, y: -5 }, { x: -1, y: -1 }, { x: -5, y: -1 }]);
    expect(paper.cadDiagnostics).toEqual([]);
  });

  it("still explains a viewport whose boundary object is missing", () => {
    const paper = selectCadSpace({ entities: [viewport({ clipHandle: "GONE" })], blocks: {}, tables: {} }, "P");
    expect(paper.entities.some((e: any) => e.type === "INSERT")).toBe(false);
    expect(paper.cadDiagnostics.join()).toContain("找不到裁切邊界物件");
  });
});
