// Copies the third-party runtime files the app loads at run time (DWG engine, archive reader, PDF worker and
// its data) from node_modules into public/runtime, so the built app works fully offline.
// Every source is the published npm package itself (the DWG engine: our patched build in vendor/); their license files
// are copied alongside.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE, setWasmInitialPages } from "./wasmMemory.mjs";

/** 1024 pages = 64 MB. */
const DWG_INITIAL_PAGES = 1024;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = (...p) => join(root, "node_modules", ...p);
const out = join(root, "public", "runtime");

// [from, to] — a folder is copied whole.
const items = [
  // The DWG engine is our patched build (vendor/libredwg-web/README.md): LibreDWG 0.14.8625 with the 32-bit handle fix.
  [join(root, "vendor", "libredwg-web", "libredwg-web.js"), "libredwg/libredwg-web.js"],
  [join(root, "vendor", "libredwg-web", "libredwg-web.wasm"), "libredwg/libredwg-web.wasm"],
  [mod("@mlightcad/libredwg-web", "LICENSE"), "libredwg/LICENSE"],
  [mod("libarchive-wasm", "dist", "libarchive.wasm"), "libarchive/libarchive.wasm"],
  [mod("libarchive-wasm", "LICENSE"), "libarchive/LICENSE"],
  // The legacy build runs on older Android WebViews (T17).
  [mod("pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"), "pdfjs/pdf.worker.min.mjs"],
  [mod("pdfjs-dist", "cmaps"), "pdfjs/cmaps"],
  [mod("pdfjs-dist", "standard_fonts"), "pdfjs/standard_fonts"],
  [mod("pdfjs-dist", "iccs"), "pdfjs/iccs"],
  [mod("pdfjs-dist", "wasm"), "pdfjs/wasm"],
  [mod("pdfjs-dist", "LICENSE"), "pdfjs/LICENSE"],
];

// File by file: fs.cpSync crashes (segfault) on Windows when the path has Chinese characters.
function copy(from, dest) {
  if (statSync(from).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const name of readdirSync(from)) n += copy(join(from, name), join(dest, name));
    return n;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(from, dest);
  return statSync(from).size;
}

rmSync(out, { recursive: true, force: true });
let bytes = 0;
const missing = [];
for (const [from, to] of items) {
  if (!existsSync(from)) { missing.push(from); continue; }
  bytes += copy(from, join(out, to));
}
// The DWG engine starts with 64 MB instead of 1024 MB and grows as a drawing needs (see wasmMemory.mjs).
const dwgWasm = join(out, "libredwg/libredwg-web.wasm");
if (existsSync(dwgWasm)) {
  const data = readFileSync(dwgWasm);
  const was = setWasmInitialPages(data, DWG_INITIAL_PAGES);
  writeFileSync(dwgWasm, data);
  if (was !== DWG_INITIAL_PAGES) console.log(`libredwg 起始記憶體 ${(was * PAGE) / 1048576} MB → ${(DWG_INITIAL_PAGES * PAGE) / 1048576} MB`);
}
if (missing.length) {
  // A license file some packages do not ship is not fatal; a missing runtime file is.
  const fatal = missing.filter((p) => !/LICENSE$/.test(p));
  for (const p of missing) console.warn((fatal.includes(p) ? "缺少執行檔：" : "套件沒有附授權檔：") + p);
  if (fatal.length) process.exit(1);
}
// License and notice documents ship with every build (web and APK) under licenses/ (P6).
const legalOut = join(root, "public", "licenses");
rmSync(legalOut, { recursive: true, force: true });
let legalFiles = 0;
for (const name of ["LICENSE", "NOTICE.md", "THIRD_PARTY_LICENSES.md", "PRIVACY_POLICY.md"]) {
  const from = join(root, name);
  if (!existsSync(from)) { console.error("缺少授權文件：" + from); process.exit(1); }
  copy(from, join(legalOut, name));
  legalFiles++;
}
for (const name of readdirSync(join(root, "licenses"))) { copy(join(root, "licenses", name), join(legalOut, "licenses", name)); legalFiles++; }
console.log(`授權文件已複製到 public/licenses（${legalFiles} 個檔）`);
console.log(`執行檔已複製到 public/runtime（${items.length - missing.length} 項，共 ${(bytes / 1e6).toFixed(1)} MB）`);
