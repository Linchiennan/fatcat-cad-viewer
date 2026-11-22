# 009 技術計畫 — 工程相機

## 架構（全部在網頁層，原生只加權限）
| 模組 | 位置 | 做什麼 | 沿用 |
|---|---|---|---|
| 批次資料 | src/camera/batchStore.ts | IndexedDB 新庫 `fatcat-camera`：batches、points、photos（原圖 Blob）、signers | 圖面庫的 IndexedDB 寫法、requestPersistentStorage |
| 編號 | src/camera/numbering.ts | 純函式：點順序 → N／N-1／Nx2、刪點補號、手動改號檢查、檔名與兩位數顯示 | — |
| 圖上符號 | src/camera/markerLayer.tsx | 紅圈＋編號＋三角箭頭（SVG 疊層，跟註記層同投影）；點選、拖曳位置、拖箭頭（45° 吸附） | canvas/SelectionOverlay、MarkupLayer 的投影與手勢 |
| 相機 | src/camera/CameraScreen.tsx | App 內相機：getUserMedia 後鏡頭即時預覽＋白板疊層；拍照用 ImageCapture.takePhoto 取原解析度 | — |
| 白板 | src/camera/whiteboard.ts | 白板版面（欄位、字級、位置、大小）＋畫到 canvas；預覽與匯出同一個繪製函式 | — |
| 簽名 | src/camera/SignaturePad.tsx | 手指簽名 → 筆畫點列（向量）存檔，匯出時畫成筆跡 | — |
| 施工位置 | src/camera/placeName.ts | 圖名取樓層（8F、13F…）；點附近最近的房名／戶別文字（量測索引的文字，限定半徑） | viewer/textSearch、measurementGeometry |
| 對位圖 | src/camera/alignmentSheet.ts | PDF：用輸出引擎畫圖紙＋符號（exportDrawing 加符號繪製）；標記 DXF：手寫 R12 DXF（CIRCLE、TEXT、SOLID 三角形），圖層「拍照對位」，座標＝圖面座標 | export/exportDrawing、exportPlan |
| 照片合成 | src/camera/composePhoto.ts | 原圖＋白板＋簽名 → canvas → toBlob('image/jpeg', 0.85)，原解析度 | — |
| 保存卡 | src/camera/photoCard/docx.ts、pdf.ts | docx：自己組 WordprocessingML（表格、圖片、頁首），fflate 壓成 .docx；pdf：同一份版面資料用 canvas 逐頁畫成圖再用 pdf-lib 組（中文不用嵌字型） | fflate、pdf-lib |
| 匯出 | src/camera/exportBatch.ts | ZIP（fflate）：對位圖／照片（／原圖）／照片保存卡；檔名規則比照範例；分享或存下載 | native/fileHandoff.shareFile |
| 畫面 | src/camera/BatchPanel.tsx | 批次清單、設定、照片清單（含未定位）、匯出 | 現有面板樣式（cad-sheet） |

## 關鍵決定與風險
1、相機必須在 App 內：WebView 的 `<input capture>` 會開系統相機 App，畫面上疊不了白板（定案 F5 要預覽疊白板）。改用 getUserMedia＋ImageCapture。
   - 要在 AndroidManifest 加 CAMERA 權限，第一次用相機時問用戶。原本 App 宣稱「完全不要權限」，這是第一個權限。
   - 風險：部分手機的 takePhoto 解析度比系統相機低。上線前要在用戶手機（Zenfone 11 Ultra）實測。若太低，退回系統相機（拍完才擺白板）。
2、EXIF：canvas 合成會丟 EXIF（拍攝時間、機型）。白板已有日期，拍攝時間另存在批次資料，保存卡用得到；匯出照片不保留 EXIF。
3、保存卡 PDF 不從 docx 轉（手機沒有 Word）：docx 與 PDF 用同一份版面資料各畫一次。驗收時拿 Word 開 docx 轉 PDF，和 App 產的 PDF 比版面。
4、字型：docx 指定「新細明體」（與範例一致，Word 有）；App 畫 PDF 用內附 Noto Sans CJK。字形略有不同、版面相同。
5、儲存空間：原圖約 1.2 MB／張，一批 40 張約 50 MB。存在 IndexedDB，啟用持久儲存。批次可以刪除（刪前確認）。
6、標記 DXF 用最簡單的 R12 格式，ZWCAD／AutoCAD 都能 INSERT。
7、手機只能直向（已定案的方向規則）；相機畫面也鎖直向。橫拍照片照樣存，白板依照片方向擺。

## 測試
- 單元：numbering（補號、改號、重號）、placeName、whiteboard 版面計算、DXF 內容、docx XML（用 fflate 解開檢查結構）、ZIP 結構與檔名。
- 無頭瀏覽器：假相機（Playwright 假影像串流）走完流程「點圖 → 拍 → 匯出」；檢查 ZIP。
- 對照範例：用範例 8F 對位圖與照片重建一批（測試用匯入照片），保存卡逐頁和範例比；對位 DXF 用無頭 ZWCAD 插入原 DWG 比位置。
- 手機實測：Zenfone 實機測相機解析度、權限詢問、白板預覽、分享。
