import { describe, expect, it } from "vitest";
import { resolveMeasurePick, toleranceFor } from "./resolvePick";
import { buildMeasurementGeometry } from "../viewer/measurementGeometry";
import { initialMeasureState } from "./measureState";

const g = buildMeasurementGeometry({ entities: [
  { type: "LINE", layer: "A", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  { type: "LINE", layer: "B", vertices: [{ x: 30, y: -50 }, { x: 30, y: 90 }] },
] });
const settings = { ...initialMeasureState().settings, enabled: true };

describe("tap resolution (T16 3.1)", () => {
  it("18 px tolerance in drawing units", () => {
    expect(toleranceFor(2)).toBe(9);
    expect(toleranceFor(0)).toBe(0);
  });

  it("basic snap first, then intersection; hidden layers do not snap", () => {
    expect(resolveMeasurePick(g, settings, { x: 2, y: 1 }, 5)?.snap?.kind).toBe("endpoint");
    const x = resolveMeasurePick(g, settings, { x: 31, y: 1 }, 5);
    expect(x?.snap?.kind).toBe("intersection");
    expect(x?.point).toEqual({ x: 30, y: 0 });
    expect(resolveMeasurePick(g, settings, { x: 31, y: 1 }, 5, new Set(["B"]))?.snap).toBeNull();
  });

  it("perpendicular from the previous point, limited by the chosen kinds", () => {
    const s = { ...settings, points: [{ x: 60, y: 40 }] };
    expect(resolveMeasurePick(g, s, { x: 61, y: 2 }, 5)?.snap).toMatchObject({ kind: "perpendicular", x: 60, y: 0 });
    expect(resolveMeasurePick(g, { ...s, snapKinds: ["endpoint"] }, { x: 61, y: 2 }, 5)?.snap).toBeNull();
    expect(resolveMeasurePick(g, { ...s, snap: false }, { x: 2, y: 1 }, 5)).toEqual({ point: { x: 2, y: 1 }, snap: null, entity: null });
  });

  it("object mode picks the nearest object and never snaps", () => {
    const r = resolveMeasurePick(g, { ...settings, mode: "object" }, { x: 50, y: 1 }, 5);
    expect(r?.entity?.layer).toBe("A");
    expect(r?.snap).toBeNull();
    expect(resolveMeasurePick(g, settings, { x: Number.NaN, y: 0 }, 5)).toBeNull();
  });
});
