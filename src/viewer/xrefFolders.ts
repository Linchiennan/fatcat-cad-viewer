// Folders the user chose once for external references and asked to remember.
// Desktop Chrome / Edge keep a directory handle (File System Access API); phones' browsers cannot,
// and the Android app keeps its own folder grant natively. Only local reads; never uploads.
type DirHandle = { kind: "directory"; name: string; values(): AsyncIterable<any>; queryPermission?(o: { mode: "read" }): Promise<PermissionState> };

const DB = "fatcat-xref-folders", STORE = "folders";
const MAX_ENTRIES = 5000, MAX_DEPTH = 8;

export const canRememberFolders = () => typeof (globalThis as any).showDirectoryPicker === "function";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  try {
    return await new Promise<T>((resolve, reject) => { const r = op(d.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  } finally { d.close(); }
}

/** Ask for a folder, remember it, and return its drawing files for immediate use. */
export async function pickAndRememberFolder(): Promise<{ name: string; files: File[] }> {
  const handle: DirHandle = await (globalThis as any).showDirectoryPicker({ id: "fatcat-xref", mode: "read" });
  await run("readwrite", (s) => s.put(handle, handle.name));
  return { name: handle.name, files: (await walk(handle, null)).map((f) => f.file) };
}

export async function rememberedFolderNames(): Promise<string[]> {
  if (!canRememberFolders()) return [];
  return (await run("readonly", (s) => s.getAllKeys())).map(String);
}

export async function forgetFolder(name: string): Promise<void> {
  await run("readwrite", (s) => s.delete(name));
}

async function walk(root: DirHandle, names: Set<string> | null): Promise<{ file: File; origin: string }[]> {
  const out: { file: File; origin: string }[] = [];
  let seen = 0;
  const visit = async (dir: DirHandle, prefix: string, depth: number) => {
    for await (const entry of dir.values()) {
      if (++seen > MAX_ENTRIES) return;
      if (entry.kind === "directory") { if (depth < MAX_DEPTH) await visit(entry, prefix + entry.name + "/", depth + 1); continue; }
      const lower = String(entry.name).toLocaleLowerCase("en-US");
      if (!/\.(dwg|dxf|png|jpe?g)$/.test(lower) || (names && !names.has(lower))) continue;
      const file: File = await entry.getFile();
      Object.defineProperty(file, "webkitRelativePath", { value: prefix + entry.name });
      out.push({ file, origin: `記住的資料夾「${root.name}」` });
    }
  };
  await visit(root, root.name + "/", 0);
  return out;
}

/** Same-name files in remembered folders that are still readable without asking again. */
export async function rememberedFolderFiles(names: Set<string>): Promise<{ file: File; origin: string }[]> {
  if (!canRememberFolders() || !names.size) return [];
  const handles = await run<DirHandle[]>("readonly", (s) => s.getAll());
  const out: { file: File; origin: string }[] = [];
  for (const h of handles) {
    // A permission that needs a new prompt cannot be asked for without a tap; the panel offers that.
    if ((await h.queryPermission?.({ mode: "read" })) !== "granted") continue;
    try { out.push(...(await walk(h, names))); } catch { /* Folder moved or deleted: skip it. */ }
  }
  return out;
}

/** Re-grant remembered folders after a browser restart (needs a tap). */
export async function regrantFolders(): Promise<number> {
  const handles = await run<any[]>("readonly", (s) => s.getAll());
  let granted = 0;
  for (const h of handles) if ((await h.requestPermission?.({ mode: "read" })) === "granted") granted++;
  return granted;
}
