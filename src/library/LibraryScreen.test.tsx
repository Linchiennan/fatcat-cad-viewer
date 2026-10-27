// @vitest-environment jsdom
// Library screen behaviour in jsdom (jsdom installed by group E).
import { IDBFactory } from "fake-indexeddb";
import { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../i18n/translations", async () => {
  const spec = (await import("../i18n/t19-spec-strings.json")).default as Record<string, { zh: string }>;
  const own = (await import("../i18n/ownStrings")).OWN_STRINGS as Record<string, { zh: string }>;
  const strings: Record<string, { zh: string }> = { ...spec, ...own };
  const t = (key: string, vars?: Record<string, string | number>) => (strings[key]?.zh ?? key).replace(/{(w+)}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  return { useI18n: () => ({ locale: "zh-TW", setLocale() {}, t }), translate: (_l: string, key: string) => t(key) };
});

const hasDom = typeof document !== "undefined";

describe.skipIf(!hasDom)("LibraryScreen (needs jsdom)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", new IDBFactory());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  async function mount(props: Partial<import("./LibraryScreen").LibraryScreenProps> = {}) {
    const { createRoot } = await import("react-dom/client");
    const { LibraryScreen } = await import("./LibraryScreen");
    const lib = await import("./drawingLibrary");
    const view = await import("./libraryView");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClose = vi.fn();
    const onOpen = vi.fn();
    await act(async () => {
      root.render(<LibraryScreen onOpen={onOpen} onClose={onClose} incomingArchive={null} onArchiveTaken={() => {}} {...props} />);
    });
    const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    await settle();
    return { host, root, onClose, onOpen, lib, view, settle };
  }

  it("shows the empty folder, then items with folders first, and recent cards at the root", async () => {
    const m = await mount();
    expect(m.host.textContent).toContain("這個資料夾是空的");
    await m.lib.createLibraryFolder("root", "Floor");
    await m.lib.importDrawingToLibrary(new File(["x"], "plan.dwg"));
    m.root.unmount();
    const n = await mount();
    const rows = Array.from(n.host.querySelectorAll(".lib-row")).map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("Floor");
    expect(rows[1]).toContain("DWG");
    expect(n.host.querySelectorAll(".recent-card")).toHaveLength(1);
  });

  it("back walks out one layer at a time and finally closes", async () => {
    const m = await mount();
    const folder = await m.lib.createLibraryFolder("root", "A");
    await act(async () => { m.view.handleLibraryBack(); });
    expect(m.onClose).toHaveBeenCalledTimes(1);
    m.root.unmount();
    const n = await mount();
    const row = Array.from(n.host.querySelectorAll<HTMLButtonElement>(".lib-row-main")).find((b) => b.textContent?.includes(folder.name))!;
    await act(async () => row.click());
    await n.settle();
    await act(async () => { n.view.handleLibraryBack(); });
    await n.settle();
    expect(n.onClose).not.toHaveBeenCalled();
    expect(n.host.querySelector(".lib-crumbs .current")?.textContent).toBe("我的圖面");
  });

  it("extracts an incoming archive into a new folder and keeps the archive itself", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const files = await import("../files/archives");
    const core = await import("../files/archiveCore");
    files.setArchiveWorkerFactory(() => {
      const worker: import("../files/archives").ArchiveWorkerLike = {
        onmessage: null, onerror: null, terminate() {},
        postMessage(message) { void handler(message); },
      };
      const handler = core.createArchiveHandler((reply) => setTimeout(() => worker.onmessage?.({ data: reply } as unknown as MessageEvent<import("../files/archiveCore").ArchiveReply>)), () => Promise.reject(new Error("no rar")));
      return worker;
    });
    const zip = zipSync({ "A/plan.dwg": strToU8("DWG"), "notes.pdf": strToU8("%PDF"), "readme.txt": strToU8("x") });
    const taken = vi.fn();
    const m = await mount({ incomingArchive: new File([zip as BlobPart], "Pack.zip"), onArchiveTaken: taken });
    await m.settle();
    expect(taken).toHaveBeenCalled();
    const dialog = m.host.querySelector(".lib-archive")!;
    expect(dialog.textContent).toContain("Pack.zip");
    const boxes = Array.from(dialog.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
    expect(boxes.filter((b) => b.checked)).toHaveLength(2);
    expect(boxes.filter((b) => b.disabled)).toHaveLength(1);
    const extract = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.includes("解壓縮所選檔案"))!;
    expect(extract.textContent).toContain("(2)");
    await act(async () => extract.click());
    await m.settle();
    await m.settle();
    expect(m.host.querySelector(".lib-archive")).toBeNull();
    expect(m.host.querySelector(".lib-toast")?.textContent).toContain("已解壓縮至圖面庫: 2");
    expect(m.host.querySelector(".lib-crumbs .current")?.textContent).toBe("Pack");
    expect((await m.lib.listLibraryChildren("root")).map((e) => e.name).sort()).toEqual(["Pack", "Pack.zip"]);
    files.setArchiveWorkerFactory(null);
  });

  it("the exports button replaces new-folder and lists exports newest first with the total size", async () => {
    const m = await mount();
    const buttons = Array.from(m.host.querySelectorAll<HTMLButtonElement>(".lib-actions button")).map((b) => b.textContent?.trim());
    expect(buttons).toEqual(["單一\n檔案", "整個\n資料夾", "歷史輸出"]);
    const exportsStore = await import("./exportStore");
    const shot = (name: string) => ({ blob: new Blob(["PNG"]), mime: "image/png" as const, fileName: name, widthPx: 10, heightPx: 10, dpi: 200, downscaled: false, thumbnail: new Blob(["t"]) });
    await exportsStore.saveExport(shot("old.png"));
    await new Promise((r) => setTimeout(r, 3));
    await exportsStore.saveExport({ ...shot("new.pdf"), mime: "application/pdf" as const });
    const entry = Array.from(m.host.querySelectorAll<HTMLButtonElement>(".lib-actions button")).find((b) => b.textContent?.includes("歷史輸出"))!;
    await act(async () => entry.click());
    await m.settle();
    expect(m.host.querySelector(".lib-titles h1")?.textContent).toBe("歷史輸出");
    const rows = Array.from(m.host.querySelectorAll(".lib-row.export")).map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("new.pdf");
    expect(rows[1]).toContain("old.png");
    expect(m.host.querySelector(".lib-exports-summary")?.textContent).toContain("已用空間 8 B");
    expect(m.host.querySelector(".lib-warning")).toBeNull();
    await act(async () => { m.view.handleLibraryBack(); });
    expect(m.host.querySelector(".lib-titles h1")?.textContent).toBe("圖面庫");
    expect(m.onClose).not.toHaveBeenCalled();
  });

  it("context menu retains share, rename and delete; tap opens the file", async () => {
    const actions = await import("./exportFileActions");
    const shareFile = vi.fn(async () => {});
    const openFile = vi.fn(async () => {});
    actions.setExportFileActions({ shareFile, openFile });
    const exportsStore = await import("./exportStore");
    await exportsStore.saveExport({ blob: new Blob(["PNG"]), mime: "image/png", fileName: "plan.png", widthPx: 1, heightPx: 1, dpi: 200, downscaled: true, thumbnail: new Blob(["t"]) });
    const m = await mount();
    const entry = Array.from(m.host.querySelectorAll<HTMLButtonElement>(".lib-actions button")).find((b) => b.textContent?.includes("歷史輸出"))!;
    await act(async () => entry.click());
    await m.settle();
    const row = () => m.host.querySelector<HTMLButtonElement>(".lib-row.export .lib-row-main")!;
    expect(row().textContent).toContain("已降解析度");
    await act(async () => row().click());
    await m.settle();
    expect(openFile).toHaveBeenCalledTimes(1);
    await act(async () => { row().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })); });
    const menu = () => m.host.querySelector(".lib-sheet");
    expect(menu()?.textContent).toContain("plan.png");
    const tile = (label: string) => Array.from(menu()!.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.includes(label))!;
    await act(async () => tile("分享").click());
    await m.settle();
    expect(shareFile).toHaveBeenCalledWith(expect.any(File), "plan.png", "image/png");
    await act(async () => { row().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })); });
    await act(async () => tile("重新命名").click());
    const input = m.host.querySelector<HTMLInputElement>(".lib-dialog input")!;
    expect(input.value).toBe("plan");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, "現場"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => m.host.querySelector<HTMLFormElement>(".lib-dialog form")!.requestSubmit());
    await m.settle();
    await m.settle();
    expect(row().textContent).toContain("現場.png");
    await act(async () => { row().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })); });
    await act(async () => tile("刪除").click());
    const confirm = Array.from(m.host.querySelectorAll<HTMLButtonElement>(".lib-dialog button")).find((b) => b.textContent === "刪除")!;
    await act(async () => confirm.click());
    await m.settle();
    await m.settle();
    expect(m.host.querySelector(".lib-row.export")).toBeNull();
    expect(m.host.textContent).toContain("還沒有歷史輸出");
  });

  it("shows a dismissable red warning above 500 MB", async () => {
    const exportsStore = await import("./exportStore");
    await new Promise<void>((resolve) => {
      const open = indexedDB.open(exportsStore.EXPORTS_DB_NAME, 1);
      open.onupgradeneeded = () => { open.result.createObjectStore("exports", { keyPath: "id" }); open.result.createObjectStore("files", { keyPath: "id" }); };
      open.onsuccess = () => {
        const tx = open.result.transaction("exports", "readwrite");
        tx.objectStore("exports").put({ id: "big", name: "big.pdf", format: "pdf", mime: "application/pdf", size: 600 * 1024 * 1024, thumbnailSize: 0, widthPx: 1, heightPx: 1, dpi: 200, downscaled: false, createdAt: 1, updatedAt: 1 });
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
    });
    const m = await mount();
    const entry = Array.from(m.host.querySelectorAll<HTMLButtonElement>(".lib-actions button")).find((b) => b.textContent?.includes("歷史輸出"))!;
    await act(async () => entry.click());
    await m.settle();
    const warning = m.host.querySelector(".lib-warning");
    expect(warning?.textContent).toContain("500 MB");
    await act(async () => warning!.querySelector<HTMLButtonElement>("button")!.click());
    expect(m.host.querySelector(".lib-warning")).toBeNull();
    expect(m.host.querySelector(".lib-row.export")).not.toBeNull();
  });
it("hold a row to select; all/none, back leaves selecting, confirmed delete removes only the selected (用戶 2026-10-27)", async () => {
    const first = await mount();
    await first.lib.createLibraryFolder("root", "Floor");
    for (const name of ["a.dwg", "b.dwg", "c.dwg"]) await first.lib.importDrawingToLibrary(new File(["x"], name));
    first.root.unmount();
    const m = await mount();
    const checks = () => m.host.querySelectorAll<HTMLInputElement>(".lib-row-check");
    const checked = () => [...checks()].filter((c) => c.checked).length;
    const button = (text: string) => [...m.host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
    const tap = (el: HTMLElement) => { el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1 })); el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })); el.click(); };
    const rowOf = (name: string) => [...m.host.querySelectorAll<HTMLButtonElement>(".lib-row-main")].find((b) => b.textContent?.includes(name))!;
    expect(checks()).toHaveLength(0);
    // hold: selecting starts with that row; the more buttons go away
    await act(async () => { rowOf("b.dwg").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1 })); await new Promise((r) => setTimeout(r, 650)); });
    expect(checks()).toHaveLength(4);
    expect(checked()).toBe(1);
    expect(m.host.querySelector(".lib-more")).toBeNull();
    await act(async () => tap(rowOf("c.dwg")));
    expect(checked()).toBe(2);
    await act(async () => button("全部選擇").click());
    expect(checked()).toBe(4);
    await act(async () => button("全部取消").click());
    expect(checked()).toBe(0);
    await act(async () => { m.view.handleLibraryBack(); });
    expect(checks()).toHaveLength(0);
    expect(m.onClose).not.toHaveBeenCalled();
    // select b and c, delete: confirm first, then only those two go
    await act(async () => { rowOf("b.dwg").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1 })); await new Promise((r) => setTimeout(r, 650)); });
    await act(async () => tap(rowOf("c.dwg")));
    await act(async () => button("刪除").click());
    expect(m.host.querySelector("[role=alertdialog]")?.textContent).toContain("刪除所選項目");
    expect((await m.lib.listLibraryChildren("root"))).toHaveLength(4);
    await act(async () => button("確認刪除").click());
    await m.settle();
    expect((await m.lib.listLibraryChildren("root")).map((e) => e.name).sort()).toEqual(["Floor", "a.dwg"]);
    expect(checks()).toHaveLength(0);
  });
});
