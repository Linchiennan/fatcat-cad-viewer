import { describe, expect, it } from "vitest";
import { distanceParts, isComplete, lengthTotal, resultValue, segmentLabels } from "./measureResults";

const sq = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }];

describe("continuous measuring", () => {
  it("labels each segment at its middle, closing the outline for an area", () => {
    expect(segmentLabels(sq, false)).toEqual([{ at: { x: 150, y: 0 }, length: 300 }, { at: { x: 300, y: 200 }, length: 400 }]);
    expect(segmentLabels(sq, true).map((s) => s.length)).toEqual([300, 400, 500]);
    expect(segmentLabels([{ x: 1, y: 1 }, { x: 1, y: 1 }], false)).toEqual([]);
  });

  it("splits a distance into horizontal and vertical parts", () => {
    expect(distanceParts([{ x: 10, y: 50 }, { x: -20, y: 10 }])).toEqual({ dx: 30, dy: 40 });
    expect(distanceParts([{ x: 0, y: 0 }])).toBeNull();
  });

  it("gives the value of kept results and totals the lengths", () => {
    const kept = [
      { mode: "distance" as const, points: sq.slice(0, 2) },
      { mode: "path" as const, points: sq },
      { mode: "area" as const, points: sq },
      { mode: "angle" as const, points: sq },
    ];
    expect(kept.map(resultValue)).toEqual([300, 700, 60000, 90]);
    expect(lengthTotal(kept)).toBe(1000);
    expect(isComplete({ mode: "area", points: sq.slice(0, 2) })).toBe(false);
  });
});

import { labelHeight } from "./measureResults";
describe("measurement label size follows the drawing", () => {
  it("uses the most common text height on the sheet, else the header dimension text height (A03: header 2.5)", () => {
    expect(labelHeight({ $DIMTXT: 2.5 }, [30, 30, 50, 30.0001, 12])).toBe(30);
    expect(labelHeight({ $DIMTXT: 2.5, $DIMSCALE: 10 }, [])).toBe(25);
    expect(labelHeight({ $DIMTXT: 3 }, [])).toBe(3);
    expect(labelHeight(undefined, [])).toBeNull();
  });
});

describe("measurement labels match the drawing's dimension numbers (A03 制水閥箱)", () => {
  it("prefers the drawn height of dimension text over common text and the header", () => {
    expect(labelHeight({ $DIMTXT: 0.18 }, [6, 6, 6], [18, 20, 19])).toBe(19);
    expect(labelHeight({}, [6, 6], [])).toBe(6);
  });
});
