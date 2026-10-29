// Guest storage (用戶 2026-10-29：訪客的註記和輸出關分頁就清空): IndexedDB and localStorage are swapped for in-memory
// copies before anything opens them, so the guest never reads or writes the device's real library, exports, marks or
// settings, and a closed tab leaves nothing behind. Picking the guest's own files is blocked here as well, behind the
// hidden buttons, so no other path (a label, a drop) can bring one in.
import * as fake from "fake-indexeddb";
import { DEMO_FILES } from "./guestMode";

/** Settings a guest keeps from this browser: the language and the interface style only. */
const KEPT_SETTINGS = ["fatcat.locale", "fatcat-ui-style"];

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  getItem(key: string) { return this.items.get(String(key)) ?? null; }
  setItem(key: string, value: string) { this.items.set(String(key), String(value)); }
  removeItem(key: string) { this.items.delete(String(key)); }
  clear() { this.items.clear(); }
}

function replace(name: string, value: unknown) {
  Object.defineProperty(window, name, { value, configurable: true, writable: true });
}

export function installGuestStorage(): void {
  const memory = new MemoryStorage();
  for (const key of KEPT_SETTINGS) {
    try { const v = window.localStorage.getItem(key); if (v !== null) memory.setItem(key, v); } catch { /* none kept */ }
  }
  replace("localStorage", memory);
  replace("indexedDB", fake.indexedDB);
  for (const [name, value] of Object.entries(fake)) if (name.startsWith("IDB")) replace(name, value);
  // No picking the guest's own files or folders.
  replace("showOpenFilePicker", undefined);
  replace("showDirectoryPicker", undefined);
  document.addEventListener("click", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === "file") e.preventDefault();
  }, true);
  for (const type of ["dragover", "drop"]) window.addEventListener(type, (e) => { e.preventDefault(); e.stopPropagation(); }, true);
}

/** Put the demo drawings into the (empty, in-memory) library. A missing file is skipped, not fatal. */
export async function seedDemoLibrary(): Promise<number> {
  const { importDrawingToLibrary, ROOT_ID } = await import("../library/drawingLibrary");
  let n = 0;
  for (const name of [...DEMO_FILES].reverse()) { // the plan last, so it heads 最近開啟
    try {
      const res = await fetch(`./demo/${encodeURIComponent(name)}`);
      if (!res.ok) continue;
      const blob = await res.blob();
      await importDrawingToLibrary(new File([blob], name, { type: blob.type, lastModified: Date.UTC(2026, 9, 29) }), ROOT_ID);
      n++;
    } catch { /* the guest still gets the other demos */ }
  }
  return n;
}
