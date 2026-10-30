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

const lower = (s: string) => s.toLocaleLowerCase("en-US");
/** Folder parts of a saved reference path, as written ("..", ".", names), without the file name. */
function pathParts(path: string): string[] {
  return path.replaceAll("\\", "/").split("/").slice(0, -1);
}
/** A path from a drive or a server ("D:\…", "\\server\…", "/…") is not relative to the main drawing. */
function isAbsolute(path: string): boolean {
  return /^[a-z]:/i.test(path) || /^[\\/]/.test(path);
}
/** Folder names of a saved path, outermost first, without drive, "." and "..". */
export function savedFolders(path: string): string[] {
  return pathParts(path).filter((s) => s && s !== "." && s !== ".." && !/^[a-z]:$/i.test(s)).map(lower);
}
/** The library folder a relative saved path leads to from `start`, or null when a step does not exist. */
export function walkSavedPath(path: string, start: string, parents: ReadonlyMap<string, string>, folderNames: ReadonlyMap<string, string>): string | null {
  if (isAbsolute(path) || !folderNames.size && pathParts(path).some((s) => s && s !== ".")) return null;
  let at = start;
  for (const step of pathParts(path)) {
    if (!step || step === ".") continue;
    if (step === "..") { if (at === ROOT_ID) return null; const up = parents.get(at); if (!up) return null; at = up; continue; }
    const into = [...parents].filter(([id, parent]) => parent === at && lower(folderNames.get(id) ?? "") === lower(step)).map(([id]) => id);
    if (into.length !== 1) return null;
    at = into[0];
  }
  return at;
}
/** Folder names from a folder up to the root, innermost first. */
function folderChain(folderId: string, parents: ReadonlyMap<string, string>, folderNames: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  for (let id = folderId, guard = 0; id !== ROOT_ID && guard < 64; guard++) {
    const name = folderNames.get(id);
    if (name === undefined) break;
    out.push(lower(name));
    id = parents.get(id) ?? ROOT_ID;
  }
  return out;
}
/** How many of the path's last folders match the folder chain, innermost first. */
function matchingTail(tail: readonly string[], chain: readonly string[]): number {
  let n = 0;
  while (n < tail.length && n < chain.length && tail[tail.length - 1 - n] === chain[n]) n++;
  return n;
}

/**
 * The candidates nearest to the main drawing: walking up from its folder, those inside the first folder that holds any.
 * One import often holds many jobs (世舜「101年」: 6 jobs, each with its own 世舜圖框.dwg), so the top library folder is
 * not the job; the nearest copy is (a drawing moved into「OLD」still reaches its job's frame two levels up).
 */
function nearest(cands: readonly Entry[], main: Entry, parents: ReadonlyMap<string, string>): Entry[] {
  const level = (e: Entry) => {
    const ups = new Set<string>();
    for (let id = e.parentId, guard = 0; guard < 64; guard++) { ups.add(id); if (id === ROOT_ID) break; id = parents.get(id) ?? ROOT_ID; }
    let n = 0;
    for (let id = main.parentId; n < 64; n++) { if (ups.has(id)) return n; if (id === ROOT_ID) break; id = parents.get(id) ?? ROOT_ID; }
    return 64;
  };
  const scored = cands.map((e) => ({ e, n: level(e) })), best = Math.min(...scored.map((x) => x.n));
  return scored.filter((x) => x.n === best).map((x) => x.e);
}

/**
 * The library entry for a reference: the only same-name drawing, preferring the main drawing's folder. Only drawings of
 * the main drawing's project count: two jobs can both have a「圖框.dwg」, and taking the other job's one draws the wrong
 * frame without a word (用戶 2026-10-30「跨專案的外參比對沒有分隔」). Without folder data each folder is its own project.
 */
export function pickLibraryEntry(path: string, entries: readonly Entry[], main?: Entry, parents: ReadonlyMap<string, string> = new Map(), folderNames: ReadonlyMap<string, string> = new Map()): Entry | "ambiguous" | null {
  const names = new Set(xrefFileNames(path));
  const fileName = (e: Entry) => normalizeCadPath(e.name).split("/").at(-1) ?? "";
  // 1. The saved path itself, walked through the library's folders from the main drawing's folder (13F 牆板放樣:
  //    「..\外部參考\002-結構平面圖\13F-結構.dwg」). Every floor of 7F～14F has its own 外部參考 with the same file names;
  //    the path picks this floor's copy, wherever the job sits in the library.
  const walked = main ? walkSavedPath(path, main.parentId, parents, folderNames) : null;
  if (walked !== null) {
    const there = entries.filter((e) => e.id !== main?.id && e.parentId === walked && names.has(fileName(e)));
    if (there.length === 1) return there[0];
  }
  // 2. The path's last folders (外部參考 / 002-結構平面圖) against each same-name drawing's folders: a folder imported on
  //    its own (no common parent) is still found, taking the deepest match, inside the job when several match as deep.
  const tail = savedFolders(path);
  if (tail.length) {
    const scored = entries.filter((e) => e.id !== main?.id && names.has(fileName(e)))
      .map((e) => ({ e, depth: matchingTail(tail, folderChain(e.parentId, parents, folderNames)) }))
      // Outside the main drawing's job every saved folder must match, not just a common name like「外部參考」.
      .filter((x) => x.depth > 0 && (x.depth === tail.length || !main || projectOf(x.e.parentId, parents) === projectOf(main.parentId, parents)));
    const best = Math.max(0, ...scored.map((x) => x.depth)), top = scored.filter((x) => x.depth === best).map((x) => x.e);
    if (top.length === 1) return top[0];
    if (top.length > 1 && main) {
      const own = top.filter((e) => projectOf(e.parentId, parents) === projectOf(main.parentId, parents));
      const near = own.length ? nearest(own, main, parents) : [];
      if (near.length === 1) return near[0];
      return "ambiguous";
    }
  }
  // 3. No usable path: the only same-name drawing of the main drawing's project.
  const project = main ? projectOf(main.parentId, parents) : null;
  const others = entries.filter((e) => e.id !== main?.id && (project === null || projectOf(e.parentId, parents) === project));
  let hits = others.filter((e) => names.has(normalizeCadPath(e.name).split("/").at(-1) ?? ""));
  // No same-name drawing: a copy renamed with a prefix ("…__B3F 建築圖.dwg") counts when it is the only one nearby or overall.
  if (!hits.length) hits = others.filter((e) => [...names].some((n) => endsWithXrefName(e.name, n)));
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  const near = main ? nearest(hits, main, parents) : [];
  return near.length === 1 ? near[0] : "ambiguous";
}

/** One candidate file per reference path, with where it came from. */
async function findFiles(paths: readonly string[], entryId?: string): Promise<{ file: File; origin: string }[]> {
  const out: { file: File; origin: string }[] = [], left: string[] = [];
  let entries: Entry[] = [];
  const parents = new Map<string, string>(), folderNames = new Map<string, string>();
  try {
    entries = await listLibraryDrawings();
    for (const f of await listLibraryFolders()) { parents.set(f.id, f.parentId); folderNames.set(f.id, f.name); }
  } catch { /* No library (private window): folders only. */ }
  const main = entries.find((e) => e.id === entryId);
  for (const path of paths) {
    const hit = pickLibraryEntry(path, entries, main, parents, folderNames);
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
