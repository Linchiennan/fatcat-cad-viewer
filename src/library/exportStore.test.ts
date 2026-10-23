import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportResult } from "./exportTypes";

let store: typeof import("./exportStore");
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  store = await import("./exportStore");
});

const result = (fileName: string, body = "PNGDATA", mime = "image/png"): ExportResult => ({
  blob: new Blob([body], { type: mime }), mime: mime as ExportResult["mime"], fileName, widthPx: 800, heightPx: 600, dpi: 200, downscaled: false,
  thumbnail: new Blob(["thumb"], { type: "image/png" }),
});
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "ok";
};

describe("saving exports (spec 005-5)", () => {
  it("keeps every export with its preview and lists the newest first", async () => {
    const a = await store.saveExport(result("平面圖_配置1_20261023-0900.png"));
    await new Promise((r) => setTimeout(r, 3));
    const b = await store.saveExport(result("平面圖_配置1_20261023-0910.pdf", "%PDF", "application/pdf"));
    expect(a).toMatchObject({ format: "png", mime: "image/png", size: 7, thumbnailSize: 5, widthPx: 800, dpi: 200 });
    expect(b.format).toBe("pdf");
    expect((await store.listExports()).map((e) => e.id)).toEqual([b.id, a.id]);
    const file = await store.readExport(a.id);
    expect([file.name, file.type, await file.text()]).toEqual(["平面圖_配置1_20261023-0900.png", "image/png", "PNGDATA"]);
    expect(await (await store.readExportThumbnails([a.id])).get(a.id)!.text()).toBe("thumb");
    expect(await store.exportsTotalBytes()).toBe(7 + 5 + 4 + 5);
  });
  it("never overwrites: the same name gets (2)", async () => {
    await store.saveExport(result("plan.png"));
    expect((await store.saveExport(result("PLAN.png"))).name).toBe("PLAN (2).png");
  });
  it("cleans illegal characters and fixes the extension", () => {
    expect(store.exportFileName('a/b:c*?"<>|.png', "png")).toBe("a_b_c______.png");
    expect(store.exportFileName("report", "pdf")).toBe("report.pdf");
    expect(store.exportFileName("  ", "png")).toBe("export.png");
    expect(store.exportFileName("x".repeat(300), "pdf").length).toBe(220);
  });
  it("refuses empty or non PNG/PDF results", async () => {
    expect(await code(store.saveExport({ ...result("a.png"), blob: new Blob([]) }))).toBe("INVALID_FILE");
    expect(await code(store.saveExport(result("a.jpg", "x", "image/jpeg")))).toBe("INVALID_FILE");
    expect(await store.listExports()).toEqual([]);
  });
});

describe("managing exports (spec 005-7)", () => {
  it("renames keeping the format and refuses duplicates", async () => {
    const a = await store.saveExport(result("a.png"));
    await store.saveExport(result("b.png"));
    expect((await store.renameExport(a.id, "現場照片")).name).toBe("現場照片.png");
    expect(await code(store.renameExport(a.id, "B.png"))).toBe("DUPLICATE_NAME");
    expect(await code(store.renameExport(a.id, "x/y"))).toBe("INVALID_NAME");
    expect(await code(store.renameExport("missing", "z"))).toBe("NOT_FOUND");
  });
  it("deletes only when asked and only that file", async () => {
    const a = await store.saveExport(result("a.png"));
    const b = await store.saveExport(result("b.png"));
    await store.deleteExport(a.id);
    expect((await store.listExports()).map((e) => e.id)).toEqual([b.id]);
    expect(await code(store.readExport(a.id))).toBe("NOT_FOUND");
    expect(await code(store.deleteExport(a.id))).toBe("NOT_FOUND");
  });
  it("warns above 500 MB", () => {
    expect(store.exportsOverWarning(500 * 1024 * 1024)).toBe(false);
    expect(store.exportsOverWarning(500 * 1024 * 1024 + 1)).toBe(true);
  });
});

describe("share / open fallbacks", () => {
  it("uses the actions handed in by the App", async () => {
    const actions = await import("./exportFileActions");
    const shareFile = vi.fn(async () => {});
    const openFile = vi.fn(async () => {});
    actions.setExportFileActions({ shareFile, openFile });
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await actions.shareExportFile(file);
    await actions.openExportFile(file);
    expect(shareFile).toHaveBeenCalledWith(file, "a.pdf", "application/pdf");
    expect(openFile).toHaveBeenCalledWith(file, "a.pdf", "application/pdf");
  });
});
