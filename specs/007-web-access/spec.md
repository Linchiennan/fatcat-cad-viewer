# 007 網頁朋友測試版（定案，不重選底版）

> 歷史紀錄：本文件 server-only／斷網鎖定／重開需在線的舊契約與驗收，已由 `../008-offline-access/spec.md` 的 14 天本機離線授權取代；其餘登入、隱私、公開來源與功能保留要求仍有效。新版結果見 008 acceptance，不把舊測試數當本次結果。

基準：現役 fatcat-cad，非 fatcat-izcad。僅隔離候選可寫，禁止 push/deploy。

## 必須驗收
- A1 Web build 才載入 Google AuthGate，登入前不 mount CAD；native/一般 localhost 不加 gate。
- A2 token email_verified=true、sign_in_provider=google.com、原樣 email 文件 ID；getDocFromServer 且 enabled === true 才放行。missing/false/wrong type/permission/network/cache 都拒絕。
- A3 帳戶切換／舊請求取消，移除名單／disabled 即鎖定並登出；回到前景、恢復網路與週期重新查 server。斷網時保留已 mount 圖面記憶體但遮蔽操作，不能離線重開登入；不清 IndexedDB 圖庫。
- A4 Google 登入／登出，繁中與英語錯誤、360/390/桌面無重疊。
- A5 只有授權成功才初始化 Analytics；隔離無圖面 DOM 的 frame，只允許固定事件/頁面資訊，無 email/uid/userId/私人檔名/圖面/標註/地址/座標/診斷。更新 Web 隱私文字。
- A6 母檔 rules 不變；真官方 emulator 驗匿名、不符 provider/verified、別人文件、list、write 全拒，自己文件讀取可以（enabled 仍是 App 判斷）。
- A7 scripts/web-build.py 真建置，/fatcat-cad-viewer/ 下 worker/WASM/fonts/manifest/icons/SW 正確，舊 SW 明確更新且絕不快取權限。
- A8 原 PNG/PDF 輸出、標註、清單、圖庫保留；合成 DXF 真 headless 開圖與 PNG/PDF 匯出。
- A9 原始碼 SHA 前後核對，公開白名單逐檔 hash；無私圖/DWG/private-host DXF/金鑰/診斷/工具快取。GPL-3.0-only 不改，對應第三方來源與 patch 可追溯。
- A10 真 Google OAuth、Firebase production rules/名單、手機與公開網站仍需用戶驗證，不把 mocks/emulator 當 live。

## 已決策差異與界線
本次白名單網站必須在線啟動，取代舊 PWA 的離線重開承諾。公開 JS/WASM 與 repository 不能當 DRM；登入限制只保護此站入口，源碼可另行運行。全功能（含 PDF）免費，沒有 APK/Play/Billing。Analytics 啟用但不加自用診斷。
