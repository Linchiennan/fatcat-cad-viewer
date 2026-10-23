import { describe, expect, it } from "vitest";
import { DxfScene } from "dxf-viewer/src/DxfScene.js";
import {
  basicSnap, buildMeasurementGeometry, convertMeasurement, installMeasurementPreparation, measuredAngle,
  nearestEntity, pathLength, polygonArea, unitFromInsunits, type SnapPoint,
} from "./measurementGeometry";
import { advancedSnap } from "./engineering";
import { fixedNumber, formatMeasure } from "./measureFormat";

const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe("plain measurement values (T16 9-3)", () => {
  it("distance, path and perimeter", () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
    expect(pathLength(sq)).toBe(30);
    expect(pathLength(sq, true)).toBe(40);
  });
  it("area is translation safe", () => {
    expect(polygonArea(sq)).toBe(100);
    expect(polygonArea([...sq].reverse())).toBe(100);
    expect(polygonArea(sq.map((p) => ({ x: p.x + 1e7, y: p.y + 1e7 })))).toBe(100);
  });
  it("angle 0–180 with null for a zero arm", () => {
    expect(measuredAngle([{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }])).toBeCloseTo(90, 12);
    expect(measuredAngle([{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(0);
    expect(measuredAngle([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull();
    expect(measuredAngle([{ x: 1, y: 0 }, { x: 0, y: 0 }])).toBeNull();
  });
  it("units and conversion", () => {
    expect([1, 2, 4, 5, 6, 0, 3, undefined, "4"].map(unitFromInsunits)).toEqual(["in", "ft", "mm", "cm", "m", "drawing", "drawing", "drawing", "mm"]);
    expect(convertMeasurement(100, "mm", "cm")).toBeCloseTo(10, 12);
    expect(convertMeasurement(1, "m", "cm", true)).toBeCloseTo(10000, 8);
    expect(convertMeasurement(7, "drawing", "cm")).toBe(7);
    expect(convertMeasurement(7, "mm", "drawing", true)).toBe(7);
  });
  it("formats with half away from zero and thousands", () => {
    expect(formatMeasure(1017.88, "cm", "cm", 1, true)).toBe("1,017.9 cm²");
    expect(fixedNumber(0.25, 1)).toBe("0.3");
  });
});

describe("measurement index", () => {
  it("polyline bulges: semicircle length π, closed area includes the segment", () => {
    const open = buildMeasurementGeometry({ entities: [{ type: "LWPOLYLINE", vertices: [{ x: -1, y: 0, bulge: 1 }, { x: 1, y: 0 }] }] });
    expect(open.entities[0].length).toBeCloseTo(Math.PI, 12);
    expect(open.entities[0].approximate).toBe(false);
    const closed = buildMeasurementGeometry({ entities: [{ type: "LWPOLYLINE", shape: true, vertices: [{ x: -1, y: 0, bulge: 1 }, { x: 1, y: 0 }] }] });
    expect(closed.entities[0].area).toBeCloseTo(Math.PI / 2, 12);
    expect(closed.entities[0].length).toBeCloseTo(Math.PI + 2, 12);
    // arc midpoint snap of the bulge
    expect(closed.snaps.some((s) => s.kind === "midpoint" && Math.abs(s.x) < 1e-12 && Math.abs(Math.abs(s.y) - 1) < 1e-12)).toBe(true);
  });

  it("circle, arc and ellipse snaps, lengths and areas", () => {
    const g = buildMeasurementGeometry({ header: { $INSUNITS: 4 }, entities: [
      { type: "CIRCLE", center: { x: 0, y: 0 }, radius: 2, layer: "C" },
      { type: "ARC", center: { x: 10, y: 0 }, radius: 1, startAngle: 0, endAngle: Math.PI / 2 },
      { type: "ELLIPSE", center: { x: 20, y: 0 }, majorAxisEndPoint: { x: 4, y: 0 }, axisRatio: 0.5 },
    ] });
    expect(g.unit).toBe("mm");
    const [c, a, e] = g.entities;
    expect(c.length).toBeCloseTo(4 * Math.PI, 12);
    expect(c.area).toBeCloseTo(4 * Math.PI, 12);
    expect(a.length).toBeCloseTo(Math.PI / 2, 12);
    expect(e.approximate).toBe(true);
    expect(e.area).toBeCloseTo(Math.PI * 16 * 0.5, 9);
    const kinds = (x: number, y: number) => g.snaps.filter((s) => Math.hypot(s.x - x, s.y - y) < 1e-9).map((s) => s.kind);
    expect(kinds(0, 0)).toContain("center");
    expect(kinds(2, 0)).toContain("quadrant");
    expect(kinds(11, 0)).toEqual(expect.arrayContaining(["endpoint", "quadrant"]));
    expect(kinds(9, 0)).toEqual([]); // 180° is outside the quarter arc
    expect(kinds(20, 2)).toContain("quadrant");
    expect(g.snaps.every((s, i) => i === 0 || g.snaps[i - 1].x <= s.x)).toBe(true);
    expect(g.snaps.find((s) => s.kind === "center")?.layer).toBe("C");
  });

  it("INSERT transform, block chain with attributes, nested limits and skipped objects", () => {
    const doc = {
      tables: { layer: { layers: { OFF: { name: "OFF", visible: false } } } },
      blocks: {
        B: { name: "B", position: { x: 1, y: 0 }, entities: [{ type: "LINE", vertices: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }, { type: "INSERT", name: "B" }] },
      },
      entities: [
        { type: "INSERT", name: "B", handle: "I1", layer: "L1", position: { x: 10, y: 10 }, xScale: 2, yScale: 2, rotation: 90 },
        { type: "ATTRIB", ownerHandle: "I1", tag: "NO", text: "A-1", startPoint: { x: 10, y: 10 }, textHeight: 1 },
        { type: "INSERT", name: "B", position: { x: 0, y: 0 }, columnCount: 2 },
        { type: "LINE", layer: "OFF", vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
        { type: "LINE", vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }], extrusionDirection: { x: 1, y: 0, z: 0 } },
      ],
    };
    const g = buildMeasurementGeometry(doc);
    const line = g.entities.find((e) => e.kind === "LINE")!;
    expect(line.length).toBeCloseTo(2, 12);
    expect(line.points[0].x).toBeCloseTo(10, 12);
    expect(line.points[1].y).toBeCloseTo(12, 12);
    expect(line.layer).toBe("L1");
    expect(line.blockChain).toEqual([{ name: "B", layer: "L1", attributes: [{ tag: "NO", text: "A-1" }] }]);
    expect(g.entities.filter((e) => e.kind === "LINE")).toHaveLength(1);
    const attrib = g.entities.find((e) => e.kind === "ATTRIB")!;
    expect(attrib.propertiesOnly).toBe(true);
    expect(nearestEntity(g.entities, { x: 10.5, y: 10.5 }, 0.01)).toBe(attrib);
  });

  it("XCLIP over 256 points is refused, not replaced by its box", () => {
    const poly = Array.from({ length: 300 }, (_, i) => `${100 * Math.cos(i / 300 * 2 * Math.PI)},${100 * Math.sin(i / 300 * 2 * Math.PI)}`).join(";");
    const g = buildMeasurementGeometry({ blocks: { B: { name: "B", entities: [{ type: "LINE", vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] } },
      entities: [{ type: "INSERT", name: "B", position: { x: 0, y: 0 }, xdata: { FATCAT_XCLIP: { values: [{ code: 1000, value: poly }] } } }] });
    expect(g.entities).toHaveLength(0);
    expect(g.snaps).toHaveLength(0);
    expect(g.completeBounds).toBe(false);
  });

  it("dimension blocks become property-only parts with endpoint snaps and the drawn text", () => {
    const g = buildMeasurementGeometry({
      blocks: { "*D1": { name: "*D1", entities: [
        { type: "LINE", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
        { type: "MTEXT", text: "100", position: { x: 40, y: 10 }, height: 5 },
      ] } },
      entities: [{ type: "DIMENSION", block: "*D1", handle: "D", text: "" }],
    });
    expect(g.entities.every((e) => e.kind === "DIMENSION" && e.propertiesOnly && e.length === 0)).toBe(true);
    expect(g.entities.every((e) => e.properties?.text === "100" && e.properties?.handle === "D")).toBe(true);
    expect(g.entities[1].points).toHaveLength(5);
    expect(g.snaps.map((s) => s.kind)).toEqual(["endpoint", "midpoint", "endpoint"]);
    expect(advancedSnap(g.entities, { x: 50, y: 0 }, 1, { x: 50, y: 30 })).toBeNull();
  });

  it("limits stop the index and mark it", () => {
    const entities = Array.from({ length: 100_001 }, (_, i) => ({ type: "LINE", vertices: [{ x: i, y: 0 }, { x: i, y: 1 }] }));
    const g = buildMeasurementGeometry({ entities });
    expect(g.limited).toBe(true);
    expect(g.fitComplete).toBe(false);
    expect(g.entities.length).toBeLessThanOrEqual(100_000);
  });
});

describe("snaps (T16 3.1)", () => {
  const snaps: SnapPoint[] = [{ x: 0, y: 0, kind: "endpoint" }, { x: 5, y: 0, kind: "midpoint" }];
  it("tolerance boundary: 17 px in, 19 px out with an 18 px tolerance", () => {
    const unitsPerPx = 0.5, tol = 18 * unitsPerPx;
    expect(basicSnap(snaps, { x: 17 * unitsPerPx, y: 30 }, tol, [])).toBeNull();
    expect(basicSnap([{ x: 0, y: 0, kind: "endpoint" }], { x: 17 * unitsPerPx, y: 0 }, tol, [])?.kind).toBe("endpoint");
    expect(basicSnap([{ x: 0, y: 0, kind: "endpoint" }], { x: 19 * unitsPerPx, y: 0 }, tol, [])).toBeNull();
  });
  it("only allowed kinds; empty list means every kind", () => {
    expect(basicSnap(snaps, { x: 1, y: 0 }, 10, ["midpoint"])?.kind).toBe("midpoint");
    expect(basicSnap(snaps, { x: 1, y: 0 }, 10, [])?.kind).toBe("endpoint");
    expect(basicSnap(snaps, { x: Number.NaN, y: 0 }, 10, [])).toBeNull();
  });
  it("basic snaps come before a closer intersection (待決 10)", () => {
    const g = buildMeasurementGeometry({ entities: [
      { type: "LINE", vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { type: "LINE", vertices: [{ x: 1, y: -5 }, { x: 1, y: 9 }] },
    ] });
    const target = { x: 0.8, y: 0 };
    expect(advancedSnap(g.entities, target, 2)?.kind).toBe("intersection");
    expect(basicSnap(g.snaps, target, 2, [])?.kind).toBe("endpoint");
  });
});

describe("scene preparation", () => {
  it("leaves the index and drops parsed objects", async () => {
    class S extends DxfScene {}
    installMeasurementPreparation(S);
    installMeasurementPreparation(S); // idempotent
    const d: any = { entities: [{ type: "LINE", handle: "L", layer: "0", vertices: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }] };
    await new S().Build(d, []);
    expect(d.cadMeasurement.entities[0].length).toBe(5);
    expect(d.cadMeasurement.entities[0].properties.handle).toBe("L");
    expect(Object.keys(d)).toEqual(["cadMeasurement"]);
  });
});

describe("arc quadrants at the arc ends", () => {
  it("count a quadrant that float noise puts just past the end", () => {
    const g = buildMeasurementGeometry({ entities: [{ type: "ARC", center: { x: 0, y: 0 }, radius: 1, startAngle: Math.PI / 4, endAngle: Math.PI / 2 - 1.5e-11 }] });
    expect(g.snaps.filter((s) => s.kind === "quadrant")).toHaveLength(1);
  });
});
