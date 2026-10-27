// Files the user hands the xref panel add up (用戶 2026-10-27：選一次外參後去選另一個就被替代). A drawing whose
// references sit in different folders (11F 給水: ..\外部參考\圖框, ..\外部參考\001-建築平面圖\, ..\外部參考\002-結構平面圖\)
// needs one pick per folder on a phone, so each pick is appended, and manual mappings ("@index") stay valid.

/** Same file picked again: same path (or name) and size. */
export const sameFile = (a: File, b: File) => (a.webkitRelativePath || a.name) === (b.webkitRelativePath || b.name) && a.size === b.size;

/** `added` appended after `files`, leaving out files already there; existing indices do not move. */
export function mergeXrefFiles(files: readonly File[], added: readonly File[]): File[] {
  const out = [...files];
  for (const f of added) if (!out.some((g) => sameFile(g, f))) out.push(f);
  return out;
}

/** Drop the file at `index`; mappings to it are cleared and later "@k" mappings shift down by one. */
export function removeXrefFile(files: readonly File[], mapping: Record<string, string>, index: number): { files: File[]; mapping: Record<string, string> } {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    const m = /^@(\d+)$/.exec(value);
    if (!m) { next[key] = value; continue; }
    const k = Number(m[1]);
    if (k === index) continue;
    next[key] = k > index ? "@" + (k - 1) : value;
  }
  return { files: files.filter((_, i) => i !== index), mapping: next };
}
