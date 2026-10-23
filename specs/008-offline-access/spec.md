# 008 — 14 天本機離線授權

本次使用者定案取代 007 的 server-only 啟動／回前景／斷網鎖定規則。

## 契約與驗收
- 首次必須已驗證 Google 身分 + server `enabled === true`。精確 uid/email 綁定，只在完整 verify 成功後簽發 14 天本機期限。
- 到期比較 `now >= expiresAt`；離線、watch cached snapshot、頁面更新不得延長期限。成功重新連線完整 verify 可重新簽發。
- 期限內離線冷啟動／關閉重開可用，但需保有 Firebase 登入狀態、本機授權與完整網站公開資源 cache。
- 期限內背景網路失敗／timeout 不鎖畫布、不重掛；明確 server 撤權、無效身分、登出、切帳戶清除授權但不刪圖庫；舊 request/watch 不可覆蓋新帳戶。
- 到期及重新前景檢查，精確 timer、取消／stop 清理、一般時鐘回撥與資料損壞防護；不是防篡改 DRM，無法即時離線撤權。
- 中文有效期限、過期提示、資源準備狀態；新版提示不強制鎖 CAD。Analytics 不阻塞。
- 全套 Vitest、tsc、web-build；headless 合成 DXF pan/zoom/量測、畫布保留、SW 完整資源與離線 reload／重開、過期／撤權。mock 非真 Google/Firebase，禁止發布 mock。

## 範圍
只修改 candidate；備份在工作根 _backup/offline-14days。禁止發布、回寫其他副本、改圖示／輸出位置／重啟既有服務。
