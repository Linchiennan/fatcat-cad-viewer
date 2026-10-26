// Legacy AutoCAD multibyte codes "\M+nXXXX" (MIF): n selects the code page, XXXX is the 2-byte
// character. Older DWGs (e.g. Japanese TOTO sheets) keep CJK text this way; CAD shows the decoded text.
type Any = any;
const ENCODINGS: Record<string, string> = { "1": "shift_jis", "2": "big5", "3": "euc-kr", "5": "gbk" };
// LibreDWG writes the drawing's own characters with its own n (上晴, a Big5 drawing, came out as \M+5, which is GB), so
// a drawing whose code page is Chinese, Japanese or Korean decodes with that code page first. Codes the DWG itself
// held are true to n (上晴 also has GB names, "外部參考" with 參 at 85A2, not a Big5 character): a string that does not
// decode whole with the code page decodes with n.
const CODEPAGES: Record<string, string> = { ANSI_932: "shift_jis", ANSI_936: "gbk", ANSI_949: "euc-kr", ANSI_950: "big5" };
const decoders = new Map<string, TextDecoder | null>();
const MIF = /(\\\\)|\\M\+([1-5])([0-9A-Fa-f]{4})/g;

function decoder(encoding: string | undefined): TextDecoder | null {
  if (!encoding) return null;
  if (!decoders.has(encoding)) {
    let d: TextDecoder | null = null;
    try { d = new TextDecoder(encoding, { fatal: true }); } catch { d = null; }
    decoders.set(encoding, d);
  }
  return decoders.get(encoding)!;
}

/** The encoding the drawing's own code page ($DWGCODEPAGE) gives every code, when it is a CJK one. */
export function mifEncodingOf(doc: Any): string | undefined {
  return CODEPAGES[String(doc?.header?.$DWGCODEPAGE ?? "").toUpperCase()];
}

/** One character from a code, or null when the encoding has none there. */
function decodeCode(d: TextDecoder | null, hex: string): string | null {
  if (!d) return null;
  try {
    const c = d.decode(new Uint8Array([parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2), 16)]));
    // a private-use character (85A2 as Big5 in some engines) is no character either
    return [...c].length === 1 && !/[-]/.test(c) ? c : null;
  } catch { return null; }
}

/** Decode \M+ codes (with the drawing's `encoding` first, see above); an escaped "\\" is left alone and undecodable codes stay as written. */
export function decodeMifText(text: string, encoding?: string): string {
  if (!text.includes("\\M+")) return text;
  if (encoding) {
    let whole = true;
    const out = text.replace(MIF, (match, escaped: string | undefined, _n: string, hex: string) => {
      if (escaped) return escaped;
      const c = decodeCode(decoder(encoding), hex);
      if (c === null) whole = false;
      return c ?? match;
    });
    if (whole) return out;
  }
  return text.replace(MIF, (match, escaped: string | undefined, n: string, hex: string) => escaped ?? decodeCode(decoder(ENCODINGS[n]), hex) ?? match);
}

/**
 * Cut bytes the DXF writer read past the end of a coded string: what follows the last code up to its last control
 * character (上晴 大廳: the leader arrow block "材料引線" came out as "\M+5A7F7…\M+5BD75<" plus 0x01). Text after that
 * stays, for a message that quotes the name.
 */
export function dropReadPastTail(text: string): string {
  let end = -1;
  for (const m of text.matchAll(MIF)) if (!m[1]) end = m.index! + m[0].length;
  if (end < 0) return text;
  let last = -1;
  for (let i = end; i < text.length; i++) if (text.charCodeAt(i) < 0x20) last = i;
  return last < 0 ? text : text.slice(0, end) + text.slice(last + 1);
}

/**
 * Decode the codes in names too: layer, block, text style, line type and dimension style names, as table keys and
 * wherever an entity or a report names them (上晴: "09-\M+5ACA1\M+5B0CA…" for every layer of the 圖層 panel).
 * Every string and key in the drawing is decoded the same way, so references keep matching. Returns how many changed.
 */
export function decodeMifNames(doc: Any): number {
  let changed = 0;
  const encoding = mifEncodingOf(doc);
  const seen = new Set<object>();
  const walk = (node: Any): Any => {
    if (typeof node === "string") {
      if (!node.includes("\\M+")) return node;
      const next = decodeMifText(dropReadPastTail(node), encoding);
      if (next !== node) changed++;
      return next;
    }
    if (!node || typeof node !== "object" || seen.has(node) || ArrayBuffer.isView(node)) return node;
    seen.add(node);
    if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) node[i] = walk(node[i]); return node; }
    let rekey = false;
    for (const k of Object.keys(node)) {
      node[k] = walk(node[k]);
      if (k.includes("\\M+")) rekey = true;
    }
    if (rekey) {
      const entries = Object.entries(node);
      for (const [k] of entries) delete node[k];
      for (const [k, v] of entries) { const nk = decodeMifText(k, encoding); if (nk !== k) changed++; node[nk] = v; }
    }
    return node;
  };
  walk(doc);
  return changed;
}

/** Apply to every text-bearing entity in the drawing and its blocks; returns how many changed. */
export function decodeMifEntities(doc: Any): number {
  let changed = 0;
  const encoding = mifEncodingOf(doc);
  const all = [...(doc.entities ?? []), ...Object.values(doc.blocks ?? {}).flatMap((b: Any) => b.entities ?? [])];
  for (const e of all) {
    for (const key of ["text", "value"]) {
      if (typeof e[key] === "string" && e[key].includes("\\M+")) {
        const next = decodeMifText(e[key], encoding);
        if (next !== e[key]) { e[key] = next; changed++; }
      }
    }
  }
  return changed;
}
