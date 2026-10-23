// AutoCAD fields (欄位) in TEXT/MTEXT/ATTRIB. The file stores the value last computed in its own
// drawing; "\AcVar ctab" (current layout name) must follow the layout being shown, as CAD re-evaluates it.
// Chain: entity 360 → DICTIONARY "ACAD_FIELD" → DICTIONARY "TEXT" → FIELD "_text" (code with
// %<\_FldIdx n>%, children via 360) → child FIELD (e.g. "\AcVar ctab", cached value in 301).
type Tag = [number, string];
type Rec = { type: string; tags: Tag[] };

export const CTAB_TOKEN = "\u0001CTAB\u0001";

const first = (r: Rec, code: number) => r.tags.find((t) => t[0] === code)?.[1];

/** Template for an entity whose text holds a CTAB field, or null when it has none we can recompute. */
export function fieldTemplate(entity: Rec, byHandle: Map<string, Rec>): string | null {
  const ext = first(entity, 360);
  const dict = ext ? byHandle.get(ext) : undefined;
  const entry = (d: Rec | undefined, name: string) => {
    if (!d || d.type !== "DICTIONARY") return undefined;
    const i = d.tags.findIndex((t) => t[0] === 3 && t[1] === name);
    return i >= 0 ? d.tags.slice(i + 1).find((t) => t[0] === 350 || t[0] === 360)?.[1] : undefined;
  };
  const fieldDict = byHandle.get(entry(dict, "ACAD_FIELD") ?? "");
  const root = byHandle.get(entry(fieldDict, "TEXT") ?? "");
  if (!root || root.type !== "FIELD") return null;
  const code = first(root, 2) ?? "";
  const children = root.tags.filter((t) => t[0] === 360).map((t) => byHandle.get(t[1]));
  let hasCtab = false, ok = true;
  const text = code.replace(/%<\\_FldIdx (\d+)>%/g, (_m, n: string) => {
    const child = children[Number(n)];
    if (!child || child.type !== "FIELD") { ok = false; return ""; }
    if (/^\\AcVar\s+ctab$/i.test((first(child, 2) ?? "").trim())) { hasCtab = true; return CTAB_TOKEN; }
    // Other fields keep the value the file last computed.
    const cached = child.tags.filter((t) => t[0] === 301).at(-1)?.[1];
    if (cached === undefined) ok = false;
    return cached ?? "";
  });
  return ok && hasCtab ? text : null;
}

/** Fill CTAB fields for the layout being shown (CAD shows "Model" in model space). */
export function applyLayoutFields(entities: { cadFieldTemplate?: string; text?: string }[], layout: string): void {
  for (const e of entities) if (e.cadFieldTemplate) e.text = e.cadFieldTemplate.split(CTAB_TOKEN).join(layout);
}
