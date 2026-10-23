// Find external references by themselves before asking: xrefs usually sit next to the drawing.
// A browser or the Android app cannot look into the opened file's folder, so the search covers what
// the app may read: drawings already in the library (same folder first) and folders the user chose
// once and asked to remember. Only a single same-name match is used; anything ambiguous stays manual.
import { listLibraryDrawings, readLibraryDrawing } from "../library/drawingLibrary";
import { assembleXrefs, normalizeCadPath, type XrefStatus } from "./xrefs";
import { rememberedFolderFiles } from "./xrefFolders";

/** File names a reference path can be found under (a path without extension also matches .dwg/.dxf). */
export function xrefFileNames(path: string): string[] {
  const name = normalizeCadPath(path).split("/").at(-1) ?? "";
  if (!name) return [];
  return /\.[a-z0-9]{2,4}$/i.test(name) ? [name] : [name, name + ".dwg", name + ".dxf"];
}

type Entry = { id: string; name: string; parentId: string };
/** The library entry for a reference: the only same-name drawing, preferring the main drawing's folder. */
export function pickLibraryEntry(path: string, entries: readonly Entry[], main?: Entry): Entry | "ambiguous" | null {
  const names = new Set(xrefFileNames(path));
  const hits = entries.filter((e) => e.id !== main?.id && names.has(normalizeCadPath(e.name).split("/").at(-1) ?? ""));
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
  try { entries = await listLibraryDrawings(); } catch { /* No library (private window): folders only. */ }
  const main = entries.find((e) => e.id === entryId);
  for (const path of paths) {
    const hit = pickLibraryEntry(path, entries, main);
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
      const hits = found.filter((f) => names.has(f.file.name.toLocaleLowerCase("en-US")));
      if (hits.length === 1) out.push(hits[0]);
    }
  }
  return out;
}

export type AutoXrefResult = { file: File; statuses: XrefStatus[]; files: File[] };

/**
 * Load what can be found, including references inside references (up to three rounds).
 * Returns null when nothing was found, so the drawing stays as opened and the panel stays manual.
 */
export async function autoAssembleXrefs(source: File, paths: readonly string[], entryId?: string): Promise<AutoXrefResult | null> {
  const files: File[] = [], origins = new Map<string, string>(), tried = new Set<string>();
  let todo = [...new Set(paths)], result: { file: File; statuses: XrefStatus[] } | null = null;
  for (let round = 0; round < 3 && todo.length; round++) {
    todo.forEach((p) => tried.add(normalizeCadPath(p)));
    const found = (await findFiles(todo, entryId)).filter((f) => !files.some((g) => g.name === f.file.name));
    if (!found.length) break;
    for (const f of found) { files.push(f.file); origins.set(f.file.webkitRelativePath || f.file.name, f.origin); }
    result = await assembleXrefs(source, files);
    todo = result.statuses.filter((s) => s.status.startsWith("找不到") && !tried.has(normalizeCadPath(s.path))).map((s) => s.path);
  }
  if (!result) return null;
  for (const s of result.statuses) {
    const loaded = /^已載入：(.+?)(；|$)/.exec(s.status);
    const origin = loaded && origins.get(loaded[1]);
    if (origin) s.status = s.status.replace("已載入：", `已自動載入（${origin}）：`);
  }
  return { ...result, files };
}
