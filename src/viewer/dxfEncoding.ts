// Which text encoding a DXF uses (T13 3.5). Owner: P4 group B. Also used by our utf8Chunks / missingBlocks callers.

const HEAD_BYTES = 65536;

/** East Asian ANSI pages use their own decoder names; other ANSI pages are Windows pages (T13 3.5-4). */
const EAST_ASIAN = new Map([[932, "shift_jis"], [936, "gbk"], [949, "euc-kr"], [950, "big5"]]);
/** OEM (DOS) pages CAD may write. */
const OEM_PAGES = new Set([437, 850, 852, 855, 857, 860, 861, 863, 864, 865, 866]);

/** Decoder label for a $DWGCODEPAGE value, or null. */
function codepageLabel(value: string): string | null {
  const m = /^(?:ANSI_(\d+)|DOS(\d+))$/.exec(value.trim().toUpperCase());
  if (!m) return null;
  if (m[2] !== undefined) return OEM_PAGES.has(Number(m[2])) ? "ibm" + m[2] : null;
  const page = Number(m[1]);
  if (EAST_ASIAN.has(page)) return EAST_ASIAN.get(page)!;
  return page === 874 || (page >= 1250 && page <= 1258) ? "windows-" + page : null;
}

/** The decoder's own name for a label, or null when this device cannot decode it. */
function decoderName(label: string): string | null {
  try { return new TextDecoder(label).encoding; } catch { return null; }
}

/** Decoder name for the first 64 KB of a DXF (BOM, then $ACADVER >= AC1021 → utf-8, then $DWGCODEPAGE); falls back to utf-8. */
export function detectDxfEncoding(head: Uint8Array): string {
  const bytes = head.subarray(0, HEAD_BYTES);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decoderName("utf-16le") ?? "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decoderName("utf-16be") ?? "utf-16be";
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const lines = text.split(/\r\n|\n|\r/);
  let version: string | null = null, codepage: string | null = null;
  for (let i = 0; i + 3 < lines.length; i++) {
    if (lines[i].trim() !== "9") continue;
    const name = lines[i + 1].trim(), value = lines[i + 3].trim();
    if (name === "$ACADVER" && version === null) version = value;
    else if (name === "$DWGCODEPAGE" && codepage === null) codepage = value;
    if (version !== null && codepage !== null) break;
  }
  const release = version ? /^AC(\d{4})$/i.exec(version) : null;
  if (release && Number(release[1]) >= 1021) return "utf-8";
  const label = codepage ? codepageLabel(codepage) : null;
  return (label && decoderName(label)) || "utf-8";
}
