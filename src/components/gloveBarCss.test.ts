import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");

describe("phone button row on wide screens (V1: the paw grew to 280 px on a tablet)", () => {
  it("caps every cell at the phone size and centres the row", () => {
    expect(css).toMatch(/\.glove-bar > \.glove-btn \{ max-width: 84px; \}/);
    expect(css).toMatch(/\.glove-bar \{ justify-content: center; \}/);
  });

  it("sizes the paw pad from the same capped cell", () => {
    expect(css).toMatch(/--paw-cell: min\(\(100cqw - 24px\) \/ 5, 84px\)/);
    expect(css).toMatch(/padding-bottom: calc\(0\.4118 \* var\(--paw-cell\) - 23\.92px\)/);
  });
});
