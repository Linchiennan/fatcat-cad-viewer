import { describe, expect, it } from "vitest";
import { generationMirror } from "./textGeneration";

const run = (e: object, pts: { x: number; y: number }[]) =>
  [...generationMirror(e, [{ vertices: pts }])][0].vertices.map((p: { x: number; y: number }) => ({ x: +p.x.toFixed(6), y: +p.y.toFixed(6) }));

describe("TEXT generation flags on outline / bundled fonts (11F 給水放樣 「H:45cm」)", () => {
  it("leaves plain text alone", () => {
    expect(run({ startPoint: { x: 0, y: 0 } }, [{ x: 3, y: 1 }])).toEqual([{ x: 3, y: 1 }]);
  });
  it("backward mirrors across the line through the anchor square to the baseline", () => {
    expect(run({ startPoint: { x: 10, y: 0 }, textGenerationFlag: 2 }, [{ x: 13, y: 1 }])).toEqual([{ x: 7, y: 1 }]);
  });
  it("upside down mirrors across the baseline", () => {
    expect(run({ startPoint: { x: 0, y: 5 }, textGenerationFlag: 4 }, [{ x: 3, y: 6 }])).toEqual([{ x: 3, y: 4 }]);
  });
  it("180° with both flags reads upright, to the right of the anchor", () => {
    // drawn at 180° the glyph sits left of and below the anchor; flags 6 turn it back
    expect(run({ startPoint: { x: 0, y: 0 }, rotation: 180, textGenerationFlag: 6 }, [{ x: -3, y: -1 }])).toEqual([{ x: 3, y: 1 }]);
  });
});
