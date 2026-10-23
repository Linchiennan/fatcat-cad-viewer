import { describe, expect, it, beforeEach } from "vitest";
import { arrowHead, loadMarks, MARK_COLORS, saveMarks, shareFileName, squareBox, thinStroke, type Mark } from "./markup";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
});

describe("markups", () => {
  it("are saved per drawing and sheet and read back", () => {
    const marks: Mark[] = [
      { kind: "pen", color: "#ff3b30", points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] },
      { kind: "rect", color: "#ffd60a", points: [{ x: 1, y: 1 }, { x: 4, y: 3 }] },
      { kind: "text", color: "#0a84ff", at: { x: 2, y: 2 }, text: "此處漏水", size: 30 },
      { kind: "circle", color: "#34c759", points: [{ x: 5, y: 5 }, { x: 9, y: 7 }] },
      { kind: "pen", color: "#af52de", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, // straight line
      { kind: "arrow", color: "#ff9500", points: [{ x: 0, y: 0 }, { x: 8, y: 0 }] },
    ];
    expect(saveMarks("abc:space:配置1", marks)).toBe(true);
    expect(loadMarks("abc:space:配置1")).toEqual(marks);
    expect(loadMarks("abc")).toEqual([]);
    saveMarks("abc:space:配置1", []);
    expect(store.size).toBe(0);
  });

  it("ignores broken saved data instead of failing to open the drawing", () => {
    store.set("k:markup", JSON.stringify([{ kind: "pen", color: "#f00", points: [{ x: 0 }] }, { kind: "text", color: "#f00", at: { x: 1, y: 1 }, text: "", size: 1 }, { kind: "rect", color: "#f00", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]));
    expect(loadMarks("k").map((m) => m.kind)).toEqual(["rect"]);
    store.set("k:markup", "{not json");
    expect(loadMarks("k")).toEqual([]);
  });

  it("offers nine colours, three per page", () => {
    expect(MARK_COLORS).toHaveLength(9);
    expect(new Set(MARK_COLORS.map((c) => c.value)).size).toBe(9);
    expect(MARK_COLORS[0].value).toBe("#ff3b30"); // red stays the first (default) colour
    expect(MARK_COLORS.slice(0, 3).map((c) => c.name)).toEqual(["紅", "綠", "藍"]); // first page: red, green, blue
  });

  it("makes a dragged box square for 正圓, keeping the drag direction", () => {
    expect(squareBox({ x: 0, y: 0 }, { x: 10, y: -4 })).toEqual([{ x: 0, y: 0 }, { x: 10, y: -10 }]);
    expect(squareBox({ x: 5, y: 5 }, { x: 2, y: 9 })).toEqual([{ x: 5, y: 5 }, { x: 1, y: 9 }]);
  });

  it("puts the arrow head at the end it points to", () => {
    const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 16);
    expect(l.x).toBeLessThan(100); expect(r.x).toBeLessThan(100);
    expect(Math.sign(l.y)).toBe(-Math.sign(r.y));
    expect(Math.hypot(100 - l.x, l.y)).toBeCloseTo(16);
  });

  it("thins a freehand stroke but keeps its end", () => {
    const pts = [0, 0.2, 0.4, 1.2, 1.3, 3].map((x) => ({ x, y: 0 }));
    expect(thinStroke(pts, 1).map((p) => p.x)).toEqual([0, 1.2, 3]);
  });

  it("names the shared picture after the drawing and time", () => {
    expect(shareFileName("t4-鴻群差異註解.dwg", new Date(2026, 9, 22, 9, 5))).toBe("標註_t4-鴻群差異註解_20261022-0905.png");
    expect(shareFileName("a/b:c.dwg", new Date(2026, 0, 1, 0, 0))).toBe("標註_a_b_c_20260101-0000.png");
  });
});
