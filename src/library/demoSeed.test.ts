// Demo drawings kept in the signed-in library (用戶 2026-11-23：「有登入的正式版，依樣保留範例，而且不讓客戶刪除」).
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lib: typeof import("./drawingLibrary");
let seed: typeof import("./demoSeed");
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new Blob([`demo ${decodeURIComponent(url)}`]), { status: 200 })));
  lib = await import("./drawingLibrary");
  seed = await import("./demoSeed");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("demo seeding", () => {
  it("adds each demo once, marked demo and dated before anything the customer adds", async () => {
    expect(await seed.seedDemoDrawings()).toBe(3);
    expect(await seed.seedDemoDrawings()).toBe(0);
    const all = await lib.listLibraryDrawings();
    expect(all.map((e) => e.name).sort()).toEqual(["示範-圖框.dwg", "示範-住宅平面.dwg", "示範-住宅平面.pdf"].sort());
    expect(all.every((e) => e.demo === true && e.updatedAt === seed.DEMO_DATE && e.lastOpenedAt === 0)).toBe(true);
  });

  it("keeps the customer's own file of the same name apart", async () => {
    await lib.importDrawingToLibrary(new File(["mine"], "示範-住宅平面.dwg"));
    await seed.seedDemoDrawings();
    const all = await lib.listLibraryDrawings();
    expect(all.filter((e) => e.demo).length).toBe(3);
    expect(all.filter((e) => !e.demo).map((e) => e.name)).toEqual(["示範-住宅平面.dwg"]);
  });

  it("puts them in 最近開啟 for the guest", async () => {
    await seed.seedDemoDrawings(true);
    expect((await lib.listLibraryDrawings()).every((e) => e.lastOpenedAt > 0)).toBe(true);
  });
});
