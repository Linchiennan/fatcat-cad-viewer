// Full-screen preview of an export inside the app (用戶 2026-10-29：點一下圖片要預覽，不是下載). Tapping used to
// open the file in a new tab, which a browser blocks once the file has been read from storage, so it was saved
// instead. PNG shows whole; PDF shows its pages (first 30). Tap the picture for actual size, again to fit.
// Only the picture area scrolls; the title bar with 分享／打開／關閉 stays put.
import { useEffect, useState } from "react";
import { MarqueeText } from "../components/MarqueeText";
import { CloseIcon, FolderOpenIcon, ShareIcon } from "../components/Icons";
import { loadPdfJs, runtimeUrl } from "../pdf/PdfViewer";
import { Dialog } from "./LibraryDialog";
import { readExport, type ExportEntry } from "./exportStore";
import { libraryText } from "./libraryText";
import type { Locale } from "../i18n/translations";

const MAX_PDF_PAGES = 30;
/** Longest side of a rendered PDF page, px: sharp on a phone held sideways, light enough for 30 pages. */
const PDF_PAGE_PX = 2000;

async function pdfPages(file: File, alive: () => boolean): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: runtimeUrl("cmaps/"), cMapPacked: true, standardFontDataUrl: runtimeUrl("standard_fonts/") });
  task.onPassword = () => { void task.destroy(); };
  const urls: string[] = [];
  try {
    const pdf = await task.promise;
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PDF_PAGES) && alive(); n++) {
      const page = await pdf.getPage(n), base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_PAGE_PX / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
      page.cleanup();
      if (blob) urls.push(URL.createObjectURL(blob));
    }
  } finally { await task.destroy(); }
  return urls;
}

export function ExportPreviewDialog({ entry, locale, onClose, onShare, onOpen }: {
  entry: ExportEntry; locale: Locale; onClose(): void; onShare(): void; onOpen(): void;
}) {
  const en = locale === "en";
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [actual, setActual] = useState(false);
  useEffect(() => {
    let alive = true, urls: string[] = [];
    (async () => {
      const file = await readExport(entry.id);
      urls = entry.format === "pdf" ? await pdfPages(file, () => alive) : [URL.createObjectURL(file)];
      if (alive) setPages(urls); else urls.forEach((u) => URL.revokeObjectURL(u));
    })().catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [entry.id, entry.format]);
  const more = entry.format === "pdf" && (entry.pageCount ?? 0) > MAX_PDF_PAGES;
  return (
    <Dialog className="export-preview" label={entry.name} onCancel={onClose}>
      <div className="export-preview-bar">
        <span className="export-preview-title"><MarqueeText text={entry.name} /></span>
        <button type="button" className="lib-icon-btn" aria-label={libraryText(locale, "share")} title={en ? "Share: send this file to another app" : "分享：把這個檔案傳到其他 App"} onClick={onShare}><ShareIcon /></button>
        <button type="button" className="lib-icon-btn" aria-label={libraryText(locale, "open")} title={en ? "Open: show it in another app" : "打開：用其他 App 開啟這個檔案"} onClick={onOpen}><FolderOpenIcon /></button>
        <button type="button" className="lib-icon-btn" aria-label={en ? "Close" : "關閉"} title={en ? "Close the preview" : "關閉預覽"} onClick={onClose}><CloseIcon /></button>
      </div>
      <div className={`export-preview-body${actual ? " is-actual" : ""}`} aria-busy={!pages && !failed}>
        {failed ? <p className="export-preview-note is-error">{en ? "This file cannot be previewed." : "這個檔案無法預覽。"}</p>
          : !pages ? <p className="export-preview-note">{en ? "Loading preview…" : "正在載入預覽…"}</p>
          : pages.map((src, i) => (
            <img key={src} src={src} draggable={false} onClick={() => setActual((v) => !v)}
              alt={entry.format === "pdf" ? (en ? `Page ${i + 1}` : `第 ${i + 1} 頁`) : entry.name}
              title={actual ? (en ? "Tap to fit the screen" : "點一下：符合螢幕") : (en ? "Tap for actual size" : "點一下：原尺寸")} />
          ))}
        {pages && more ? <p className="export-preview-note">{en ? `First ${MAX_PDF_PAGES} pages shown; open the file for the rest.` : `只顯示前 ${MAX_PDF_PAGES} 頁，其餘請按「打開」。`}</p> : null}
      </div>
    </Dialog>
  );
}
