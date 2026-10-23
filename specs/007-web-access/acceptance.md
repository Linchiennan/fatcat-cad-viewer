# Acceptance matrix — local web candidate

本文件只記錄本機驗證，不代表網站已公開或真 Google 登入成功。

| ID / 原需求 | 狀態 | 對應程式 / 真實證據 |
|---|---|---|
| A1 Web-only Google gate | 本機已驗 | main.tsx compile-time lazy branch；native/普通 build 無 Firebase project/auth/allowlist runtime；未登入不 mount CAD |
| A2 Firestore 白名單 | 本機已驗 | firebaseBackend.ts getIdTokenResult(forceRefresh), exact email, verified Google, getDocFromServer；enabled 必須 boolean true |
| A3 撤權/斷網/競態 | 本機已驗 | controller generation / 即時 snapshot / visibility-online-60s 重驗；unit + headless 斷網鎖定、重連同camera、撤權關圖，圖庫保留 |
| A4 Google登入登出與雙語/手機排版 | 模擬介面已驗；真OAuth待驗 | 30個 auth 單測（含繁中/英文popup錯誤）；headless 360/390/1280 CAD工具和帳號列不重疊 |
| A5 Analytics | SDK queue與隱私邊界已驗；Google收到事件待驗 | usage.html 專用空白文件；授權後才 mount；固定 app_access；檢查SDK queue無帳號email/私人query/檔名；全部Google網路攔截，非live |
| A6 Rules | 真官方本機emulator已驗；production待驗 | 17項：匿名、不符provider、未驗證、別人文件、列名單、所有寫入、其他collection拒絕；自己的disabled/missing可讀但App拒絕 |
| A7 Pages子路徑/PWA | 本機已驗 | web-build.py；/fatcat-cad-viewer/ fonts/WASM/PDF worker/manifest/icons/SW；離線cached shell不mount；獨立npm ci clean rebuild 455檔逐SHA完全一致 |
| A8 既有CAD功能 | 有界回歸通過 | 全套Vitest 533 passed / 5 skipped / 0 failed；安全合成DXF 9實體6meshes；PNG 780×1704非空像素，PDF一頁A4；實際輸出存讀 |
| A9 私密檔/授權/來源 | 本機已驗 | PUBLIC_FILES.json/csv + private-scan.json；原件319檔CAS一致；GPL不改；官方LibreDWG C/JS+jsmn固定來源、WASM同SHA；MPL patched source |
| A10 發布/真使用者測試 | 刻意未執行，待用戶核准 | 尚未push/deploy，未改production Firebase，未操作用戶瀏覽器，未出APK |

## 未測/界線
- 未驗真 Google OAuth（含iPhone Safari/popup限制）、production authorized domains/rules/allowedUsers、Analytics主控台收到事件、GitHub Actions/Pages實際部署及實機觸控。
- 5 skip = 4項公開包刻意省略DWG二進位fixture的測試 + 1項原有skip，不算成功；其餘533測試均實跑。未做測試覆蓋率量測，專案無獨立lint script。
- 此站需要在線啟動；不能宣稱舊PWA離線冷啟動功能仍保留。斷網鎖定保留記憶體，不刪圖庫；撤權/登出會關圖，未存操作可能失去。
- 本機圖庫屬裝置而非隔離帳戶；共用裝置要自行管理本機資料。前端gate不保護公開程式碼，不是DRM。
- LibreDWG附完整程式來源與build scripts/完整上游連結；此輪沒有C重編，不宣稱WASM位元可重現。附來源ZIP省略官方二進位測試圖，省略清單有追溯。
- Firebase public API key允許公開；掃描不將它誤報密碼。pattern/allowlist掃描不是秘密偵測的數學保證。

## 發布前人工步驟（母代理接手）
1. 先讓使用者確認本機 PUBLIC_FILES.md/csv/json；只推 public-repo 白名單，不推 candidate/tools/evidence/_backup。
2. 用戶核准後才可上傳並設定 Pages；本工作沒有執行。預備workflow僅workflow_dispatch。
3. 用戶在正式網址親自Google登入，再驗 enabled true成功、false/刪除拒絕、非名單拒絕、重開需在線、登出圖庫保留；真Firebase規則和名單要讀回驗證。
4. 手機開安全測試圖、PNG/PDF輸出與Safari加入主畫面；確認Analytics只有授權後出現不含私人資料的使用事件。
