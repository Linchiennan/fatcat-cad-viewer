// @vitest-environment jsdom
// 量測數字樣式（齒輪選單）：原位＋深色底／線在數字處斷開／跟線同角度。
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect } from "vitest";
import { MeasureOverlay } from "./MeasureOverlay";
import { overlayModel } from "./overlayModel";
import { setLabelStyle, loadLabelStyle } from "../viewer/measureLabelStyle";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = { enabled: true, mode: "distance" as const, points: [], snap: false, snapKinds: [], info: false };
const model = overlayModel({ settings: { ...base, kept: [{ mode: "distance", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }] }, entity: null,
  project: (ps) => ps.map((p) => ({ x: p.x * 2, y: 300 - p.y * 2 })), labelPx: 20, label: (l) => `${Math.round(l)} cm` });

it("三種樣式都畫得出來，選擇會記住", () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  act(() => root.render(<MeasureOverlay model={model} aim={null} snapAt={null} />));
  act(() => setLabelStyle("box"));
  expect(host.querySelectorAll(".measure-label-box")).toHaveLength(1);
  expect(host.querySelectorAll(".measure-line-piece")).toHaveLength(0);
  act(() => setLabelStyle("gap"));
  expect(host.querySelectorAll(".measure-label-box")).toHaveLength(0);
  const pieces = [...host.querySelectorAll(".measure-line-piece")];
  expect(pieces).toHaveLength(2);
  // the gap is around the middle of the 45° line (0,300)–(200,100): its centre (100,200) is not on any piece
  const ends = pieces.map((p) => p.getAttribute("points")!.split(" ").map((s) => s.split(",").map(Number)));
  expect(ends[0][1][0]).toBeLessThan(100); expect(ends[1][0][0]).toBeGreaterThan(100);
  act(() => setLabelStyle("angle"));
  expect(host.querySelector(".measure-kept-shape g[transform]")?.getAttribute("transform")).toMatch(/^rotate\(-45\.00 /);
  expect(loadLabelStyle()).toBe("angle");
  act(() => root.unmount()); host.remove();
});

// 用戶 2026-10-28：量測設定可改字色、外框色、線色；常用色不用黃色，補上原本的橘色；預設＝加這功能前的配色（紅字、橘框、橘線）；可還原預設
it("字色、外框色、線色各自套用、記住，可還原成原本的配色", async () => {
  const { MEASURE_COLORS, DEFAULT_MEASURE_COLORS, setMeasureColor, resetMeasureColors } = await import("../viewer/measureLabelStyle");
  expect(MEASURE_COLORS.map((c) => c.id)).toEqual(["orange", "red", "white", "green", "blue", "magenta"]);
  for (const c of MEASURE_COLORS) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)); expect(r > 200 && g > 200 && b < 120).toBe(false); } // 沒有黃色
  expect(DEFAULT_MEASURE_COLORS).toEqual({ text: "red", box: "orange", line: "orange" });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  act(() => setLabelStyle("box"));
  act(() => root.render(<MeasureOverlay model={model} aim={null} snapAt={null} />));
  const line = () => host.querySelector(".measure-kept-shape polyline")!.getAttribute("stroke");
  const text = () => host.querySelector(".measure-length-label")!.getAttribute("fill");
  const rim = () => host.querySelector(".measure-label-box")!.getAttribute("stroke");
  // 預設和加這功能前一模一樣：線 #ffb547、字 #ff1f1f、框 rgba(255,181,71,0.55)
  expect([line(), text(), rim()]).toEqual(["#ffb547", "#ff1f1f", "rgba(255,181,71,0.55)"]);
  act(() => { setMeasureColor("line", "blue"); setMeasureColor("text", "green"); setMeasureColor("box", "magenta"); });
  expect([line(), text(), rim()]).toEqual(["#3d8bff", "#34c759", "rgba(255,79,216,0.55)"]);
  expect(JSON.parse(localStorage.getItem("fatcat:measure-colors")!)).toEqual({ text: "green", box: "magenta", line: "blue" });
  act(() => resetMeasureColors());
  expect([line(), text(), rim()]).toEqual(["#ffb547", "#ff1f1f", "rgba(255,181,71,0.55)"]);
  expect(localStorage.getItem("fatcat:measure-colors")).toBeNull();
  act(() => root.unmount()); host.remove();
});
