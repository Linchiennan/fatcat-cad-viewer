// DXF writes control characters inside strings in caret form: a line feed is "^J", a carriage return "^M", a tab
// "^I". LibreDWG does this when a DWG text holds a raw line break (e.g. a note typed with Enter inside an MTEXT
// value). CAD shows the break; the viewer printed "^J". Only these three are decoded, so a literal "^" stays.
type Any = any;
const CARET = /\^([JMI])/g;

/** MTEXT: a line feed is a paragraph break; in one-line text (TEXT / ATTRIB) it becomes a space. */
export function decodeCaretText(text: string, multiline: boolean): string {
  if (!text.includes("^")) return text;
  return text.replace(CARET, (_, c: string) => (c === "J" ? (multiline ? "\\P" : " ") : c === "I" ? " " : ""));
}

/** Apply to every text-bearing entity in the drawing and its blocks; returns how many changed. */
export function decodeCaretEntities(doc: Any): number {
  let changed = 0;
  const all = [...(doc.entities ?? []), ...Object.values(doc.blocks ?? {}).flatMap((b: Any) => b.entities ?? [])];
  for (const e of all) {
    for (const key of ["text", "value"]) {
      if (typeof e[key] === "string" && e[key].includes("^")) {
        const next = decodeCaretText(e[key], e.type === "MTEXT");
        if (next !== e[key]) { e[key] = next; changed++; }
      }
    }
  }
  return changed;
}
