import { afterEach, describe, expect, it } from "vitest";
import { attachDebug, debugRequested, detachDebug, noteLoadError, type DebugSource } from "./engineDebug";

const g = globalThis as any;
const source = (over: Partial<DebugSource> = {}): DebugSource => ({
  isReady: () => true, isLoading: () => false,
  report: () => ({ warnings: ["缺少圖塊：X"], entityCount: 12 }),
  spaces: () => [{ name: "Model" }, { name: "配置1" }], currentSpace: () => "Model",
  sceneStats: () => ({ meshes: 3, verts: 90 }), camera: () => ({ center: { x: 1, y: 2 }, width: 10 }),
  ...over,
});

afterEach(() => { delete g.__fatcatDebug; delete g.location; });

describe("debug hook (debug=1 only)", () => {
  it("reads debug=1 from the query, glove pages included", () => {
    expect(debugRequested("?glove=1&debug=1")).toBe(true);
    expect(debugRequested("?debug=1")).toBe(true);
    expect(debugRequested("?glove=1")).toBe(false);
    expect(debugRequested("?debug=0")).toBe(false);
    expect(debugRequested("")).toBe(false);
  });

  it("attaches nothing without debug=1", () => {
    g.location = { search: "?glove=1" };
    attachDebug(source());
    expect(g.__fatcatDebug).toBeUndefined();
  });

  it("reports the current drawing, and not-ready while loading or after dispose", () => {
    g.location = { search: "?glove=1&debug=1" };
    let loading = false;
    const e = source({ isLoading: () => loading });
    attachDebug(e);
    const api = g.__fatcatDebug;
    expect(api.report()).toEqual({ warnings: ["缺少圖塊：X"], entityCount: 12, spaces: ["Model", "配置1"], space: "Model" });
    expect(api.sceneStats()).toEqual({ meshes: 3, verts: 90 });
    expect(api.ready()).toBe(true);
    loading = true;
    expect(api.ready()).toBe(false);
    detachDebug(e);
    expect(api.ready()).toBe(false);
    expect(api.report()).toBeNull();
    expect(api.sceneStats()).toEqual({ meshes: 0, verts: 0 });
  });

  it("tells why the last load failed (the error screen shows only a generic line)", () => {
    g.location = { search: "?debug=1" };
    attachDebug(source());
    noteLoadError(new Error("Drawing loading timed out."));
    expect(g.__fatcatDebug.lastError()).toMatch(/^Drawing loading timed out\./);
  });
});
