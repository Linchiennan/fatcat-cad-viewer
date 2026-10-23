import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lib: typeof import("./drawingLibrary");
let idb: IDBFactory;
beforeEach(async () => {
  vi.resetModules();
  idb = new IDBFactory();
  vi.stubGlobal("indexedDB", idb);
  lib = await import("./drawingLibrary");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const file = (name: string, text = "content", lastModified = 1234) => new File([text], name, { lastModified });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "AbortError";
    return (e as { code?: string }).code ?? String(e);
  }
  return "ok";
};
const quotaError = () => new DOMException("quota", "QuotaExceededError");
/** Make one store's add/put throw (e.g. a full disk) while `when()` is true. */
function breakWrites(method: "add" | "put", store: string, when: () => boolean, error: () => Error = quotaError) {
  const original = IDBObjectStore.prototype[method];
  vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
    if (this.name === store && when()) throw error();
    return original.apply(this, args);
  });
}
const names = async (parent = "root") => (await lib.listLibraryChildren(parent)).map((e) => e.name);

describe("names (T11 3.2)", () => {
  it("normalises, validates and de-duplicates", () => {
    expect(lib.normalizeLibraryName("  a \n\t b  ")).toBe("a b");
    for (const bad of ["", "   ", "a/b", "a\\b", "a\u0007b", ".", "..", "x".repeat(221)]) expect(lib.isValidLibraryName(bad)).toBe(false);
    expect(lib.isValidLibraryName("x".repeat(220))).toBe(true);
    const taken = new Set(["plan.dwg", "v1.2"]);
    expect(lib.uniqueLibraryName("Plan.DWG", taken, true)).toBe("Plan (2).DWG");
    expect(lib.uniqueLibraryName("v1.2", taken, false)).toBe("v1.2 (2)");
    const long = "x".repeat(216) + ".dwg";
    const next = lib.uniqueLibraryName(long, new Set([long]), true);
    expect(next.length).toBeLessThanOrEqual(220);
    expect(next.endsWith(" (2).dwg")).toBe(true);
    expect(lib.isValidLibraryName(next)).toBe(true);
    const emoji = "😀".repeat(108) + ".dwg"; // a surrogate pair must not be cut in half
    const cut = lib.uniqueLibraryName(emoji, new Set([lib.libraryNameKey(emoji)]), true);
    expect(cut.length).toBeLessThanOrEqual(220);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(cut)).toBe(false);
  });
  it("treats NFC-equivalent names as the same", async () => {
    await lib.createLibraryFolder("root", "Café");
    expect(await code(lib.createLibraryFolder("root", "Café"))).toBe("DUPLICATE_NAME");
    expect(await code(lib.createLibraryFolder("root", "CAFÉ"))).toBe("DUPLICATE_NAME");
  });
});

describe("adding drawings (T11 3.3)", () => {
  it("keeps same-name imports apart with their own contents", async () => {
    const a = await lib.importDrawingToLibrary(file("plan.dwg", "AAAA"));
    const b = await lib.importDrawingToLibrary(file("PLAN.dwg", "BBBBBBBB"));
    expect([a.name, b.name]).toEqual(["plan.dwg", "PLAN (2).dwg"]);
    expect(await (await lib.openLibraryDrawing(a.id)).text()).toBe("AAAA");
    expect(await (await lib.openLibraryDrawing(b.id)).text()).toBe("BBBBBBBB");
  });
  it("rejects empty files, unsupported extensions and bad names without creating anything", async () => {
    expect(await code(lib.importDrawingToLibrary(new File([], "empty.dxf")))).toBe("INVALID_FILE");
    expect(await code(lib.importDrawingToLibrary(file("notes.txt")))).toBe("INVALID_FILE");
    expect(await code(lib.importDrawingToLibrary(file("a\u0001.dxf")))).toBe("INVALID_NAME");
    expect(await code(lib.importDrawingToLibrary(file("ok.dxf"), "missing-folder"))).toBe("INVALID_DESTINATION");
    const big = file("big.zip");
    Object.defineProperty(big, "size", { value: 67_108_865 });
    expect(await code(lib.importDrawingToLibrary(big))).toBe("FILE_TOO_LARGE");
    expect(await lib.listLibraryChildren("root")).toEqual([]);
  });
  it("runs 10 parallel same-name imports without overwriting", async () => {
    const added = await Promise.all(Array.from({ length: 10 }, (_, i) => lib.importDrawingToLibrary(file("same.dxf", `n${i}`))));
    expect(new Set(added.map((a) => a.name)).size).toBe(10);
    for (let i = 0; i < 10; i++) expect(await (await lib.readLibraryDrawing(added[i].id)).text()).toBe(`n${i}`);
  });
  it("stores the MIME type, falling back to octet-stream", async () => {
    const pdf = await lib.importDrawingToLibrary(new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    const dwg = await lib.importDrawingToLibrary(file("a.dwg"));
    expect(pdf.mimeType).toBe("application/pdf");
    expect(dwg.mimeType).toBe("application/octet-stream");
  });
  it("a failed content write leaves no entry behind", async () => {
    breakWrites("add", "contents", () => true);
    expect(await code(lib.importDrawingToLibrary(file("a.dxf")))).toBe("STORAGE_FULL");
    vi.restoreAllMocks();
    expect(await lib.listLibraryChildren("root")).toEqual([]);
  });
});

describe("opening and reading (T11 3.4, 3.5, 3.8)", () => {
  it("opens with the library name and original modified time, without touching updatedAt", async () => {
    const a = await lib.importDrawingToLibrary(file("orig.dxf", "x", 1234));
    await lib.renameLibraryEntry(a.id, "renamed.dxf");
    const before = (await lib.listLibraryDrawings())[0];
    const opened = await lib.openLibraryDrawing(a.id);
    expect(opened.name).toBe("renamed.dxf");
    expect(opened.lastModified).toBe(1234);
    const after = (await lib.listLibraryDrawings())[0];
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.lastOpenedAt).toBeGreaterThanOrEqual(before.lastOpenedAt);
  });
  it("read-only reads change nothing", async () => {
    const a = await lib.importDrawingToLibrary(file("a.dxf"));
    const before = await lib.listLibraryDrawings();
    await new Promise((r) => setTimeout(r, 5));
    await lib.readLibraryDrawing(a.id);
    expect(await lib.listLibraryDrawings()).toEqual(before);
  });
  it("recent list holds opened drawings only, newest first, with the count rules", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push((await lib.importDrawingToLibrary(file(`d${i}.dxf`))).id);
    const copy = await lib.copyLibraryEntry(ids[0], "root");
    await lib.importArchiveToLibrary([{ path: "x/p.dxf", file: file("p.dxf") }], "root", "pack.zip");
    const recent = await lib.listRecentDrawings();
    expect(recent).toHaveLength(6);
    expect(recent.map((r) => r.id)).not.toContain(copy.id);
    expect(await lib.listRecentDrawings(-1)).toEqual([]);
    expect(await lib.listRecentDrawings(Number.NaN)).toHaveLength(5);
    expect(await lib.listRecentDrawings(2.9)).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 5));
    await lib.openLibraryDrawing(ids[0]);
    expect((await lib.listRecentDrawings(1))[0].id).toBe(ids[0]);
  });
  it("still reads when updating lastOpenedAt hits a full disk", async () => {
    const a = await lib.importDrawingToLibrary(file("a.dxf", "keep"));
    breakWrites("put", "entries", () => true);
    expect(await (await lib.openLibraryDrawing(a.id)).text()).toBe("keep");
  });
  it("unknown database errors are 'unavailable', not 'storage full'", async () => {
    const a = await lib.importDrawingToLibrary(file("a.dxf"));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("weird", "UnknownError");
    });
    expect(await code(lib.openLibraryDrawing(a.id))).toBe("UNAVAILABLE");
  });
  it("a deleted drawing never comes back when open and delete overlap", async () => {
    const a = await lib.importDrawingToLibrary(file("a.dxf"));
    const [opened, deleted] = await Promise.allSettled([lib.openLibraryDrawing(a.id), lib.deleteLibraryEntry(a.id)]);
    expect(deleted.status).toBe("fulfilled");
    expect(["fulfilled", "rejected"]).toContain(opened.status);
    expect(await lib.listLibraryDrawings()).toEqual([]);
    expect(await code(lib.openLibraryDrawing(a.id))).toBe("NOT_FOUND");
  });
  it("is unavailable without IndexedDB", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    const fresh = await import("./drawingLibrary");
    expect(await code(fresh.listLibraryDrawings())).toBe("UNAVAILABLE");
  });
});

describe("folders, rename, move, copy, delete (T11 3.6, 3.9-3.13)", () => {
  it("lists folders first in natural order and builds breadcrumbs", async () => {
    const f10 = await lib.createLibraryFolder("root", "Floor 10");
    await lib.createLibraryFolder("root", "floor 2");
    await lib.importDrawingToLibrary(file("a.dxf"));
    expect(await names()).toEqual(["floor 2", "Floor 10", "a.dxf"]);
    const sub = await lib.createLibraryFolder(f10.id, "Sub");
    expect((await lib.libraryBreadcrumb(sub.id)).map((f) => f.name)).toEqual(["Floor 10", "Sub"]);
    expect(await lib.libraryBreadcrumb("root")).toEqual([]);
    expect(await code(lib.libraryBreadcrumb("nope"))).toBe("NOT_FOUND");
    expect(await code(lib.listLibraryChildren("nope"))).toBe("INVALID_DESTINATION");
    expect((await lib.listLibraryFolders()).map((f) => f.name)).toEqual(["floor 2", "Floor 10", "Sub"]);
  });
  it("creating the same folder twice in parallel gives one success and one duplicate", async () => {
    const results = await Promise.allSettled([lib.createLibraryFolder("root", "A"), lib.createLibraryFolder("root", "a")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "DUPLICATE_NAME" } });
  });
  it("rename keeps the format and refuses duplicates", async () => {
    const a = await lib.importDrawingToLibrary(file("plan.dwg"));
    await lib.importDrawingToLibrary(file("other.dwg"));
    expect(await code(lib.renameLibraryEntry(a.id, "plan.pdf"))).toBe("INVALID_NAME");
    expect(await code(lib.renameLibraryEntry(a.id, "plan"))).toBe("INVALID_NAME");
    expect(await code(lib.renameLibraryEntry(a.id, "OTHER.dwg"))).toBe("DUPLICATE_NAME");
    expect(await code(lib.renameLibraryEntry("missing", "x.dwg"))).toBe("NOT_FOUND");
    expect((await lib.renameLibraryEntry(a.id, "PLAN.dwg")).name).toBe("PLAN.dwg");
  });
  it("move and rename at the same time both stick", async () => {
    const dest = await lib.createLibraryFolder("root", "Dest");
    const a = await lib.importDrawingToLibrary(file("a.dxf"));
    await Promise.all([lib.moveLibraryEntry(a.id, dest.id), lib.renameLibraryEntry(a.id, "b.dxf")]);
    const [moved] = await lib.listLibraryChildren(dest.id);
    expect(moved).toMatchObject({ id: a.id, name: "b.dxf" });
  });
  it("move de-duplicates names and is a no-op inside the same folder", async () => {
    const dest = await lib.createLibraryFolder("root", "Dest");
    await lib.importDrawingToLibrary(file("a.dxf"), dest.id);
    const a = await lib.importDrawingToLibrary(file("a.dxf"));
    const same = await lib.moveLibraryEntry(a.id, "root");
    expect(same.updatedAt).toBe(a.updatedAt);
    expect((await lib.moveLibraryEntry(a.id, dest.id)).name).toBe("a (2).dxf");
  });
  it("folders cannot go into themselves or their children", async () => {
    const top = await lib.createLibraryFolder("root", "Top");
    const child = await lib.createLibraryFolder(top.id, "Child");
    expect(await code(lib.moveLibraryEntry(top.id, child.id))).toBe("INVALID_DESTINATION");
    expect(await code(lib.moveLibraryEntry(top.id, top.id))).toBe("INVALID_DESTINATION");
    expect(await code(lib.copyLibraryEntry(top.id, child.id))).toBe("INVALID_DESTINATION");
  });
  it("copies a whole tree with new ids and deletes only the chosen tree", async () => {
    const top = await lib.createLibraryFolder("root", "Top");
    const child = await lib.createLibraryFolder(top.id, "Child");
    await lib.importDrawingToLibrary(file("deep.dxf", "deep"), child.id);
    const other = await lib.importDrawingToLibrary(file("other.dxf"));
    const copy = await lib.copyLibraryEntry(top.id, "root");
    expect(copy.name).toBe("Top (2)");
    const [copiedChild] = await lib.listLibraryChildren(copy.id);
    expect(copiedChild.name).toBe("Child");
    expect(copiedChild.id).not.toBe(child.id);
    const [copiedDeep] = await lib.listLibraryChildren(copiedChild.id);
    expect(copiedDeep.kind === "drawing" && copiedDeep.lastOpenedAt).toBe(0);
    expect(await (await lib.readLibraryDrawing(copiedDeep.id)).text()).toBe("deep");
    await lib.deleteLibraryEntry(top.id);
    expect(await names()).toEqual(["Top (2)", "other.dxf"]);
    expect(await (await lib.readLibraryDrawing(copiedDeep.id)).text()).toBe("deep");
    expect(await (await lib.readLibraryDrawing(other.id)).text()).toBe("content");
    expect(await code(lib.deleteLibraryEntry(top.id))).toBe("NOT_FOUND");
  });
  it("a copy with missing contents creates nothing", async () => {
    const top = await lib.createLibraryFolder("root", "Top");
    const a = await lib.importDrawingToLibrary(file("a.dxf"), top.id);
    await new Promise<void>((resolve, reject) => {
      const open = idb.open("fatcat-drawing-library");
      open.onsuccess = () => {
        const tx = open.result.transaction("contents", "readwrite");
        tx.objectStore("contents").delete(a.id);
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    expect(await code(lib.copyLibraryEntry(top.id, "root"))).toBe("NOT_FOUND");
    expect(await names()).toEqual(["Top"]);
    expect(await code(lib.openLibraryDrawing(a.id))).toBe("NOT_FOUND");
  });
});

describe("archive import (T11 3.15)", () => {
  it("builds nested folders and imports every file", async () => {
    const result = await lib.importArchiveToLibrary([
      { path: "Floor 1/plan.dwg", file: file("plan.dwg", "D") },
      { path: "floor 1/notes.pdf", file: new File(["P"], "notes.pdf", { type: "application/pdf" }) },
      { path: "Floor 2/sub/plan.dxf", file: file("plan.dxf", "X") },
    ], "root", "Package.ZIP");
    expect(result.folder.name).toBe("Package");
    expect(result.drawings).toHaveLength(3);
    const floors = await lib.listLibraryChildren(result.folder.id);
    expect(floors.map((f) => f.name)).toEqual(["Floor 1", "Floor 2"]);
    expect(await names(floors[0].id)).toEqual(["notes.pdf", "plan.dwg"]);
    const again = await lib.importArchiveToLibrary([{ path: "a.dxf", file: file("a.dxf") }], "root", "package.zip");
    expect(again.folder.name).toBe("package (2)");
    expect((await lib.importArchiveToLibrary([{ path: "a.dxf", file: file("a.dxf") }], "root", ".rar")).folder.name).toBe("Archive");
  });
  it("bad paths, mismatched names and cancelled imports create nothing", async () => {
    expect(await code(lib.importArchiveToLibrary([{ path: "../x.dxf", file: file("x.dxf") }], "root", "a.zip"))).toBe("ARCHIVE_INVALID_PATH");
    expect(await code(lib.importArchiveToLibrary([{ path: "x.dxf", file: file("y.dxf") }], "root", "a.zip"))).toBe("INVALID_FILE");
    expect(await code(lib.importArchiveToLibrary([{ path: "x.zip", file: file("x.zip") }], "root", "a.zip"))).toBe("INVALID_FILE");
    expect(await code(lib.importArchiveToLibrary([{ path: "a", file: file("a") }], "root", "a.zip"))).toBe("INVALID_FILE");
    expect(await code(lib.importArchiveToLibrary([
      { path: "a.dxf", file: file("a.dxf") }, { path: "a.dxf/b.dwg", file: file("b.dwg") },
    ], "root", "a.zip"))).toBe("INVALID_FILE");
    const controller = new AbortController();
    controller.abort();
    expect(await code(lib.importArchiveToLibrary([{ path: "x.dxf", file: file("x.dxf") }], "root", "a.zip", controller.signal))).toBe("AbortError");
    expect(await lib.listLibraryChildren("root")).toEqual([]);
  });
  it("a quota error or a cancel during the write rolls the whole tree back", async () => {
    let written = 0;
    breakWrites("add", "contents", () => ++written === 2);
    const items = [{ path: "a/x.dxf", file: file("x.dxf") }, { path: "a/y.dxf", file: file("y.dxf") }];
    expect(await code(lib.importArchiveToLibrary(items, "root", "a.zip"))).toBe("STORAGE_FULL");
    vi.restoreAllMocks();
    expect(await lib.listLibraryChildren("root")).toEqual([]);
    const controller = new AbortController();
    const running = lib.importArchiveToLibrary(items, "root", "a.zip", controller.signal);
    controller.abort();
    expect(await code(running)).toBe("AbortError");
    expect(await lib.listLibraryChildren("root")).toEqual([]);
  });
});

describe("snapshots and replacement (T11 3.14, 9.1-17/18)", () => {
  it("replaces contents in place and keeps the old version on failure", async () => {
    const a = await lib.importDrawingToLibrary(file("a.dxf", "old"));
    const other = await lib.importDrawingToLibrary(file("xref.dxf", "xref"));
    const updated = await lib.replaceLibraryDrawing(a.id, new File(["new contents"], "chosen.dxf", { lastModified: 999 }));
    expect(updated).toMatchObject({ id: a.id, name: "a.dxf", parentId: "root", createdAt: a.createdAt, lastOpenedAt: a.lastOpenedAt, size: 12, lastModified: 999 });
    expect(await (await lib.readLibraryDrawing(a.id)).text()).toBe("new contents");
    expect(await (await lib.readLibraryDrawing(other.id)).text()).toBe("xref");
    expect(await code(lib.replaceLibraryDrawing(a.id, new File([], "e.dxf")))).toBe("INVALID_FILE");
    expect(await code(lib.replaceLibraryDrawing(a.id, file("e.dwg")))).toBe("INVALID_FILE");
    expect(await code(lib.replaceLibraryDrawing(a.id, file("e.zip")))).toBe("INVALID_FILE");
    expect(await code(lib.replaceLibraryDrawing("missing", file("e.dxf")))).toBe("NOT_FOUND");
    expect(await (await lib.readLibraryDrawing(a.id)).text()).toBe("new contents");
    expect(await lib.listLibraryDrawings()).toHaveLength(2);
  });
  it("carries reading preferences from the old contents to the new", async () => {
    const reading = await import("../viewer/readingPosition");
    const a = await lib.importDrawingToLibrary(file("a.dxf", "old"));
    const oldKey = await reading.drawingIdentity(await lib.readLibraryDrawing(a.id));
    reading.savePosition(oldKey, { x: 1, y: 2, width: 30 });
    await lib.replaceLibraryDrawing(a.id, file("b.dxf", "new"));
    const newKey = await reading.drawingIdentity(await lib.readLibraryDrawing(a.id));
    expect(newKey).not.toBe(oldKey);
    expect(reading.readPosition(newKey)).toMatchObject({ x: 1, y: 2, width: 30 });
  });
});

describe("migration from the old library (T11 7.1)", () => {
  const LEGACY = () => lib.LEGACY_DB_NAME;
  function seedLegacy(entries: object[], contents: object[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const open = idb.open(LEGACY(), 1);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore("entries", { keyPath: "id" });
        store.createIndex("parentId", "parentId", { unique: false });
        open.result.createObjectStore("contents", { keyPath: "id" });
      };
      open.onsuccess = () => {
        const tx = open.result.transaction(["entries", "contents"], "readwrite");
        for (const e of entries) tx.objectStore("entries").put(e);
        for (const c of contents) tx.objectStore("contents").put(c);
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }
  const legacyVersion = async () => (await idb.databases()).find((d) => d.name === LEGACY())?.version;

  it("moves folders and drawings with the same ids and keeps the old database at version 1", async () => {
    const legacy = new Blob(["legacy"]);
    await seedLegacy([
      { id: "folder-1", kind: "folder", parentId: "root", name: "Old folder", createdAt: 1, updatedAt: 1 },
      { id: "drawing-1", kind: "drawing", parentId: "root", name: "archive.dxf", createdAt: 1, updatedAt: 1, format: "dxf", mimeType: "application/octet-stream", size: legacy.size, lastModified: 5, lastOpenedAt: 0 },
    ], [{ id: "drawing-1", blob: legacy }]);
    expect(await lib.migrateLegacyLibrary()).toBe("migrated");
    expect(await names()).toEqual(["Old folder", "archive.dxf"]);
    const opened = await lib.openLibraryDrawing("drawing-1");
    expect(opened.name).toBe("archive.dxf");
    expect(await opened.text()).toBe("legacy");
    expect(await legacyVersion()).toBe(1);
    expect((await lib.listLibraryChildren("root")).map((e) => e.id).sort()).toEqual(["drawing-1", "folder-1"]);
    expect(await lib.migrateLegacyLibrary()).toBe("already-migrated");
  });
  it("does nothing (and creates no old database) when there is no old library", async () => {
    expect(await lib.migrateLegacyLibrary()).toBe("nothing-to-migrate");
    expect(await legacyVersion()).toBeUndefined();
  });
  it("does not mix old data into a library already in use", async () => {
    await seedLegacy([{ id: "f", kind: "folder", parentId: "root", name: "Old", createdAt: 1, updatedAt: 1 }], []);
    await lib.createLibraryFolder("root", "New");
    expect(await lib.migrateLegacyLibrary()).toBe("nothing-to-migrate");
    expect(await names()).toEqual(["New"]);
  });
});
