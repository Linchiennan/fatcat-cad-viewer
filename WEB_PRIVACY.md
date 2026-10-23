# 網頁版隱私告知 / Web privacy notice

## 繁體中文
這份告知適用於 Google 帳號白名單網頁測試版，不代表原生離線版本的資料行為。
- Google/Firebase Authentication 處理 Google 登入（電子郵件、帳號識別及驗證狀態）；Firestore 以電子郵件查詢自己的 allowedUsers 文件，用於存取控制，不上傳圖檔。
- 本機 DWG/DXF/PDF、字型、圖庫、標註和輸出內容留在裝置。分享或另存由你主動操作；本網頁不啟用自用診斷上傳。
- 完整 Google＋server 白名單驗證成功後，localStorage 保存 uid、原樣 email、驗證時間、固定 14 天到期時間及時鐘檢查點。期限內離線可看圖、縮放、量測；網站資源快取備妥且登入狀態／授權仍在時，也可離線關閉重開。到期須連網重新驗證；離線操作不順延期限。連網時返回前景、恢復網路與每分鐘背景查核並監聽撤權，網路失敗不清除未到期授權、不重掛畫布。登出、切帳戶、確認移除／停用白名單會清除授權並關圖，未保存操作可能失去；裝置圖庫不刪除，共用裝置請自行管理。
- 只有授權成功後才啟用 Google Analytics：收集固定 app_access 使用事件，以及 Google Analytics 的基本裝置、瀏覽器、語言、cookie／Firebase installation 裝置識別和連線資訊（可能由 IP 推估大略地區）。這不是「完全不收集任何資料」。
- Analytics 在不含圖面與帳號資料的獨立空白文件執行。程式不設定 userId，不傳電子郵件、Firebase UID、私人檔名、圖檔內容、標註、地址、CAD 座標或診斷。統計頁面位置固定，不傳主頁查詢字串或來源頁；停用廣告個人化與 Google signals。阻擋 Analytics 不影響權限或 CAD。
- PWA Cache Storage 只保存公開程式、字型和執行資源，與 localStorage 的本機期限分開；已快取不代表獲准使用。介面標示資源準備狀態，未準備好不能保證離線重開。瀏覽器清除／淘汰資料、無痕或禁止持久儲存會影響離線使用；登出不刪圖庫。
- 本機期限不是密碼學簽章或防篡改 DRM。只防一般時間回撥與壞資料；有能力修改瀏覽器資料／完整回放備份者仍可繞過前端門禁。完全離線時無法即時得知撤權，最長到本機期限或下次連網查核。
- GitHub Pages 與公開 repository 可提供公開程式檔案；白名單只限制本站入口，不是原碼保密或 DRM。

## English
This notice applies to the allowlisted Google-account web preview, not the native offline edition.
- Google/Firebase Authentication processes your Google sign-in, email, identifier and verification status. Firestore reads your own allowedUsers document for access control; drawings are not uploaded.
- Drawings, fonts, library, annotations and exports remain on the device. Sharing/saving requires your action. Private diagnostic uploads are disabled in this web edition.
- Successful Google plus server allowlist verification stores an exact uid/email-bound 14-day local grant and clock checkpoint in localStorage. Offline viewing, zoom and measurement, including reopening, work while the grant, persisted sign-in and required website resources remain available. Offline use never renews the deadline. Expiration requires online verification. Foreground/reconnect/minute checks and server watches run in the background without remounting CAD; network failure does not revoke an unexpired grant. Sign-out, account switching or confirmed revocation clears the grant and closes the drawing, not the device library. Unsaved work may be lost.
- Google Analytics starts only after authorization. It collects a fixed app_access event and basic device/browser/language, cookie/Firebase installation identifier and connection information, potentially including approximate region derived from IP. This edition does not claim zero data collection.
- Analytics runs in a separate empty document with no account or drawing DOM. We set no userId and send no email, Firebase UID, private filenames, drawing contents, annotations, addresses, CAD coordinates or diagnostics. Page location is fixed, with no main-page query or referrer. Advertising personalization and Google signals are disabled. Analytics failure does not block CAD.
- PWA Cache Storage stores public assets separately from the localStorage grant. The UI reports resource readiness; an incomplete or evicted cache cannot guarantee offline reopening. Private browsing, blocked storage or clearing site data can remove offline capability.
- The local grant is not cryptographically signed or tamper resistant. Clock checkpoints reject ordinary rollback/corruption, not deliberate browser-data manipulation or full backup replay. Revocation cannot be instantaneous while offline. Public code may be run separately; this site's gate is not DRM.
