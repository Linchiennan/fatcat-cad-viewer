import { describe, expect, it } from "vitest";
import { decodeAcis, expandRegions, regionOutline } from "./acisRegion";

// 惠宇 W02 污水系統配置示意圖（DWG 2004）第一個面域：4 條直線＋4 個 1/4 圓角的圓角矩形（4.13 × 1.34）。
// ZWCAD 畫得出來，App 以前只列「未支援物件 REGION」。原文存在群組碼 1，每字元 c 存成 159 - c、「^」存成「^ 」。
const SAT = [
  "20800 0 2 0",
  "16 Autodesk AutoCAD 19 ASM 219.0.0.5600 NT 24 Sun Oct 11 15:55:00 2020",
  "1 1e-06 1e-10",
  "asmheader $-1 $-1 12 219.0.0.5600 #",
  "body $-1 $-1 $-1 $2 $-1 $-1 #",
  "lump $-1 $-1 $-1 $-1 $3 $1 #",
  "shell $-1 $-1 $-1 $-1 $-1 $4 $-1 $2 #",
  "face $-1 $-1 $-1 $-1 $5 $3 $-1 $6 forward double out #",
  "loop $-1 $-1 $-1 $-1 $7 $4 #",
  "plane-surface $-1 $-1 $-1 13921.6 -8176.64 0 0 0 1 0.1 0 0 F F F F F #",
  "coedge $-1 $-1 $-1 $8 $9 $-1 $10 F $5 $-1 #",
  "coedge $-1 $-1 $-1 $11 $7 $-1 $12 F $5 $-1 #",
  "coedge $-1 $-1 $-1 $7 $13 $-1 $14 F $5 $-1 #",
  "edge $-1 $-1 $-1 $15 0 $16 40.3 $7 $17 forward 7 unknown #",
  "coedge $-1 $-1 $-1 $18 $8 $-1 $19 F $5 $-1 #",
  "edge $-1 $-1 $-1 $16 -1.5708 $20 0 $8 $21 forward 7 unknown #",
  "coedge $-1 $-1 $-1 $9 $22 $-1 $23 F $5 $-1 #",
  "edge $-1 $-1 $-1 $24 -3.14159 $15 -1.5708 $9 $25 forward 7 unknown #",
  "vertex $-1 $-1 $-1 $10 $26 #",
  "vertex $-1 $-1 $-1 $10 $27 #",
  "straight-curve $-1 $-1 $-1 13919.6 -8177.31 0 0.1 0 0 F F #",
  "coedge $-1 $-1 $-1 $28 $11 $-1 $29 F $5 $-1 #",
  "edge $-1 $-1 $-1 $20 0 $30 12.4 $11 $31 forward 7 unknown #",
  "vertex $-1 $-1 $-1 $12 $32 #",
  "ellipse-curve $-1 $-1 $-1 13923.6 -8177.26 0 0 0 1 0.05 0 0 1 F F #",
  "coedge $-1 $-1 $-1 $13 $28 $-1 $33 F $5 $-1 #",
  "edge $-1 $-1 $-1 $34 0 $24 12.4 $13 $35 forward 7 unknown #",
  "vertex $-1 $-1 $-1 $23 $36 #",
  "ellipse-curve $-1 $-1 $-1 13919.6 -8177.26 0 0 0 1 0.05 0 0 1 F F #",
  "point $-1 $-1 $-1 13919.6 -8177.31 0 #",
  "point $-1 $-1 $-1 13923.6 -8177.31 0 #",
  "coedge $-1 $-1 $-1 $22 $18 $-1 $37 F $5 $-1 #",
  "edge $-1 $-1 $-1 $30 0 $38 1.5708 $18 $39 forward 7 unknown #",
  "vertex $-1 $-1 $-1 $19 $40 #",
  "straight-curve $-1 $-1 $-1 13923.7 -8177.26 0 0 0.1 0 F F #",
  "point $-1 $-1 $-1 13923.7 -8177.26 0 #",
  "edge $-1 $-1 $-1 $41 1.5708 $34 3.14159 $22 $42 forward 7 unknown #",
  "vertex $-1 $-1 $-1 $33 $43 #",
  "straight-curve $-1 $-1 $-1 13919.6 -8176.02 0 0 -0.1 0 F F #",
  "point $-1 $-1 $-1 13919.6 -8177.26 0 #",
  "edge $-1 $-1 $-1 $38 0 $41 40.3 $28 $44 forward 7 unknown #",
  "vertex $-1 $-1 $-1 $29 $45 #",
  "ellipse-curve $-1 $-1 $-1 13923.6 -8176.02 0 0 0 1 0.05 0 0 1 F F #",
  "point $-1 $-1 $-1 13923.7 -8176.02 0 #",
  "vertex $-1 $-1 $-1 $37 $46 #",
  "ellipse-curve $-1 $-1 $-1 13919.6 -8176.02 0 0 0 1 0.05 0 0 1 F F #",
  "point $-1 $-1 $-1 13919.6 -8176.02 0 #",
  "straight-curve $-1 $-1 $-1 13923.6 -8175.97 0 -0.1 0 0 F F #",
  "point $-1 $-1 $-1 13923.6 -8175.97 0 #",
  "point $-1 $-1 $-1 13919.6 -8175.97 0 #",
  "End-of-ACIS-data"
 ];
const stored = (lines: string[]) => lines.map(l => [...l].map(ch => ch === " " ? " " : String.fromCharCode(159 - ch.charCodeAt(0))).join("").replace(/\^/g, "^ "));

describe("REGION outline from old-style ACIS text", () => {
  it("decodes the stored lines back to SAT", () => {
    expect(decodeAcis(stored(SAT)).split("\n")[1]).toContain("Autodesk AutoCAD");
    expect(decodeAcis(["not acis"])).toBe("");
  });

  it("turns the rounded rectangle into 4 lines and 4 quarter arcs at the same places as CAD", () => {
    const out = regionOutline(stored(SAT))!;
    expect(out.map(e => e.type).sort()).toEqual(["ARC", "ARC", "ARC", "ARC", "LINE", "LINE", "LINE", "LINE"]);
    const bottom = out.find(e => e.type === "LINE" && Math.abs(e.vertices[0].y + 8177.31) < 1e-6)!;
    expect(bottom.vertices.map((v: { x: number }) => v.x).sort().map((x: number) => x.toFixed(4))).toEqual(["13919.6000", "13923.6000"]);
    // the stored numbers are rounded (13919.6 for 13919.6193), so every line end is taken from the arc it meets: no gaps
    const arcEnds = out.filter(e => e.type === "ARC").flatMap(a => [a.startAngle, a.endAngle].map(t => [a.center.x + a.radius * Math.cos(t), a.center.y + a.radius * Math.sin(t)]));
    for (const v of out.filter(e => e.type === "LINE").flatMap(e => e.vertices))
      expect(Math.min(...arcEnds.map(([x, y]) => Math.hypot(x - v.x, y - v.y)))).toBeLessThan(1e-9);
    for (const arc of out.filter(e => e.type === "ARC")) {
      expect(arc.radius).toBeCloseTo(0.05, 9);
      expect(arc.endAngle - arc.startAngle).toBeCloseTo(Math.PI / 2, 4);
    }
    // the corner arc at the lower right runs from straight down (-90°) to straight right (0°)
    const lowerRight = out.find(e => e.type === "ARC" && e.center.x === 13923.6 && e.center.y === -8177.26)!;
    expect([lowerRight.startAngle, lowerRight.endAngle].map(a => Math.round(a * 180 / Math.PI))).toEqual([-90, 0]);
  });

  it("joins a record LibreDWG split inside a number (W12: \"4.5857\" / \"5 0 0 1 F F #\")", () => {
    const i = SAT.findIndex(l => l.startsWith("ellipse-curve") && l.includes("13923.6 -8177.26"));
    const split = [...SAT.slice(0, i), SAT[i].slice(0, 33), SAT[i].slice(33), ...SAT.slice(i + 1)];
    expect(SAT[i].slice(0, 33).endsWith(" ")).toBe(false);
    expect(regionOutline(stored(split))).toEqual(regionOutline(stored(SAT)));
  });

  it("replaces a readable region in a list and keeps its layer, colour and handle; others stay", () => {
    const list = expandRegions([{ type: "REGION", handle: "663F1", layer: "AM_0", colorIndex: 3, acis: stored(SAT) }, { type: "REGION", handle: "X" }, { type: "LINE" }]);
    expect(list.filter(e => e.cadRegion === "663F1")).toHaveLength(8);
    expect(list.filter(e => e.cadRegion === "663F1").every(e => e.layer === "AM_0" && e.colorIndex === 3 && e.handle === "663F1" && !("acis" in e))).toBe(true);
    expect(list.slice(-2)).toEqual([{ type: "REGION", handle: "X" }, { type: "LINE" }]);
  });
});
