# Third-party corresponding source and build provenance

## LibreDWG / libredwg-web 0.7.9 (GPL-3.0)
- Official repository: https://github.com/mlightcad/libredwg-web
- Tag `v0.7.9` resolves to commit `b70b5573a6bf2345e5fb10f2adff7fb74a8123c5` (checked against the official GitHub Git API).
- Full original archive: https://codeload.github.com/mlightcad/libredwg-web/zip/b70b5573a6bf2345e5fb10f2adff7fb74a8123c5
- `libredwg-web-0.7.9-code.zip` preserves the C/C++/JS/TS source, headers, build scripts, documentation and license. Optional upstream binary drawings/images/compiled binaries are omitted under the public-package no-drawings rule. All included paths and SHA-256 plus the omitted list are in SOURCE-PROVENANCE.json. Full unfiltered upstream source remains available at the pinned URL above.
- Required `jsmn` submodule: commit `85695f3d5903b1cd5b4030efe50db3b4f5f3c928`, provided in `jsmn-source.zip`; place its contents at the source root's `jsmn/` directory.
- Build using upstream README and `bindings/javascript/package.json`: activate Emscripten, `./autogen.sh`, then in `bindings/javascript`: `pnpm install`, `pnpm build:prepare`, `pnpm build:obj`, `pnpm build:wasm`, `pnpm copy`, `pnpm build`. Source archive includes the exact command definitions.
- The delivered runtime is the unchanged npm-locked WASM; its SHA equals the same tag's archived WASM. This preparation did **not** compile C or prove a reproducible binary/toolchain. Do not claim otherwise.

## dxf-viewer 1.0.48 (MPL-2.0)
- Exact npm tarball/integrity is fixed by package-lock.json, also in SOURCE-PROVENANCE.json.
- All modified and supporting source files are provided in `dxf-viewer-1.0.48-patched/`, under MPL-2.0 with upstream copyright retained.
- Reproduce the modifications using `scripts/patch-cjk-fonts.mjs`, `scripts/patch-engineering.mjs`, `scripts/patch-mtext-height.mjs` against the exact package. No global/shared node_modules was patched.

## Other runtime sources
NPM-SOURCES.json inventories installed production dependencies, their exact version, upstream repository, source tarball integrity and license text copies. It may include Firebase subpackages not reachable in this web bundle, and does not claim every installed package is shipped. UPSTREAM-REVISIONS.json records registry gitHead when available.
- Firebase JS SDK 13.1.0 (Apache-2.0): https://github.com/firebase/firebase-js-sdk/tree/cc7ead49187d024958a4a3bcee87436dc03be12c
- libarchive-wasm 1.2.0 (MIT): https://github.com/ofk/libarchive-wasm/tree/2e72c66d92fb8aa5914d0ff2f9e29608e38f2294 ; its build scripts identify its C dependencies. libarchive 3.7.7: https://github.com/libarchive/libarchive/tree/v3.7.7 ; zlib 1.3.1: https://github.com/madler/zlib/tree/v1.3.1 ; xz 5.6.4: https://github.com/tukaani-project/xz/tree/v5.6.4 ; OpenSSL 3.4.1: https://github.com/openssl/openssl/tree/openssl-3.4.1 ; bzip2 1.0.8: https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz . Applicable license texts are retained in licenses/.
- PDF.js / pdfjs-dist 6.4.299 (Apache-2.0): https://github.com/mozilla/pdf.js/tree/d0991a0d53f3bb3a7307e3b83f279c1d117aafb3 ; include its upstream OpenJPEG/JBIG2/QCMS license notices, copied alongside runtime files.
- SHX parser 1.4.5 (MIT): https://github.com/mlightcad/shx-parser ; exact published source tarball + npm integrity in package-lock.json.
- Fonts: Noto CJK TC and Liberation Sans are unchanged; OFL texts ship next to fonts and in licenses/.

## Local changes for the web candidate
Added Web-only Firebase gate, server-only whitelist decision controller, analytics-only document, Web privacy notice, subpath/SW policy and tests. Existing CAD engine, export, annotation and library implementation are preserved. Security patch updates in isolated dependency lock: Vite 7.3.7, Vitest 4.1.12, Node-only @grpc/grpc-js override 1.14.6. No author license was replaced. No private CAD, account token, signing key or diagnostic is part of this source package.
