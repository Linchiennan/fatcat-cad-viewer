# 大肥貓CAD看圖（Fat Cat CAD Viewer）— 版權與授權聲明

Copyright (C) 2026 大肥貓

大肥貓CAD看圖在裝置上處理 DWG、DXF 與 PDF。原生/一般本機版保留離線能力；本白名單網頁版啟動與返回前景需連線驗證授權。
圖檔只在使用者自己的裝置上處理，不會上傳。

## 授權

本程式是自由軟體：您可以依照自由軟體基金會發布的 GNU 通用公共授權條款第 3 版（僅限第 3 版，GPL-3.0-only）
再散布及修改本程式。

散布本程式是希望它有用，但**不提供任何擔保**，也不擔保適售性或特定用途的適用性。詳細內容請見 GNU 通用公共授權條款。
授權全文在本專案根目錄的 `LICENSE`。

原始碼公開位置（發布確認後）：https://github.com/Linchiennan/fatcat-cad-viewer 。對應來源、固定版本及修補位於 third-party-source/ 與 scripts/。本機候選不代表已上傳。

## 第三方元件

本 App 使用下列第三方元件，各依其授權條款使用；完整清單與授權對照在 `THIRD_PARTY_LICENSES.md`，授權原文在 `licenses/`。

- DWG 轉檔：LibreDWG（@mlightcad/libredwg-web，GPL-3.0）
- 圖面顯示：dxf-viewer（MPL-2.0，內含 dxf-parser，MIT）、three.js（MIT）
- PDF：PDF.js（Apache-2.0）
- 壓縮檔：libarchive-wasm（MIT），內含 libarchive（BSD）、zlib、bzip2、xz、OpenSSL（Apache-2.0）
- SHX 字型：@mlightcad/shx-parser（MIT）；壓縮：fflate（MIT）
- 介面與平台：React（MIT）、Capacitor（MIT）、AndroidX（Apache-2.0）
- 字型：Noto Sans CJK TC、Liberation Sans（SIL Open Font License 1.1）

## 修改過的第三方檔案

建置時以 `scripts/patch-cjk-fonts.mjs`、`scripts/patch-engineering.mjs`、`scripts/patch-mtext-height.mjs`
修補 dxf-viewer 的部分原始檔（中文字型、工程物件、多行文字高度）。依 MPL-2.0，這些修改後的檔案以 MPL-2.0 提供，
修補內容即上述腳本，隨本專案原始碼一併公開。

## 名稱與圖示

「大肥貓」名稱與 App 圖示（兔猻貓圖）為大肥貓所有。GPL 不授予商標權；修改版請使用不同名稱與圖示。
