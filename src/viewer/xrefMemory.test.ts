import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 用戶 2026-10-28：加入正確的外參後，第二次打開要自動套用.
describe("remembered xref files", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", new IDBFactory());
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  const dwg = (name: string, body = "x") => new File([body], name, { lastModified: 1_700_000_000_000 });

  it("stores picks in 外部參考 next to the main drawing, remembers each reference and gives them back on reopening", async () => {
    const lib = await import("../library/drawingLibrary");
    const mem = await import("./xrefMemory");
    const folder = await lib.createLibraryFolder(lib.ROOT_ID, "11F");
    const main = await lib.importDrawingToLibrary(dwg("06-11F-給水放樣.dwg"), folder.id);
    const never = async () => { throw new Error("no question for identical files"); };
    const frame = await mem.storeXrefFile(main.id, dwg("範本圖框.dwg", "frame"), never);
    const water = await mem.storeXrefFile(main.id, dwg("08-11F-給水.dwg", "water"), never);
    mem.rememberXref(main.id, "06-11F-給水放樣.dwg|範本圖框", frame!.entryId);
    mem.rememberXref(main.id, "06-11F-給水放樣.dwg|08-11F-給水", water!.entryId);
    // nested: the same frame used inside 08-11F-給水 is the same library file
    mem.rememberXref(main.id, "08-11F-給水.dwg|範本圖框", frame!.entryId);
    const xrefFolder = (await lib.listLibraryChildren(folder.id)).find((e) => e.kind === "folder");
    expect(xrefFolder?.name).toBe("外部參考");
    expect((await lib.listLibraryChildren(xrefFolder!.id)).map((e) => e.name).sort()).toEqual(["08-11F-給水.dwg", "範本圖框.dwg"]);
    // the same file picked again for another drawing is reused without a question
    expect((await mem.storeXrefFile(main.id, dwg("範本圖框.dwg", "frame"), never))!.entryId).toBe(frame!.entryId);

    const back = await mem.rememberedXrefFiles(main.id);
    expect(back!.files.map((f) => f.name).sort()).toEqual(["08-11F-給水.dwg", "範本圖框.dwg"]);
    const frameIndex = back!.files.findIndex((f) => f.name === "範本圖框.dwg");
    expect(back!.mapping["06-11F-給水放樣.dwg|範本圖框"]).toBe("@" + frameIndex);
    expect(back!.mapping["08-11F-給水.dwg|範本圖框"]).toBe("@" + frameIndex);
  });

  it("a remembered file deleted from the library is left out (its reference turns red) and forgotten", async () => {
    const lib = await import("../library/drawingLibrary");
    const mem = await import("./xrefMemory");
    const main = await lib.importDrawingToLibrary(dwg("main.dwg"));
    const a = await mem.storeXrefFile(main.id, dwg("a.dwg", "a"), async () => "cancel");
    const b = await mem.storeXrefFile(main.id, dwg("b.dwg", "b"), async () => "cancel");
    mem.rememberXref(main.id, "main.dwg|A", a!.entryId);
    mem.rememberXref(main.id, "main.dwg|B", b!.entryId);
    await lib.deleteLibraryEntry(b!.entryId);
    const back = await mem.rememberedXrefFiles(main.id);
    expect(back!.files.map((f) => f.name)).toEqual(["a.dwg"]);
    expect(Object.keys(mem.loadXrefMemory(main.id))).toEqual(["main.dwg|A"]);
    mem.forgetXrefs(main.id);
    expect(await mem.rememberedXrefFiles(main.id)).toBeNull();
  });

  it("a same-name file with other content asks; 取消 stores nothing", async () => {
    const lib = await import("../library/drawingLibrary");
    const mem = await import("./xrefMemory");
    const main = await lib.importDrawingToLibrary(dwg("main.dwg"));
    await mem.storeXrefFile(main.id, dwg("frame.dwg", "v1"), async () => "cancel");
    const asked: string[] = [];
    const r = await mem.storeXrefFile(main.id, dwg("frame.dwg", "v2 changed"), async (c) => { asked.push(c.reasons.join("/")); return "cancel"; });
    expect(asked.length).toBe(1);
    expect(r).toBeNull();
  });
});
