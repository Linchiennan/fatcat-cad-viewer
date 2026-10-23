// Data and small text helpers for the in-app privacy / license pages (P6). Owner: P4 group D.
import type { TranslationKey } from "../i18n/translations";

/** One third-party component (THIRD_PARTY_LICENSES.md); `texts` are files under licenses/. */
export type ThirdParty = { name: string; version: string; use: TranslationKey; license: string; texts: string[] };

export const THIRD_PARTY: ThirdParty[] = [
  ...(import.meta.env.VITE_FATCAT_WEB === '1' ? [{ name: 'Firebase JavaScript SDK', version: '13.1.0', use: 'legal.use.ui' as TranslationKey, license: 'Apache-2.0', texts: ['firebase-Apache-2.0.txt'] }] : []),
  { name: "@mlightcad/libredwg-web (LibreDWG)", version: "0.7.9", use: "legal.use.dwg", license: "GPL-3.0", texts: ["libredwg-web-COPYING.txt"] },
  { name: "dxf-viewer", version: "1.0.48", use: "legal.use.dxfView", license: "MPL-2.0", texts: ["dxf-viewer-MPL-2.0.txt"] },
  { name: "dxf-parser", version: "—", use: "legal.use.dxfParse", license: "MIT", texts: ["dxf-parser-MIT.txt"] },
  { name: "three.js", version: "0.161.0", use: "legal.use.three", license: "MIT", texts: ["three-MIT.txt"] },
  { name: "PDF.js (pdfjs-dist)", version: "6.4.299", use: "legal.use.pdf", license: "Apache-2.0", texts: ["pdfjs-Apache-2.0.txt"] },
  { name: "OpenJPEG / JBIG2 / QCMS (PDF.js)", version: "—", use: "legal.use.pdfImages", license: "BSD-2-Clause / Apache-2.0 / MIT",
    texts: ["pdfjs-wasm-LICENSE_OPENJPEG.txt", "pdfjs-wasm-LICENSE_JBIG2.txt", "pdfjs-wasm-LICENSE_QCMS.txt", "pdfjs-wasm-LICENSE_PDFJS_OPENJPEG.txt", "pdfjs-wasm-LICENSE_PDFJS_JBIG2.txt", "pdfjs-wasm-LICENSE_PDFJS_QCMS.txt"] },
  { name: "libarchive-wasm", version: "1.2.0", use: "legal.use.archive", license: "MIT", texts: ["libarchive-wasm-LICENSE.txt"] },
  { name: "libarchive", version: "3.7.7", use: "legal.use.archiveFormats", license: "BSD-2-Clause", texts: ["libarchive-3.7.7-COPYING.txt"] },
  { name: "zlib", version: "1.3.1", use: "legal.use.deflate", license: "Zlib", texts: ["zlib-1.3.1-LICENSE.txt"] },
  { name: "bzip2", version: "1.0.8", use: "legal.use.bzip2", license: "bzip2-1.0.6", texts: ["bzip2-1.0.8-LICENSE.txt"] },
  { name: "xz / liblzma", version: "5.6.4", use: "legal.use.lzma", license: "0BSD", texts: ["xz-5.6.4-COPYING.txt", "xz-5.6.4-COPYING.0BSD.txt"] },
  { name: "OpenSSL", version: "3.4.1", use: "legal.use.crypto", license: "Apache-2.0", texts: ["openssl-3.4.1-LICENSE.txt"] },
  { name: "Emscripten", version: "4.0.5", use: "legal.use.wasmRuntime", license: "MIT / NCSA", texts: ["emscripten-4.0.5-LICENSE.txt"] },
  { name: "musl libc", version: "—", use: "legal.use.libc", license: "MIT", texts: ["musl-COPYRIGHT.txt"] },
  { name: "LLVM libc++", version: "—", use: "legal.use.libcxx", license: "Apache-2.0 WITH LLVM-exception", texts: ["llvm-LICENSE.txt"] },
  { name: "@mlightcad/shx-parser", version: "1.4.5", use: "legal.use.shx", license: "MIT", texts: ["shx-parser-MIT.txt"] },
  { name: "fflate", version: "0.8.3", use: "legal.use.zip", license: "MIT", texts: ["fflate-MIT.txt"] },
  { name: "React / React DOM / scheduler", version: "19.1.1", use: "legal.use.ui", license: "MIT", texts: ["react-MIT.txt", "react-dom-MIT.txt", "scheduler-MIT.txt"] },
  { name: "Capacitor core / android / browser", version: "8.4.3", use: "legal.use.native", license: "MIT", texts: ["capacitor-core-MIT.txt", "capacitor-android-MIT.txt", "capacitor-browser-MIT.txt"] },
  { name: "Noto Sans CJK TC", version: "—", use: "legal.use.font", license: "OFL-1.1", texts: ["noto-cjk-OFL-1.1.txt"] },
  { name: "Liberation Sans", version: "2.1.5", use: "legal.use.font", license: "OFL-1.1", texts: ["liberation-fonts-OFL-1.1.txt"] },
  { name: "AndroidX", version: "—", use: "legal.use.androidx", license: "Apache-2.0", texts: ["apache-2.0.txt"] },
];

/** Lines of one "## heading" section of a Markdown document (up to the next "## "). */
export function markdownSection(markdown: string, heading: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    out.push(line);
  }
  return out;
}

/** A paragraph, or a group of bullet items, from the plain Markdown the policy uses. */
export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

export function markdownBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) {
      const last = blocks.at(-1);
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else blocks.push({ kind: "ul", items: [bullet[1]] });
    } else blocks.push({ kind: "p", text: line });
  }
  return blocks;
}

/** Split **bold** spans: even indexes plain, odd indexes bold. */
export const boldParts = (text: string): string[] => text.split("**");
