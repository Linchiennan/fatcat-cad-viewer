import { describe, expect, it } from "vitest";
import { labelSize, overlayModel, searchBox, snapMarkPath } from "./overlayModel";
import { applyMarkEdit } from "./marks";
import { initialMeasureState } from "../measure/measureState";
import type { Mark } from "../viewer/markup";

// 1 drawing unit = 2 px, y down.
const project = (pts: readonly { x: number; y: number }[]) => pts.map((p) => ({ x: p.x * 2, y: 100 - p.y * 2 }));
const base = { ...initialMeasureState().settings, enabled: true };

describe("measuring overlay (T15 2.2)", () => {
  it("label size follows the drawing within 14–400 px", () => {
    expect(labelSize(10, 2)).toBe(20);
    expect(labelSize(1, 2)).toBe(14);
    expect(labelSize(1000, 2)).toBe(400);
    expect(labelSize(null, 2)).toBe(14);
  });

  it("current distance: dots, one label at the middle raised by 0.35 × size", () => {
    const m = overlayModel({ settings: { ...base, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] }, entity: null, project, labelPx: 20, label: (l) => `${l} cm` });
    expect(m.current?.dots).toEqual([{ x: 0, y: 100 }, { x: 60, y: 100 }]);
    expect(m.current?.labels).toEqual([{ x: 30, y: 93, text: "30 cm", size: 20, stroke: 4, seg: { a: { x: 0, y: 100 }, b: { x: 60, y: 100 } } }]);
    expect(m.current?.closed).toBe(false);
  });

  it("area labels closing side and area; angle labels degrees; zero length gets none", () => {
    const tri = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }];
    expect(overlayModel({ settings: { ...base, mode: "area", points: tri }, entity: null, project, labelPx: 14, label: String }).current?.labels.map((l) => l.text)).toEqual(["3", "4", "5", "面積 6"]);
    expect(overlayModel({ settings: { ...base, mode: "angle", points: tri }, entity: null, project, labelPx: 14, label: String }).current?.labels.map(l=>l.text)).toEqual(["90°"]);
    expect(overlayModel({ settings: { ...base, points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }, entity: null, project, labelPx: 14, label: String }).current?.labels).toEqual([]);
  });

  it("kept results remain drawn while measuring, in info mode and when closed", () => {
    const kept = [{ mode: "distance" as const, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }];
    expect(overlayModel({ settings: { ...base, kept }, entity: null, project, labelPx: 14, label: String }).kept).toHaveLength(1);
    expect(overlayModel({ settings: { ...base, kept, info: true, mode: "object" }, entity: null, project, labelPx: 14, label: String }).kept).toHaveLength(1);
    expect(overlayModel({ settings: { ...base, kept, enabled: false }, entity: null, project, labelPx: 14, label: String }).kept).toHaveLength(1);
  });

  it("object mode draws the picked outline only", () => {
    const entity = { kind: "LINE", layer: "0", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], bounds: { minX: 0, minY: 0, maxX: 5, maxY: 0 }, length: 5, approximate: false };
    const m = overlayModel({ settings: { ...base, mode: "object", points: [{ x: 9, y: 9 }] }, entity, project, labelPx: 14, label: String });
    expect(m.outline).toEqual([{ x: 0, y: 100 }, { x: 10, y: 100 }]);
    expect(m.current).toBeNull();
  });

  it("search box is the projected hit grown by 6 px", () => {
    expect(searchBox({ minX: 0, minY: 0, maxX: 10, maxY: 5 }, project)).toEqual({ left: -6, top: 84, width: 32, height: 22 });
  });

  it("snap markers have a shape per kind", () => {
    expect(snapMarkPath("endpoint", 10, 10)).toBe("M1.0 1.0H19.0V19.0H1.0Z");
    expect(new Set((["endpoint", "midpoint", "center", "quadrant", "intersection", "perpendicular"] as const).map((k) => snapMarkPath(k, 0, 0))).size).toBe(6);
  });
});

describe("text markups from the App (T15 2.3-7/8)", () => {
  const marks: Mark[] = [{ kind: "pen", color: "#ff3b30", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }];
  it("adds trimmed text, ignores blank text", () => {
    const next = applyMarkEdit(marks, { add: { at: { x: 1, y: 2 }, text: "  漏水 ", color: "#ff3b30", size: 9, width: 0 } });
    expect(next[1]).toEqual({ kind: "text", color: "#ff3b30", at: { x: 1, y: 2 }, text: "漏水", size: 9 });
    expect(applyMarkEdit(marks, { add: { at: { x: 1, y: 2 }, text: "   ", color: "#ff3b30", size: 9 } })).toBe(marks);
    expect(applyMarkEdit(marks, { add: { at: { x: 1, y: 2 }, text: "a", color: "#ff3b30", size: 0 } })).toBe(marks);
  });
  it("edits text; empty text deletes it; other marks are not text", () => {
    const withText = applyMarkEdit(marks, { add: { at: { x: 0, y: 0 }, text: "a", color: "#000", size: 1, width: 5 } });
    expect(applyMarkEdit(withText, { edit: { index: 1, text: "b" } })[1]).toMatchObject({ text: "b", width: 5 });
    expect(applyMarkEdit(withText, { edit: { index: 1, text: " " } })).toHaveLength(1);
    expect(applyMarkEdit(withText, { edit: { index: 0, text: "x" } })).toBe(withText);
  });
});
