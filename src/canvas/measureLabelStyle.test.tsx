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
