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

  it("adds the demo 工程相機 project once, on the demo plan, and keeps it (用戶 2026-11-23)", async () => {
    const cam = await import("../camera/batchStore");
    await seed.seedDemoDrawings();
    await seed.seedDemoDrawings();
    const batches = await cam.listBatches();
    expect(batches).toHaveLength(1);
    const b = batches[0];
    expect([b.demo, b.name, b.drawingName, b.space]).toEqual([true, "1151029-輕隔間配管", "示範-住宅平面.dwg", "Model"]);
    expect(b.viewKey.startsWith("fatcat-reading-v1:示範-住宅平面.dwg:")).toBe(true);
    const points = await cam.listPoints(b.id), photos = await cam.listPhotos(b.id);
    expect(points.map((p) => [p.no, p.place, p.demo])).toEqual([[1, "主浴", true], [2, "浴室", true], [3, "臥室1", true], [4, "餐廳・廚房", true]]);
    expect(photos.map((p) => points.find((q) => q.id === p.pointId)?.no)).toEqual([1, 2, 3, 4]);
    expect(photos.every((p) => p.demo && p.board.font === "hand")).toBe(true);
    const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e as { code?: string }).code);
    expect(await code(cam.deleteBatch(b.id))).toBe("PROTECTED");
    expect(await code(cam.deletePoint(points[0].id))).toBe("PROTECTED");
    expect(await code(cam.deletePhoto(photos[0].id))).toBe("PROTECTED");
    const mine = await cam.addPoint(b.id, { x: 1, y: 1, angle: 0, place: "" });
    expect(await code(cam.deletePoint(mine.id))).toBe("ok");
    // a customer's own batch sorts above the demo
    await cam.createBatch({ ...b, demo: undefined, name: "mine" } as never);
    expect((await cam.listBatches()).map((x) => x.name)).toEqual(["mine", "1151029-輕隔間配管"]);
  });
});
