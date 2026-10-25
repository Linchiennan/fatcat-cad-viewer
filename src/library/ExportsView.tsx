// Exports area inside the library (輸出成果, spec 005-1/7): newest first with previews, total size on top,
// a warning above 500 MB, long-press menu (open / share / rename / delete). Nothing is deleted automatically.
// Owner: P4 group A.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MarqueeText } from "../components/MarqueeText";
import { CloseIcon, FileIcon, RenameIcon, ShareIcon, TrashIcon, FolderOpenIcon } from "../components/Icons";
import { useI18n } from "../i18n/translations";
import { Dialog } from "./LibraryDialog";
import { exportFilesZip, shareExportFiles, openExportFile, shareExportFile } from "./exportFileActions";
import {
  cacheExportPreview, deleteExport, exportsOverWarning, listExports, readExport, readExportThumbnails, renameExport, type ExportEntry,
} from "./exportStore";
import { renderExportPreview } from "./exportPreview";
import { libraryText } from "./libraryText";
import { formatLibraryDate, formatLibrarySize } from "./libraryView";

export type ExportPopup =
  | { kind: "menu"; entry: ExportEntry }
  | { kind: "rename"; entry: ExportEntry }
  | { kind: "delete"; entry: ExportEntry }
  | null;

/** Hold this long to open the item menu. */
export const LONG_PRESS_MS = 600;

export function ExportsView({ popup, setPopup, busy, runBusy, notify, inert }: {
  popup: ExportPopup;
  setPopup(next: ExportPopup): void;
  busy: boolean;
  runBusy(work: () => Promise<void>): Promise<void>;
  notify(text: string): void;
  inert: boolean;
}) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<ExportEntry[] | null>(null);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [previewErrors, setPreviewErrors] = useState<Set<string>>(new Set());
  const [warningClosed, setWarningClosed] = useState(false);
  const [reload, setReload] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [prepared, setPrepared] = useState<{key: string; files: File[]} | null>(null);
  const [shareFallback, setShareFallback] = useState<File[] | null>(null);
  const selectionKey = JSON.stringify([...selected].sort());
  useEffect(() => {
    let live = true; setPrepared(null);
    if (selected.size) void Promise.all([...selected].map(readExport)).then(files => { if (live) setPrepared({key: selectionKey, files}); }).catch(() => { if (live) notify(locale === 'en' ? 'Unable to read selected exports.' : '無法讀取所選成果，請重試。'); });
    return () => { live = false; };
  }, [selectionKey, reload]);
  const suppressClick = useRef(false);
  const en = locale === 'en';
  const toggle = (id: string) => setSelected(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };
  const press = useRef<{ id: string; x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  useEffect(() => () => cancelPress(), []);
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    (async () => {
      let list: ExportEntry[];
      try {
        list = await listExports();
      } catch {
        if (live) setItems([]);
        return;
      }
      if (!live) return;
      setItems(list);
      setSelected(old => new Set([...old].filter(id => list.some(item => item.id === id))));
      setPreviewErrors(new Set());
      // Existing image previews are reused; PDFs get verified first-page previews once.
      const blobs = await readExportThumbnails(list.map((e) => e.id)).catch(() => new Map<string, Blob>());
      if (!live) return;
      const map = new Map<string, string>();
      for (const [id, blob] of blobs) {
        const entry = list.find(e => e.id === id);
        if (entry?.format === "pdf" && entry.previewVersion !== 1) continue;
        try {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          map.set(id, url);
        } catch {
          /* no preview */
        }
      }
      setThumbs(new Map(map));
      // Serial work bounds PDF memory to one document/page, never renders the whole PDF.
      for (const entry of list) {
        if (!live) return;
        if (map.has(entry.id)) continue;
        try {
          const preview = await renderExportPreview(await readExport(entry.id), entry.format);
          if (!live) return;
          await cacheExportPreview(entry.id, preview.thumbnail, preview.pageCount);
          if (!live) return;
          const url = URL.createObjectURL(preview.thumbnail); urls.push(url); map.set(entry.id, url);
          setThumbs(new Map(map));
          setItems(old => old?.map(e => e.id === entry.id ? {...e, thumbnailSize: preview.thumbnail.size, pageCount: preview.pageCount, previewVersion: 1} : e) ?? null);
        } catch { if (live) setPreviewErrors(old => new Set([...old, entry.id])); }
      }
    })();
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [reload]);

  const total = (items ?? []).reduce((sum, e) => sum + e.size + e.thumbnailSize, 0);
  const sizeText = formatLibrarySize(total, locale);
  const refresh = () => setReload((n) => n + 1);

  const open = (entry: ExportEntry) => runBusy(async () => openExportFile(await readExport(entry.id)));
  const share = (entry: ExportEntry) => runBusy(async () => shareExportFile(await readExport(entry.id)));

  // Long press (or right click) opens the menu; a short tap opens the file.
  const down = (entry: ExportEntry, e: ReactPointerEvent) => {
    cancelPress(); suppressClick.current = false;
    if (busy || selecting || (e.pointerType === "mouse" && e.button !== 0)) return;
    const timer = setTimeout(() => {
      if (press.current?.id !== entry.id) return;
      press.current.fired = true;
      suppressClick.current = true;
      setSelecting(true); setSelected(new Set([entry.id]));
    }, LONG_PRESS_MS);
    press.current = { id: entry.id, x: e.clientX, y: e.clientY, timer, fired: false };
  };
  const moveOrCancel = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && (e.type === "pointercancel" || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)) {
      clearTimeout(p.timer);
      suppressClick.current = true;
      press.current = null;
    }
  };
  const click = (entry: ExportEntry) => {
    const p = press.current;
    press.current = null;
    if (p) clearTimeout(p.timer);
    if (p?.fired || suppressClick.current || busy) { suppressClick.current = false; return; }
    if (selecting) { toggle(entry.id); return; }
    void open(entry);
  };

  return (
    <>
      <div className="lib-body lib-exports" inert={inert || !!deleteIds || !!shareFallback}
        onPointerDownCapture={() => { suppressClick.current = false; }}
        onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; cancelPress(); } }}
        onScrollCapture={() => { if (press.current) { suppressClick.current = true; cancelPress(); } }}>
        <div className="lib-exports-summary">
          <strong>{libraryText(locale, "exportsUsed", { size: sizeText })}</strong>
          <span>{en ? "Tap to preview; hold to select. All/none applies to this export list." : "點一下預覽，按住進入選擇。全選／取消範圍：目前成果列表。"}</span>
        </div>
        {selecting ? <div className="export-selection" role="toolbar" aria-label={en ? 'Export selection' : '成果選擇'}>
          <strong role="status">{en ? `${selected.size} selected` : `已選 ${selected.size} 項`}</strong>
          <button type="button" disabled={busy} onClick={() => setSelected(new Set((items ?? []).map(e => e.id)))}>{en ? 'Select all' : '全部選擇'}</button>
          <button type="button" disabled={busy} onClick={() => setSelected(new Set())}>{en ? 'Deselect all' : '全部取消'}</button>
          <button type="button" disabled={busy || !selected.size || prepared?.key !== selectionKey} onClick={() => {
            const files = prepared!.files;
            const pending = shareExportFiles(files);
            void runBusy(async () => { try { const result = await pending; if (result === 'unsupported') setShareFallback(files); } catch { notify(en ? 'Sharing failed. You may export a ZIP instead.' : '分享失敗，可改用 ZIP 匯出。'); setShareFallback(files); } });
          }}>{en ? 'Share' : '分享'}</button>
          <button type="button" disabled={busy || !selected.size} onClick={() => setDeleteIds([...selected])}>{en ? 'Delete' : '刪除'}</button>
          <button type="button" disabled={busy} onClick={() => { setSelecting(false); setSelected(new Set()); }}>{en ? 'Exit selection' : '退出選擇'}</button>
        </div> : null}
        <div className="lib-list" aria-busy={items === null}>
          {items === null ? (
            <div className="lib-skeleton" aria-label={t("load.opening")}><span /><span /><span /></div>
          ) : items.length === 0 ? (
            <div className="lib-empty">
              <FileIcon />
              <strong>{libraryText(locale, "exportsEmptyTitle")}</strong>
              <p>{libraryText(locale, "exportsEmptyBody")}</p>
            </div>
          ) : (
            <ul className="export-grid">
              {items.map((entry) => (
                <li key={entry.id} className="lib-row export" data-selected={selected.has(entry.id)}>
                  {selecting ? <input className="export-checkbox" type="checkbox" aria-label={`${en ? 'Select' : '選取'} ${entry.name}`} checked={selected.has(entry.id)} disabled={busy} onChange={() => toggle(entry.id)} /> : null}
                  <button
                    type="button" className="lib-row-main" disabled={busy}
                    onPointerDown={(e) => down(entry, e)} onPointerMove={moveOrCancel} onPointerCancel={moveOrCancel}
                    onPointerUp={() => { if (press.current) clearTimeout(press.current.timer); }}
                    onPointerLeave={() => { if (press.current) { suppressClick.current = true; cancelPress(); } }}
                    onClick={() => click(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (selecting || press.current?.fired || (e.nativeEvent as PointerEvent).pointerType === "touch") return;
                      if (press.current) clearTimeout(press.current.timer);
                      press.current = null;
                      setPopup({ kind: "menu", entry });
                    }}
                  >
                    <span className="lib-export-thumb">
                      {thumbs.get(entry.id) ? <img src={thumbs.get(entry.id)} alt={entry.format === "pdf" ? (en ? "PDF first page" : "PDF 第一頁") : (en ? "Image preview" : "圖片預覽")} draggable={false} /> : <span className="export-preview-status">{previewErrors.has(entry.id) ? (en ? "Preview unavailable" : "預覽無法產生") : (en ? "Loading preview…" : "預覽載入中…")}</span>}
                    </span>
                    <span className="lib-row-text">
                      <MarqueeText text={entry.name} />
                      <small>
                        {`${entry.format.toUpperCase()} · ${formatLibrarySize(entry.size, locale)} · ${formatLibraryDate(entry.createdAt, locale)}`}
                        {entry.format === "pdf" && entry.pageCount ? ` · ${entry.pageCount} ${en ? "pages" : "頁"}` : ""}
                        {entry.downscaled ? ` · ${libraryText(locale, "downscaled")}` : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {shareFallback ? <Dialog className="lib-dialog" label={en ? 'Sharing unavailable' : '無法直接分享'} onCancel={() => setShareFallback(null)}>
        <h3>{en ? 'Direct file sharing is unavailable' : '此環境無法直接分享所選檔案'}</h3>
        <p>{en ? `All ${shareFallback.length} files can be exported together as a ZIP. On the web this may download the ZIP; Android opens the ZIP share sheet.` : `可將全部 ${shareFallback.length} 個所選檔案打包成 ZIP。網頁可能下載 ZIP；Android 使用既有單檔分享。沒有上傳至外部服務。`}</p>
        <div className="lib-dialog-buttons"><button type="button" onClick={() => setShareFallback(null)}>{t('action.cancel')}</button>
          <button type="button" onClick={() => { const files = shareFallback; setShareFallback(null); void runBusy(async () => { const outcome = await exportFilesZip(files); notify(outcome === 'downloaded' ? (en ? 'ZIP downloaded (not shared)' : 'ZIP 已下載（非分享）') : outcome === 'cancelled' ? (en ? 'Cancelled' : '已取消') : (en ? 'ZIP handed to share sheet' : 'ZIP 已交給分享選單')); }); }}>{en ? 'Export ZIP' : '匯出 ZIP'}</button>
        </div>
      </Dialog> : null}

      {deleteIds ? <Dialog className="lib-dialog" role="alertdialog" label={en ? 'Delete selected exports' : '刪除所選成果'} onCancel={() => setDeleteIds(null)}>
        <h3>{en ? `Delete ${deleteIds.length} exports?` : `確定刪除 ${deleteIds.length} 項成果？`}</h3>
        <p>{en ? 'Only the selected exports will be deleted. Original drawings are untouched.' : '只刪除所選歷史輸出，不會刪除原圖庫檔案。'}</p>
        <div className="lib-dialog-buttons"><button type="button" disabled={busy} onClick={() => setDeleteIds(null)}>{t('action.cancel')}</button>
        <button type="button" className="lib-danger" disabled={busy} onClick={() => { const ids = deleteIds; setDeleteIds(null); void runBusy(async () => { try { for (const id of ids) await deleteExport(id); } finally { setSelected(new Set()); refresh(); } }); }}>{en ? 'Confirm delete' : '確認刪除'}</button></div>
      </Dialog> : null}

      {items && exportsOverWarning(total) && !warningClosed ? (
        <div className="lib-warning" role="alert">
          <p>{libraryText(locale, "exportsWarning", { size: sizeText })}</p>
          <button type="button" className="lib-icon-btn" aria-label={libraryText(locale, "closeWarning")} title={libraryText(locale, "closeWarning")} onClick={() => setWarningClosed(true)}>
            <CloseIcon />
          </button>
        </div>
      ) : null}

      {popup?.kind === "menu" ? (
        <Dialog className="lib-sheet" label={popup.entry.name} onCancel={() => setPopup(null)}>
          <span className="lib-sheet-handle" aria-hidden="true" />
          <h3>{popup.entry.name}</h3>
          <div className="lib-sheet-tiles">
            {([
              ["open", <FolderOpenIcon key="i" />, libraryText(locale, "open")],
              ["share", <ShareIcon key="i" />, libraryText(locale, "share")],
              ["rename", <RenameIcon key="i" />, t("action.rename")],
              ["delete", <TrashIcon key="i" />, t("action.delete")],
            ] as const).map(([kind, icon, label]) => (
              <button
                key={kind} type="button" className={kind === "delete" ? "lib-tile danger" : "lib-tile"}
                onClick={() => {
                  const entry = popup.entry;
                  if (kind === "rename" || kind === "delete") {
                    setPopup({ kind, entry });
                    return;
                  }
                  setPopup(null);
                  void (kind === "open" ? open(entry) : share(entry));
                }}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </Dialog>
      ) : null}

      {popup?.kind === "rename" ? (
        <RenameExportDialog
          entry={popup.entry}
          onCancel={() => setPopup(null)}
          onConfirm={(name) => {
            const entry = popup.entry;
            setPopup(null);
            void runBusy(async () => {
              await renameExport(entry.id, name);
              notify(t("library.toast.renamed"));
              refresh();
            });
          }}
        />
      ) : null}

      {popup?.kind === "delete" ? (
        <Dialog className="lib-dialog" role="alertdialog" label={t("library.deleteTitle")} onCancel={() => setPopup(null)}>
          <h3>{t("library.deleteTitle")}</h3>
          <p>{libraryText(locale, "exportsDeleteBody")}</p>
          <div className="lib-dialog-buttons">
            <button type="button" className="lib-secondary" onClick={() => setPopup(null)}>{t("action.cancel")}</button>
            <button
              type="button" className="lib-danger"
              onClick={() => {
                const entry = popup.entry;
                setPopup(null);
                void runBusy(async () => {
                  await deleteExport(entry.id);
                  notify(t("library.toast.deleted"));
                  refresh();
                });
              }}
            >
              {t("action.delete")}
            </button>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function RenameExportDialog({ entry, onCancel, onConfirm }: { entry: ExportEntry; onCancel(): void; onConfirm(name: string): void }) {
  const { t } = useI18n();
  const ext = `.${entry.format}`;
  const [value, setValue] = useState(entry.name.toLowerCase().endsWith(ext) ? entry.name.slice(0, -ext.length) : entry.name);
  const ok = value.trim() !== "";
  return (
    <Dialog className="lib-dialog" label={t("action.rename")} onCancel={onCancel}>
      <h3>{t("action.rename")}</h3>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onConfirm(value.trim() + ext); }}>
        <label className="lib-field">
          <span>{t("action.rename")}</span>
          <span className="lib-field-row">
            <input value={value} maxLength={220 - ext.length} onChange={(e) => setValue(e.currentTarget.value)} />
            <span className="lib-field-ext">{ext}</span>
          </span>
        </label>
        <div className="lib-dialog-buttons">
          <button type="button" className="lib-secondary" onClick={onCancel}>{t("action.cancel")}</button>
          <button type="submit" className="lib-primary" disabled={!ok}>{t("action.save")}</button>
        </div>
      </form>
    </Dialog>
  );
}
