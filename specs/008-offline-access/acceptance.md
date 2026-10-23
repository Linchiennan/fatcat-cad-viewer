# 008 驗收結果 — 僅本機 candidate

## 結論
14 天本機離線授權已實作並通過本機控制器、React、SW 與 headless 驗收。未發布、未推 GitHub、未改 Firebase production、未回寫 public-repo／verify-clean／現役副本或雲端；未重啟既有服務。

## 原需求與證據
| 要求 | 本機結果 | 證據 |
|---|---|---|
| 必須完整 Google＋server 驗證後才發本機期限 | production adapter 保留原 `getIdTokenResult(true)`、verified Google／原樣 email、`getDocFromServer`；控制器只接受 server enabled boolean true | `src/auth/accessController.test.ts`、`offlineAccess.test.ts`；正式 bundle 未登入 headless 不 mount CAD |
| 14 天離線、關閉重開、離線不續期 | 成功；精確 uid/email、固定期限；watch/cached doc 不發證、不延長 | `evidence/offline-14days/headless-results.json` 的 offlineReload、browserClosedAndReopenedOffline；真關閉整個隔離 Brave 程序並重開同磁碟 profile，非 storageState 假重開 |
| 正好 14 天、回前景、逾時 | 完成；`>= expiresAt` 鎖定；timer 與 foreground 檢查；逾時不撤銷有效期限 | `offlineAccess.test.ts`，headless exactExpiry（以測試時鐘前移，沒有真等 14 天） |
| 登出、切帳號、server 撤權、舊 request/watch | 清授權、不刪圖庫；generation 丟棄舊工作；取消會結束掛起 Promise；重登入等待登出完成 | 控制器測試、headless serverRevoked 與 libraryRetained |
| 背景驗證不閃爍／重掛 CAD | 完成；有效期限內保留 allowed；斷網不改 canvas 節點、尺寸、camera | 控制器狀態訂閱測試；headless before/offline.sameCanvas=true、canvas/camera 完全相同 |
| 真離線縮放／平移／量測 | 完成；合成 DXF 9 實體、6 meshes；實際 mouse pan/zoom 改變 camera；已知 100 mm 線量測為 10.0 cm | headless JSON 數值、`offline-measurement.png`；非僅測 entity count |
| SW 公開資源先備妥再宣告 | 完成；core/runtime 每一 URL 查核；移除實際 WASM cache entry 顯示未備妥，還原原 bytes 後恢復 | `offlineWorker.test.ts`、headless missingRuntimeReportedNotReady；正式建置 core 139、runtime 209 entries |
| 網頁更新不能套用舊鎖法 | 完成；真 SW install/activate 新 revision，保留舊 CAD 與未到期授權；舊公開 cache 不急刪 | headless realServiceWorkerUpgrade；React update 測試 |
| 壞資料、回撥、跨 uid/email、儲存失敗 | 完成有界防護；校驗期限形狀、雙記錄檢查點；執行中 monotonic floor；儲存失敗不假稱可持久離線 | `offlineAccess.test.ts` |
| Analytics 離線不阻塞 | 完成；離線移除 usage iframe；所有外部請求攔截仍可 CAD | 兩套 headless errors=[]；既有 Analytics queue 隱私回歸 |
| 舊功能與圖示／輸出位置 | 保留；360/390/1280 排版、實際 PNG/PDF 匯出保存；來源 icons／ViewerChrome 雜湊守恆 | `regression-headless/headless-results.json`、`integrity.json` |

## 最終執行
- `python tests/verify-offline.py`：六個真實程序 exitCode 全 0，收據 `evidence/offline-14days/final-gate.json`。
- 全套 Vitest：89 files、567 passed、5 skipped（原有 skip／公開包省略 DWG fixture），無失敗。Node 26 仍有原有 experimental localStorage 警告；未將 skip 算通過。
- `tsc -b --pretty false` 通過。
- 子代理正式產物 build `629a55ac0645`，455 files。父代理另覆核53項離線／控制器／React／SW定向測試全通過，並補正NOTICE的舊版在線說明；只改文件後重新建置通過，最終候選為 `dist-web/` build `3cc8fe50f9f3`，455 files。文件改動不改功能原碼，下列headless證據對應相同功能原碼。
- 離線 headless 最終 pass=true、errors=[]，並有 `repeats-verified/run-01` 至 `run-06` 六次獨立程序重跑全部通過。
- 既有 headless 回歸 pass=true、errors=[]：360／390／1280、PNG 46706 bytes、PDF 19809 bytes、Analytics queue 與撤權後圖庫保存。

## 測試問題與可重用經驗（保留失敗證據）
- 量測初測點被桌面浮動面板遮住。以真 camera/world→screen 轉換將已知線移到可點區後重驗，未更改量測引擎。初敗保留 `headless-attempt-01/02.*`。
- `pageshow` 原本直接當 online，導致離線狀態文字／Analytics 錯誤；紅測 `red-pageshow.log` 後改讀 `navigator.onLine`。
- Persistent browser 會復原先前分頁；只把新分頁的測試時鐘前移 14 天，舊復原分頁仍用真時鐘，觸發跨頁 rollback 保護。`repeats/run-03/headless-results.json` 保存兩分頁／兩時鐘證據。修正測試在新頁建立後關閉自動復原頁，不改 production 時鐘防護。
- Cache Response 可能延遲讀取 disk-backed body；測試移除 entry 前先讀原 arrayBuffer，再以相同 bytes 還原，不能先 delete 後重用未讀完 Response。原失敗保留 `repeats-fixed/`，修正後六輪全通過。
- 基準備份與 SHA 必須在改前完成。mock 只沿既有 tests/vite.mock.config.ts alias，不得加入 production auth bypass。

## 限制／未驗
- 真 Google OAuth、已登入的 production Firebase Auth 離線持久化、production 白名單撤權往返、Android 真機／PWA 安裝與系統強停仍需使用者在正式環境驗證。本次使用可控 mock 身分／後端，但控制器、CAD、SW 為真實來源；`dist-mock/` 禁止發布。
- 本機記錄不是伺服器密碼學簽章，不是防篡改 DRM。只對已觀察時間檢查點／執行中的 monotonic 時間作防回撥；完全關閉期間若回撥後仍晚於最後檢查點，或刻意完整回放所有本機資料，沒有可信時間服務便無法全面察覺。完全離線無法即時得知撤權。
- 離線重開需登入狀態、授權與完整網站資源仍在。瀏覽器資料清理／自動淘汰、無痕、禁止儲存會使離線能力失效；不把 localStorage 當強安全。
- 保留舊版公開 cache 可避免已開 CAD 的舊 lazy module 斷裂，但會增加網站儲存量；不自動刪圖庫。
- 本機圖庫是裝置共用，不是按帳戶隔離；登出／撤權關圖會失去未保存操作。
- 合成 DXF 視覺檢視確認畫布非空、紅綠線條及 10.0 cm 讀數；既有量測浮動面板會遮住部分背景和狀態小字，非本次登入／離線變更，不宣稱全部 CAD 變體或 Android GPU 保真。

## 精確交付清單
`evidence/offline-14days/changes.json` 與 `changes.md` 列來源與生成產物的新增／修改／刪除、改前／改後 SHA256。`baseline.json` 為改前 candidate 全檔基準；備份在工作根 `_backup/offline-14days/`。父代理應以來源 manifest 做 CAS，不整包回寫 tests/evidence/dist-mock。
