import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let lib: typeof import("../library/drawingLibrary");
let auto: typeof import("./xrefAutoFind");
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  lib = await import("../library/drawingLibrary");
  auto = await import("./xrefAutoFind");
});
afterEach(() => vi.unstubAllGlobals());

/** A DXF attaching the given references (block name = file name without extension). */
const host = (refs: string[]) => ["0", "SECTION", "2", "BLOCKS",
  ...refs.flatMap((r) => ["0", "BLOCK", "2", r.split(/[\\/]/).at(-1)!.replace(/\.dxf$/i, ""), "70", "4", "10", "0", "20", "0", "1", r, "0", "ENDBLK"]),
  "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
  ...refs.flatMap((r) => ["0", "INSERT", "8", "0", "2", r.split(/[\\/]/).at(-1)!.replace(/\.dxf$/i, ""), "10", "0", "20", "0"]),
  "0", "ENDSEC", "0", "EOF"].join("\n");
const leaf = ["0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "10", "21", "0", "0", "ENDSEC", "0", "EOF"].join("\n");
const picked = (path: string, text: string) => {
  const f = new File([text], path.split("/").at(-1)!);
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
};

// 喬瓏 天花板套圖-5F：監控-5F 與 動力-5F-CT 都附著 \\Pc-01\…\X-5F.dwg；同一檔被加入兩次，同名兩份判成衝突、兩邊都沒載入
it("loads a drawing two references both attach, once", async () => {
  const unc = String.raw`\\Pc-01\公司資料\5F-套圖-CAD\X-5F.dxf`;
  const files = [picked("案/main.dxf", host(["A.dxf", "B.dxf"])), picked("案/A.dxf", host([unc])), picked("案/B.dxf", host([unc])), picked("案/X-5F.dxf", leaf)];
  const { drawings } = await lib.importArchiveToLibrary(lib.folderImportItems(files), lib.ROOT_ID, "案", undefined, true, true);
  const main = drawings.find((d) => d.name === "main.dxf")!;
  const result = await auto.autoAssembleXrefs(files[0], ["A.dxf", "B.dxf"], main.id);
  const nested = result!.statuses.filter((s) => s.name === "X-5F");
  expect(nested).toHaveLength(2);
  expect(nested.every((s) => s.status.startsWith("已"))).toBe(true);
});
