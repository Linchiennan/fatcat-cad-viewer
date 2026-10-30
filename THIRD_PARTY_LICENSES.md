# 第三方元件授權清單（Third-party licenses）

大肥貓CAD看圖 3.0（Copyright (C) 2026 大肥貓，GPL-3.0-only）使用下列元件。授權原文都在 `licenses/` 資料夾。
版本以 package.json／build.gradle 固定的版本為準；2026-10-23 依實際依賴整理。

## 網頁層（打包進 App）

| 元件 | 版本 | 用途 | 授權 | 授權原文 |
|---|---|---|---|---|
| Firebase JavaScript SDK | 13.1.0 | 網頁 Google 登入、Firestore 白名單、授權後 Analytics | Apache-2.0 | licenses/firebase-Apache-2.0.txt |
| @mlightcad/libredwg-web（LibreDWG） | 0.7.9 | DWG 轉 DXF（WebAssembly） | GPL-3.0 | licenses/libredwg-web-COPYING.txt |
| dxf-viewer | 1.0.48 | DXF 顯示（建置時以本專案腳本修補） | MPL-2.0 | licenses/dxf-viewer-MPL-2.0.txt |
| dxf-parser（dxf-viewer 內含） | — | DXF 解析 | MIT | licenses/dxf-parser-MIT.txt |
| three.js | 0.161.0 | 3D 繪圖 | MIT | licenses/three-MIT.txt |
| PDF.js（pdfjs-dist） | 6.4.299 | PDF 顯示 | Apache-2.0 | licenses/pdfjs-Apache-2.0.txt |
| QuickJS（PDF.js 內含） | 2026-06-04 / 3d5e064e9dd6 | PDF JavaScript 沙箱 | MIT | licenses/quickjs-MIT.txt |
| PDF.js QuickJS 整合來源 | 1b37671f1b52（匹配上游建置設定） | 沙箱介接 | MIT | licenses/pdfjs-quickjs-MIT.txt |
| PDF.js 內含 OpenJPEG、JBIG2、QCMS 等 | — | PDF 影像解碼 | 各自授權 | licenses/pdfjs-wasm-*.txt |
| libarchive-wasm | 1.2.0 | ZIP／RAR 讀取（WebAssembly） | MIT | licenses/libarchive-wasm-LICENSE.txt |
| libarchive（libarchive-wasm 內含） | 3.7.7 | 壓縮檔格式 | BSD-2-Clause 等 | licenses/libarchive-3.7.7-COPYING.txt |
| zlib（同上內含） | 1.3.1 | Deflate | zlib | licenses/zlib-1.3.1-LICENSE.txt |
| bzip2（同上內含） | 1.0.8 | BZip2 | bzip2 授權（BSD 類） | licenses/bzip2-1.0.8-LICENSE.txt |
| xz／liblzma（同上內含） | 5.6.4 | LZMA | 0BSD | licenses/xz-5.6.4-COPYING.txt、xz-5.6.4-COPYING.0BSD.txt |
| OpenSSL（同上內含） | 3.4.1 | 加密壓縮檔所需雜湊／加解密 | Apache-2.0 | licenses/openssl-3.4.1-LICENSE.txt |
| Emscripten 執行環境（以上 WebAssembly 內含） | 4.0.5 | WebAssembly 執行支援 | MIT／NCSA | licenses/emscripten-4.0.5-LICENSE.txt |
| musl libc（同上內含） | — | C 標準函式庫 | MIT | licenses/musl-COPYRIGHT.txt |
| LLVM libc++／runtime（同上內含） | — | C++ 執行支援 | Apache-2.0 WITH LLVM-exception | licenses/llvm-LICENSE.txt |
| @mlightcad/shx-parser | 1.4.5 | SHX 字型解析 | MIT | licenses/shx-parser-MIT.txt |
| fflate | 0.8.3 | ZIP 解壓 | MIT | licenses/fflate-MIT.txt |
| fake-indexeddb | 6.2.4 | 網頁版訪客試用的記憶體圖庫（關分頁即清空） | Apache-2.0 | licenses/npm-fake-indexeddb-LICENSE.txt |
| pdf-lib | 1.17.1 | 輸出 PDF | MIT | licenses/pdf-lib-LICENSE.txt |
| pdf-lib 相依：pako、@pdf-lib/standard-fonts、@pdf-lib/upng、tslib | 1.0.11／1.0.0／1.0.1／2.8.1 | 壓縮、內建字型、PNG 解碼 | MIT AND Zlib／MIT／MIT／0BSD | licenses/pako-LICENSE.txt、pdf-lib-standard-fonts-LICENSE.txt、pdf-lib-upng-LICENSE.txt、tslib-LICENSE.txt |
| React／React DOM／scheduler | 19.1.1／0.26.0 | 介面 | MIT | licenses/react-MIT.txt、react-dom-MIT.txt、scheduler-MIT.txt |
| Capacitor core／android／browser | 8.4.3／8.0.4 | 原生殼與外部連結 | MIT | licenses/capacitor-*-MIT.txt |

## 字型

| 字型 | 授權 | 授權原文 |
|---|---|---|
| Noto Sans CJK TC Regular（notofonts/noto-cjk，未修改） | SIL OFL 1.1 | licenses/noto-cjk-OFL-1.1.txt |
| Noto Sans CJK TC Light 2.004（notofonts/noto-cjk，未修改；SHX 文字替代用） | SIL OFL 1.1 | licenses/noto-cjk-OFL-1.1.txt |
| Liberation Sans Regular 2.1.5（未修改） | SIL OFL 1.1 | licenses/liberation-fonts-OFL-1.1.txt |

## Android 原生層

| 元件 | 版本 | 授權 | 授權原文 |
|---|---|---|---|
| AndroidX（appcompat、core、activity、coordinatorlayout、core-splashscreen） | 依 variables.gradle | Apache-2.0 | licenses/apache-2.0.txt |

## 本專案自己的程式

除上述元件外，`src/`、`scripts/`、`android/app/src/main/java/tw/dafeimao/cadviewer/`、`fixtures/` 皆為大肥貓著作，以 GPL-3.0-only 授權（`fixtures/` 的測試字型另見 fixtures/FATCAT-FIXTURE-LICENSE.md）。
