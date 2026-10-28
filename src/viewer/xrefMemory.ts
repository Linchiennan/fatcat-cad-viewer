// Xref files the user picked are kept (用戶 2026-10-28：加入正確的外參後，第二次打開不要再重選). Each picked file goes into the
// library, in a 「外部參考」 folder next to the main drawing (same-name files: identical content is reused, different content
// asks as any library import does), and the main drawing remembers which library entry each of its references uses.
// Opening that drawing again applies them, references flagged saved-unloaded included, since the user chose them.
import {
  createLibraryFolder, importDrawingWithDecision, listLibraryChildren, listLibraryDrawings, readLibraryDrawing,
  type ImportChoice, type ImportConflict,
} from "../library/drawingLibrary";

/** Name of the folder made next to the main drawing for its reference files. */
export const XREF_FOLDER_NAME = "外部參考";
const KEY = "fatcat-xref-memory:";

/** Reference key (parent file | reference name, as assembleXrefs reports it) → library entry id. */
export type XrefMemory = Record<string, string>;

export function loadXrefMemory(mainEntryId: string): XrefMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY + mainEntryId) ?? "{}");
    return raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as XrefMemory : {};
  } catch {
    return {};
  }
}

function saveXrefMemory(mainEntryId: string, memory: XrefMemory): void {
  try {
    if (Object.keys(memory).length) localStorage.setItem(KEY + mainEntryId, JSON.stringify(memory));
    else localStorage.removeItem(KEY + mainEntryId);
  } catch { /* private window / storage full: applies this time only */ }
}

export function rememberXref(mainEntryId: string, key: string, libraryEntryId: string): void {
  saveXrefMemory(mainEntryId, { ...loadXrefMemory(mainEntryId), [key]: libraryEntryId });
}

export function forgetXrefs(mainEntryId: string): void {
  saveXrefMemory(mainEntryId, {});
}

/**
 * The remembered files of a drawing, read from the library, with the "@index" mapping assembleXrefs takes. A file
 * deleted from the library is left out (its reference shows as missing again) and dropped from the memory.
 */
export async function rememberedXrefFiles(mainEntryId: string): Promise<{ files: File[]; mapping: Record<string, string> } | null> {
  const memory = loadXrefMemory(mainEntryId);
  if (!Object.keys(memory).length) return null;
  const files: File[] = [], mapping: Record<string, string> = {}, byEntry = new Map<string, number>(), kept: XrefMemory = {};
  for (const [key, entryId] of Object.entries(memory)) {
    let index = byEntry.get(entryId);
    if (index === undefined) {
      try { files.push(await readLibraryDrawing(entryId)); } catch { continue; }
      index = files.length - 1;
      byEntry.set(entryId, index);
    }
    mapping[key] = "@" + index;
    kept[key] = entryId;
  }
  if (Object.keys(kept).length !== Object.keys(memory).length) saveXrefMemory(mainEntryId, kept);
  return files.length ? { files, mapping } : null;
}

/** The 「外部參考」 folder next to the main drawing, made when missing. */
async function xrefFolder(mainEntryId: string): Promise<string> {
  const main = (await listLibraryDrawings()).find((e) => e.id === mainEntryId);
  if (!main) throw new Error("main drawing is not in the library");
  const existing = (await listLibraryChildren(main.parentId)).find((e) => e.kind === "folder" && e.name === XREF_FOLDER_NAME);
  return existing ? existing.id : (await createLibraryFolder(main.parentId, XREF_FOLDER_NAME)).id;
}

/** Put a picked file into the 「外部參考」 folder; the library copy (as read back) and its entry id, or null when cancelled. */
export async function storeXrefFile(mainEntryId: string, file: File, decide: (conflict: ImportConflict) => Promise<ImportChoice>): Promise<{ file: File; entryId: string } | null> {
  const result = await importDrawingWithDecision(file, await xrefFolder(mainEntryId), decide);
  if (result.status === "cancelled") return null;
  return { file: await readLibraryDrawing(result.entry.id), entryId: result.entry.id };
}
