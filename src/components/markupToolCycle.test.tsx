// @vitest-environment jsdom
// 註記工具輪替：框→正圓→橢圓→通通不選→框…；單一工具（移動）再按一下＝不選。
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { it, expect } from "vitest";
import { MarkupBar } from "./MarkupBar";
import { I18nProvider } from "../i18n/translations";
import type { MarkTool } from "../viewer/markup";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollTo ??= function () {} as typeof Element.prototype.scrollTo; // jsdom has no scrolling

it("每個輪替鈕輪完一輪變成不選，預設不選", () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const seen: MarkTool[] = [];
  function Harness() {
    const [tool, setTool] = useState<MarkTool>("none");
    return <MarkupBar tool={tool} color="#ff3b30" count={0} sharing={false} onTool={(t) => { seen.push(t); setTool(t); }} onColor={() => {}} onUndo={() => {}} onShare={() => {}} onDone={() => {}} />;
  }
  act(() => root.render(<I18nProvider><Harness /></I18nProvider>));
  const slot = (i: number) => host.querySelectorAll<HTMLButtonElement>(".markup-row:first-child > button")[i];
  const pressed = () => Array.from(host.querySelectorAll(".markup-row:first-child > button")).filter((b) => b.getAttribute("aria-pressed") === "true").length;
  expect(pressed()).toBe(0);
  for (let k = 0; k < 5; k++) act(() => slot(1).click());
  for (let k = 0; k < 4; k++) act(() => slot(0).click());
  for (let k = 0; k < 3; k++) act(() => slot(2).click());
  for (let k = 0; k < 2; k++) act(() => slot(3).click());
  expect(seen).toEqual(["rect", "circle", "ellipse", "none", "rect", "pen", "line", "arrow", "none", "text", "mtext", "none", "move", "none"]);
  expect(pressed()).toBe(0);
  act(() => root.unmount()); host.remove();
});
