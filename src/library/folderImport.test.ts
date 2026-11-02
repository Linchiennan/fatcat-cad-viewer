import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let lib: typeof import("./drawingLibrary");
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  lib = await import("./drawingLibrary");
});
afterEach(() => vi.unstubAllGlobals());

/** A file as a folder pick gives it: its path inside the chosen folder, starting with that folder's name. */
const picked = (path: string, text = "0") => {
  const f = new File([text], path.split("/").at(-1)!);
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
};

describe("整個資料夾匯入", () => {
  it("只收圖面（不含壓縮檔、空檔、其他檔），路徑去掉最上層資料夾名", () => {
    const files = [picked("CAD/A01.dwg"), picked("CAD/外參/公司圖框.dwg"), picked("CAD/說明.txt"), picked("CAD/舊圖.zip"), picked("CAD/空.dxf", ""), picked("CAD/平面.pdf")];
    expect(lib.folderNameOf(files)).toBe("CAD");
    expect(lib.folderImportItems(files).map((i) => i.path)).toEqual(["A01.dwg", "外參/公司圖框.dwg", "平面.pdf"]);
  });

  it("建立同名資料夾、子資料夾照原樣，來源顯示資料夾內路徑（不含磁碟槽），外參可在同資料夾找到", async () => {
    const files = [picked("CAD/A01.dwg"), picked("CAD/公司圖框.dwg"), picked("CAD/外參/B02.dxf")];
    const { folder, drawings } = await lib.importArchiveToLibrary(lib.folderImportItems(files), lib.ROOT_ID, lib.folderNameOf(files));
    expect(folder.name).toBe("CAD");
    expect(drawings.map((d) => d.originalSourcePath)).toEqual(["CAD/A01.dwg", "CAD/公司圖框.dwg", "CAD/外參/B02.dxf"]);
    const top = await lib.listLibraryChildren(folder.id);
    expect(top.map((e) => e.name).sort()).toEqual(["A01.dwg", "公司圖框.dwg", "外參"]);
    // Same-name xref lookup: the frame sits in the same library folder as the main drawing.
    const { pickLibraryEntry } = await import("../viewer/xrefAutoFind");
    const all = await lib.listLibraryDrawings();
    const main = all.find((d) => d.name === "A01.dwg")!;
    expect(pickLibraryEntry("..\\圖框\\公司圖框.dwg", all, main)).toMatchObject({ name: "公司圖框.dwg", parentId: folder.id });
  });

  // 惠宇敦南 330 張、693 MB：對話框答應「全部加入」，結果被壓縮檔的解壓總量 128 MB 上限整批擋掉、一張都沒加
  it("資料夾總量超過壓縮檔的解壓上限也照樣加入（檔案本來就在裝置上）；壓縮檔仍受限", async () => {
    const big = (path: string) => { const f = picked(path); Object.defineProperty(f, "size", { value: 100 * 1024 * 1024 }); return f; };
    const files = [big("案/A.dwg"), big("案/B.dwg")];
    const { drawings } = await lib.importArchiveToLibrary(lib.folderImportItems(files), lib.ROOT_ID, "案", undefined, true, true);
    expect(drawings).toHaveLength(2);
    await expect(lib.importArchiveToLibrary(lib.folderImportItems(files), lib.ROOT_ID, "案.zip")).rejects.toMatchObject({ code: "ARCHIVE_LIMIT" });
  });

  // 喬瓏 127鑫元鴻 1,729 張：壓縮檔的 1,000 筆上限把整個資料夾擋掉
  it("資料夾超過壓縮檔的 1,000 筆上限也照樣加入；壓縮檔仍受限", async () => {
    const files = Array.from({ length: 1200 }, (_, i) => picked(`案/圖${i}.dwg`));
    const { drawings } = await lib.importArchiveToLibrary(lib.folderImportItems(files), lib.ROOT_ID, "案", undefined, true, true);
    expect(drawings).toHaveLength(1200);
    await expect(lib.importArchiveToLibrary(lib.folderImportItems(files), lib.ROOT_ID, "案.zip")).rejects.toMatchObject({ code: "ARCHIVE_LIMIT" });
  });
});
