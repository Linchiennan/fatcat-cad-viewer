# 網頁版隱私告知 / Web privacy notice

## 繁體中文
這份告知適用於 Google 帳號白名單網頁測試版，不代表原生離線版本的資料行為。
- Google/Firebase Authentication 處理 Google 登入（電子郵件、帳號識別及驗證狀態）；Firestore 以電子郵件查詢自己的 allowedUsers 文件，用於存取控制，不上傳圖檔。
- 本機 DWG/DXF/PDF、字型、圖庫、標註和輸出內容留在裝置。分享或另存由你主動操作；本網頁不啟用自用診斷上傳。
- 每次啟動、返回前景與恢復網路均需在線查核白名單；使用期間每分鐘重驗並監聽文件變更。斷網鎖定操作但暫留已開圖記憶體，不刪圖庫。移除/停用白名單會關圖並登出，尚未保存的操作可能失去。共用裝置的本機圖庫由裝置使用者自行管理，登出不清圖庫。
- 只有授權成功後才啟用 Google Analytics：收集固定 app_access 使用事件，以及 Google Analytics 的基本裝置、瀏覽器、語言、cookie／Firebase installation 裝置識別和連線資訊（可能由 IP 推估大略地區）。這不是「完全不收集任何資料」。
- Analytics 在不含圖面與帳號資料的獨立空白文件執行。程式不設定 userId，不傳電子郵件、Firebase UID、私人檔名、圖檔內容、標註、地址、CAD 座標或診斷。統計頁面位置固定，不傳主頁查詢字串或來源頁；停用廣告個人化與 Google signals。阻擋 Analytics 不影響權限或 CAD。
- PWA 快取只保存公開程式、字型和執行資源，不保存存取授權；已快取不代表獲准使用。舊 PWA 的離線啟動承諾不適用此白名單版本。
- GitHub Pages 與公開 repository 可提供公開程式檔案；白名單只限制本站入口，不是原碼保密或 DRM。

## English
This notice applies to the allowlisted Google-account web preview, not the native offline edition.
- Google/Firebase Authentication processes your Google sign-in, email, identifier and verification status. Firestore reads your own allowedUsers document for access control; drawings are not uploaded.
- Drawings, fonts, library, annotations and exports remain on the device. Sharing/saving requires your action. Private diagnostic uploads are disabled in this web edition.
- Online verification is required at launch, on return, on reconnect and every minute, with document-change monitoring. Offline access is locked while an already-open drawing remains in memory. Removing/disabling access closes the drawing and signs out; unsaved work may be lost. Signing out does not delete the device library; manage it on shared devices.
- Google Analytics starts only after authorization. It collects a fixed app_access event and basic device/browser/language, cookie/Firebase installation identifier and connection information, potentially including approximate region derived from IP. This edition does not claim zero data collection.
- Analytics runs in a separate empty document with no account or drawing DOM. We set no userId and send no email, Firebase UID, private filenames, drawing contents, annotations, addresses, CAD coordinates or diagnostics. Page location is fixed, with no main-page query or referrer. Advertising personalization and Google signals are disabled. Analytics failure does not block CAD.
- PWA caches public program assets, not authorization. Offline cold start is not supported. Public code may be run separately; this site's gate is not DRM.
