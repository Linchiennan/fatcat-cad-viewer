// Legacy AutoCAD multibyte codes "\M+nXXXX" (MIF): n selects the code page, XXXX is the 2-byte
// character. Older DWGs (e.g. Japanese TOTO sheets) keep CJK text this way; CAD shows the decoded text.
type Any = any;
const ENCODINGS: Record<string, string> = { "1": "shift_jis", "2": "big5", "3": "euc-kr", "5": "gbk" };
const decoders = new Map<string, TextDecoder | null>();
const MIF = /(\\\\)|\\M\+([1-5])([0-9A-Fa-f]{4})/g;

function decoder(n: string): TextDecoder | null {
  if (!decoders.has(n)) {
    let d: TextDecoder | null = null;
    try { d = ENCODINGS[n] ? new TextDecoder(ENCODINGS[n], { fatal: true }) : null; } catch { d = null; }
    decoders.set(n, d);
  }
  return decoders.get(n)!;
}

/** Decode \M+ codes; an escaped "\\" is left alone and undecodable codes stay as written. */
export function decodeMifText(text: string): string {
  if (!text.includes("\\M+")) return text;
  return text.replace(MIF, (match, escaped: string | undefined, n: string, hex: string) => {
    if (escaped) return escaped;
    const d = decoder(n);
    if (!d) return match;
    try { return d.decode(new Uint8Array([parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2), 16)])); } catch { return match; }
  });
}

/** Apply to every text-bearing entity in the drawing and its blocks; returns how many changed. */
export function decodeMifEntities(doc: Any): number {
  let changed = 0;
  const all = [...(doc.entities ?? []), ...Object.values(doc.blocks ?? {}).flatMap((b: Any) => b.entities ?? [])];
  for (const e of all) {
    for (const key of ["text", "value"]) {
      if (typeof e[key] === "string" && e[key].includes("\\M+")) {
        const next = decodeMifText(e[key]);
        if (next !== e[key]) { e[key] = next; changed++; }
      }
    }
  }
  return changed;
}
