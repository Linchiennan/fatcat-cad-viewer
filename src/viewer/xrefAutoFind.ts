// Find external references by themselves before asking: xrefs usually sit next to the drawing.
// A browser or the Android app cannot look into the opened file's folder, so the search covers what
// the app may read: drawings already in the library (same folder first) and folders the user chose
// once and asked to remember. Only a single same-name match is used; anything ambiguous stays manual.
import { listLibraryDrawings, listLibraryFolders, readLibraryDrawing, ROOT_ID } from "../library/drawingLibrary";
import { assembleXrefs, endsWithXrefName, normalizeCadPath, type XrefStatus } from "./xrefs";
import { rememberedFolderFiles } from "./xrefFolders";
import { rememberedXrefFiles } from "./xrefMemory";

/** File names a reference path can be found under (a path without extension also matches .dwg/.dxf). */
export function xrefFileNames(path: string): string[] {
  const name = normalizeCadPath(path).split("/").at(-1) ?? "";
  if (!name) return [];
  return /\.[a-z0-9]{2,4}$/i.test(name) ? [name] : [name, name + ".dwg", name + ".dxf"];
}

type Entry = { id: string; name: string; parentId: string };
/**
 * The project a library folder belongs to: its top folder under the root (the root itself for drawings kept there).
 * `parents` maps folder id → parent folder id.
 */
export function projectOf(folderId: string, parents: ReadonlyMap<string, string>): string {
  let id = folderId;
  for (let guard = 0; guard < 64; guard++) {
    const up = parents.get(id);
    if (!up || up === ROOT_ID) return id;
    id = up;
  }
  return id;
}

/**
 * The library entry for a reference: the only same-name drawing, preferring the main drawing's folder. Only drawings of
 * the main drawing's project count: two jobs can both have a「圖框.dwg」, and taking the other job's one draws the wrong
 * frame without a word (用戶 2026-10-30「跨專案的外參比對沒有分隔」). Without folder data each folder is its own project.
 */
export function pickLibraryEntry(path: string, entries: readonly Entry[], main?: Entry, parents: ReadonlyMap<string, string> = new Map()): Entry | "ambiguous" | null {
  const names = new Set(xrefFileNames(path));
  const project = main ? projectOf(main.parentId, parents) : null;
  const others = entries.filter((e) => e.id !== main?.id && (project === null || projectOf(e.parentId, parents) === project));
  let hits = others.filter((e) => names.has(normalizeCadPath(e.name).split("/").at(-1) ?? ""));
  // No same-name drawing: a copy renamed with a prefix ("…__B3F 建築圖.dwg") counts when it is the only one nearby or overall.
  if (!hits.length) hits = others.filter((e) => [...names].some((n) => endsWithXrefName(e.name, n)));
  if (!hits.length) return null;
  const near = main ? hits.filter((e) => e.parentId === main.parentId) : [];
  if (near.length === 1) return near[0];
  if (near.length > 1) return "ambiguous";
  return hits.length === 1 ? hits[0] : "ambiguous";
}

/** One candidate file per reference path, with where it came from. */
async function findFiles(paths: readonly string[], entryId?: string): Promise<{ file: File; origin: string }[]> {
  const out: { file: File; origin: string }[] = [], left: string[] = [];
  let entries: Entry[] = [];
  const parents = new Map<string, string>();
  try {
    entries = await listLibraryDrawings();
    for (const f of await listLibraryFolders()) parents.set(f.id, f.parentId);
  } catch { /* No library (private window): folders only. */ }
  const main = entries.find((e) => e.id === entryId);
  for (const path of paths) {
    const hit = pickLibraryEntry(path, entries, main, parents);
    if (hit && hit !== "ambiguous") {
      try { out.push({ file: await readLibraryDrawing(hit.id), origin: "圖面庫" }); continue; } catch { /* Fall through to folders. */ }
    }
    if (hit !== "ambiguous") left.push(path);
  }
  if (left.length) {
    const wanted = new Map(left.map((p) => [p, new Set(xrefFileNames(p))]));
    const all = new Set([...wanted.values()].flatMap((s) => [...s]));
    const found = await rememberedFolderFiles(all).catch(() => []);
    for (const [, names] of wanted) {
      let hits = found.filter((f) => names.has(f.file.name.toLocaleLowerCase("en-US")));
      if (!hits.length) hits = found.filter((f) => [...names].some((n) => endsWithXrefName(f.file.name, n)));
      if (hits.length === 1) out.push(hits[0]);
    }
  }
  return out;
}

export type AutoXrefResult = { file: File; statuses: XrefStatus[]; files: File[]; mapping: Record<string, string>; manual: Set<File> };

/**
 * Load what can be found, including references inside references (up to three rounds).
 * Returns null when nothing was found, so the drawing stays as opened and the panel stays manual.
 */
export async function autoAssembleXrefs(source: File, paths: readonly string[], entryId?: string): Promise<AutoXrefResult | null> {
  const files: File[] = [], origins = new Map<string, string>(), tried = new Set<string>();
  // Files the user picked for this drawing before come first, each tied to its reference (and allowed to load one
  // saved unloaded, as when it was picked). 用戶 2026-10-28：再次開圖就能自動套用.
  const remembered = entryId ? await rememberedXrefFiles(entryId).catch(() => null) : null;
  const mapping: Record<string, string> = { ...(remembered?.mapping ?? {}) }, manual = new Set<File>(remembered?.files ?? []);
  for (const f of remembered?.files ?? []) { files.push(f); origins.set(f.webkitRelativePath || f.name, "記住的外參"); }
  let todo = [...new Set(paths)], result: { file: File; statuses: XrefStatus[] } | null = null;
  if (files.length) {
    result = await assembleXrefs(source, files, mapping, new Set(), manual);
    todo = result.statuses.filter((s) => s.status.startsWith("找不到")).map((s) => s.path);
  }
  for (let round = 0; round < 3 && todo.length; round++) {
    todo.forEach((p) => tried.add(normalizeCadPath(p)));
    const found = (await findFiles(todo, entryId)).filter((f) => !files.some((g) => g.name === f.file.name));
    if (!found.length) break;
    for (const f of found) { files.push(f.file); origins.set(f.file.webkitRelativePath || f.file.name, f.origin); }
    result = await assembleXrefs(source, files, mapping, new Set(), manual);
    todo = result.statuses.filter((s) => s.status.startsWith("找不到") && !tried.has(normalizeCadPath(s.path))).map((s) => s.path);
  }
  if (!result) return null;
  for (const s of result.statuses) {
    const loaded = /^已載入：(.+?)(；|$)/.exec(s.status);
    const origin = loaded && origins.get(loaded[1]);
    if (origin) s.status = s.status.replace("已載入：", `已自動載入（${origin}）：`);
  }
  return { ...result, files, mapping, manual };
}
