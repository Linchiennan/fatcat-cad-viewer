# 大肥貓 CAD — 朋友網頁測試版

Copyright (C) 2026 大肥貓。GPL-3.0-only，見 LICENSE、NOTICE.md、THIRD_PARTY_LICENSES.md。

現役 fatcat-cad 網頁版；保留 DWG／DXF／PDF、本機圖庫、量測、標註、搜尋、外參與 PNG／PDF 輸出。所有功能免費，無付款牆。此候選只準備 GitHub Pages，不產生 APK、不上 Google Play。

## 登入與隱私
Google 登入後仍須以伺服器確認 `allowedUsers/{原樣email}` 的 `enabled` 嚴格等於 boolean `true`。只接受已驗證 Google 身分。Firestore 規則只允許讀自己文件，不允許列名單或寫入。
完整 Google＋server 白名單驗證成功後，本機保存綁定原樣 uid/email 的 **14 天離線授權**；期限內可離線看圖、縮放與量測，關閉重開也可（須保有登入狀態、授權及完整網站資源）。離線使用、cached snapshot、頁面更新不延長期限；正好第 14 天即到期，須連網重新驗證。連網時在前景／恢復網路／每分鐘背景查核及監聽撤權，不重掛或閃爍已開畫布；網路失敗與逾時不撤銷未到期授權。登出、切換帳號或伺服器明確撤權會清除授權／關圖，不刪圖庫。
授權成功後才啟用基本 Analytics，無圖面/標註/私人檔名/帳號識別傳給 Analytics；詳見 WEB_PRIVACY.md。Firebase public config 是公開專案設定，不是登入密碼或管理私鑰。

## 本機建置與驗證
需要 Node.js >=22、Python 3（命令 `python`），使用獨立 node_modules。

```sh
npm ci
npm test
npm run typecheck
python scripts/web-build.py
```

網頁產物為 `dist-web/`，固定 Vite base `/fatcat-cad-viewer/`。**不得只跑 vite build 替代 web-build.py**，後者產生 manifest、icons、SW、隱私文件及打包檢查。普通 `npm run build` 仍為不含登入門禁的原生/本機開發模式；禁止拿它上傳為白名單網站。
`npm run patch` 可重現原有 dxf-viewer 修補；完整修改後 MPL 原碼在 third-party-source/。

公開候選刻意不帶 DWG fixture；DWG 原生引擎檔案測試在未提供測試檔時明確 skip，不是假通過。其他合成 DXF、介面、輸出與權限測試照常執行。

### Firebase 安全規則（本機測試）
`firebase.json` 只配置 emulator。啟動本機官方 Firestore emulator（需相容 Java）後：

```sh
node tests/firestore-rules.mjs
```

測試硬編 demo project / loopback，絕不使用 production 管理權限。`tests/vite.mock.config.ts` 是另建 `dist-mock/` 的 headless 測試專用設定；它不會進入 production build，禁止發布 dist-mock。
`tests/headless.mjs` 使用隔離 headless Chromium（本機 Brave）、攔截所有外部網路；保留 360/390/1280 排版與 PNG/PDF 輸出回歸。`python tests/build-offline-mock.py` 沿既有 mock alias 及正式 SW template 建立測試產物；`node tests/offline-headless.mjs` 驗實際 SW 升版、完整資源準備、離線 reload、整個瀏覽器關閉重啟、100 mm 合成線量測及過期／撤權。證據在 `evidence/offline-14days/`。這些不是 Google OAuth live 或真 Android 裝置成功證據。

## 發布（尚待確認，不能自動推送）
預定公有 repository： https://github.com/Linchiennan/fatcat-cad-viewer
預定 Pages： https://linchiennan.github.io/fatcat-cad-viewer/

公開前先審核 PUBLIC_FILES 清單及逐檔 SHA，使用者確認後才可推送。`.github/workflows/pages.yml` 僅供確認後人工觸發，無 push trigger；託管只上傳 `dist-web/`。Firebase 登入網域/rules/白名單必須另外真實驗證，程式測試不能取代它。

PWA Cache Storage 只快取公開程式、字型與引擎；本機授權另存在 localStorage，不等同網站資源快取。介面分別顯示有效期限與資源是否備妥；資源未備妥不得視為可離線重開。升版只提示，不強制鎖定已開圖；重新載入保留有效授權與圖庫，但未保存操作將關閉。為已開舊版保留先前公開資源 cache，不清 IndexedDB。已開啟的歷史版本不能靠新 SW 追溯保證安全；正式第一次公開前不可先發布無門禁版。
公開原碼與靜態資產無法保密，白名單只限制本站 App 入口，不是 DRM；他人可依 GPL 自行另跑。本機期限沒有密碼學簽章，只防一般時間回撥／損壞，無法抵禦刻意修改或完整備份回放；離線撤權不會即時生效。瀏覽器清除／淘汰資料、無痕與禁用儲存會影響離線重開。

## 對應來源
`third-party-source/SOURCE-PROVENANCE.json` 固定 LibreDWG 0.7.9 的 commit、完整官方下載連結、SHA、jsmn submodule 和現行 WASM SHA。附完整 C/JS/build 程式碼 ZIP（省略官方測試圖/二進位，完整原件可由記錄連結取得）。現行 WASM 與官方 source archive 內同版 WASM 位元相符；本次**未從 C 重編**，不宣稱二進位可重現。更多元件見 third-party-source/README.md 及 NPM-SOURCES.json。
