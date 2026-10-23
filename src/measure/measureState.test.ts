import { describe, expect, it } from "vitest";
import { canKeep, hasAnything, initialMeasureState, measureReducer, statusKey, toastKey, type MeasureAction, type MeasureState } from "./measureState";
import type { MeasurePick } from "../types/engine";
import type { MeasurableEntity, SnapKind } from "../viewer/measurementGeometry";

const tap = (x: number, y: number, snap: SnapKind | null = null, entity: MeasurableEntity | null = null): MeasureAction =>
  ({ type: "pick", pick: { point: { x, y }, snap, entity, screenY: 0, canvasHeight: 0 } satisfies MeasurePick });
const run = (...actions: MeasureAction[]) => actions.reduce(measureReducer, initialMeasureState());
const line: MeasurableEntity = { kind: "LINE", layer: "0", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], bounds: { minX: 0, minY: 0, maxX: 1, maxY: 0 }, length: 1, approximate: false };

describe("measuring rules (T16 3.2)", () => {
  it("starts closed in distance mode with snapping on and every snap kind", () => {
    const s = initialMeasureState().settings;
    expect(s).toMatchObject({ enabled: false, mode: "distance", snap: true, info: false, points: [], kept: [] });
    expect(s.snapKinds).toHaveLength(6);
  });

  it("distance: a third tap keeps the finished segment and starts the next", () => {
    const st = run({ type: "toggle-measure" }, tap(0, 0), tap(3, 4), tap(10, 10));
    expect(st.settings.kept).toEqual([{ mode: "distance", points: [{ x: 0, y: 0 }, { x: 3, y: 4 }] }]);
    expect(st.settings.points).toEqual([{ x: 10, y: 10 }]);
  });

  it("angle keeps only a complete angle; path stops at 256 points", () => {
    let st = run({ type: "toggle-measure" }, { type: "mode", mode: "angle" }, tap(1, 0), tap(0, 0), tap(0, 1), tap(5, 5));
    expect(st.settings.kept).toHaveLength(1);
    st = run({ type: "toggle-measure" }, { type: "mode", mode: "angle" }, tap(0, 0), tap(0, 0), tap(0, 1), tap(5, 5));
    expect(st.settings.kept).toHaveLength(0);
    st = run({ type: "toggle-measure" }, { type: "mode", mode: "path" });
    for (let i = 0; i < 300; i++) st = measureReducer(st, tap(i, 0));
    expect(st.settings.points).toHaveLength(256);
  });

  it("keeps at most 50 results, dropping the oldest", () => {
    let st = run({ type: "toggle-measure" });
    for (let i = 0; i < 53; i++) st = [tap(i, 0), tap(i, 1), { type: "keep" } as MeasureAction].reduce(measureReducer, st);
    expect(st.settings.kept).toHaveLength(50);
    expect(st.settings.kept[0].points[0].x).toBe(3);
  });

  it("keep needs a complete result; phone undo takes back points, then kept results", () => {
    let st = run({ type: "toggle-measure" }, tap(0, 0));
    expect(canKeep(st.settings)).toBe(false);
    st = [tap(1, 0), { type: "keep" } as MeasureAction].reduce(measureReducer, st);
    expect(st.settings.kept).toHaveLength(1);
    expect(hasAnything(st.settings)).toBe(true);
    st = [tap(5, 5), { type: "undo" } as MeasureAction].reduce(measureReducer, st);
    expect(st.settings.points).toEqual([]);
    expect(st.settings.kept).toHaveLength(1);
    st = measureReducer(st, { type: "undo" });
    expect(st.settings.kept).toHaveLength(0);
  });

  it("panel undo only takes points; restart keeps kept results; clear-all empties everything", () => {
    let st = run({ type: "toggle-measure" }, tap(0, 0), tap(1, 0), { type: "keep" }, tap(4, 4));
    st = measureReducer(st, { type: "undo-point" });
    expect(st.settings.points).toEqual([]);
    st = measureReducer(st, { type: "undo-point" });
    expect(st.settings.kept).toHaveLength(1);
    st = [tap(2, 2), { type: "restart" } as MeasureAction].reduce(measureReducer, st);
    expect(st.settings.points).toEqual([]);
    expect(st.settings.kept).toHaveLength(1);
    st = measureReducer(st, { type: "clear-all" });
    expect(hasAnything(st.settings)).toBe(false);
  });

  it("changing mode clears points and object but not kept results", () => {
    const st = run({ type: "toggle-measure" }, tap(0, 0), tap(1, 0), tap(2, 0), { type: "mode", mode: "area" });
    expect(st.settings.points).toEqual([]);
    expect(st.settings.kept).toHaveLength(1);
  });

  it("a new sheet clears points, the object and kept results (待決 A-1)", () => {
    const st = run({ type: "toggle-measure" }, tap(0, 0), tap(1, 0), tap(2, 0), { type: "sheet-ready" });
    expect(st.settings).toMatchObject({ enabled: true, points: [], kept: [] });
  });

  it("object mode picks or reports nothing nearby", () => {
    let st = run({ type: "toggle-measure" }, { type: "mode", mode: "object" }, tap(0, 0, null, line));
    expect(st.entity).toBe(line);
    expect(st.status).toBe("plane");
    st = measureReducer(st, tap(9, 9));
    expect(st.entity).toBeNull();
    expect(statusKey(st.status)).toBe("measure.noObject");
  });

  it("snaps set the panel status and count toast events (same kind twice = two events)", () => {
    const st = run({ type: "toggle-measure" }, tap(0, 0, "midpoint"), tap(1, 0, "midpoint"));
    expect(st.toast).toEqual({ kind: "midpoint", serial: 2 });
    expect(statusKey(st.status)).toBe("measure.snapped.midpoint");
    expect(toastKey("midpoint")).toBe("snap.toast.midpoint");
    expect(measureReducer(st, tap(3, 3)).status).toBe("plane");
  });

  it("info mode: object picks only; measure from info switches to distance; closing info restores the mode", () => {
    let st: MeasureState = run({ type: "toggle-measure" }, { type: "mode", mode: "path" }, { type: "toggle-measure" }, { type: "toggle-info" });
    expect(st.settings).toMatchObject({ enabled: true, info: true, mode: "object" });
    st = measureReducer(st, tap(0, 0, "endpoint", line));
    expect(st.entity).toBe(line);
    expect(st.toast).toBeNull();
    const closed = measureReducer(st, { type: "toggle-info" });
    expect(closed.settings).toMatchObject({ enabled: false, info: false, mode: "path" });
    const measuring = measureReducer(st, { type: "toggle-measure" });
    expect(measuring.settings).toMatchObject({ enabled: true, info: false, mode: "distance", points: [] });
    expect(measuring.entity).toBeNull();
  });

  it("opening and closing measure keeps mode, points and kept results", () => {
    const st = run({ type: "toggle-measure" }, { type: "mode", mode: "area" }, tap(0, 0), { type: "toggle-measure" }, { type: "toggle-measure" });
    expect(st.settings).toMatchObject({ enabled: true, mode: "area", points: [{ x: 0, y: 0 }] });
    expect(run({ type: "toggle-measure" }, tap(0, 0), { type: "reset" })).toEqual(initialMeasureState());
  });

  it("ignores taps while closed and non-finite points", () => {
    expect(run(tap(0, 0)).settings.points).toEqual([]);
    expect(run({ type: "toggle-measure" }, tap(Number.NaN, 0)).settings.points).toEqual([]);
  });
});
