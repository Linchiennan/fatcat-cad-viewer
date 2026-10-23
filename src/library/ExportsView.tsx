// Exports area inside the library (輸出成果, spec 005-1/7): newest first with previews, total size on top,
// a warning above 500 MB, long-press menu (open / share / rename / delete). Nothing is deleted automatically.
// Owner: P4 group A.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MarqueeText } from "../components/MarqueeText";
import { CloseIcon, FileIcon, RenameIcon, ShareIcon, TrashIcon, FolderOpenIcon } from "../components/Icons";
import { useI18n } from "../i18n/translations";
import { Dialog } from "./LibraryDialog";
import { openExportFile, shareExportFile } from "./exportFileActions";
import {
  deleteExport, exportsOverWarning, listExports, readExport, readExportThumbnails, renameExport, type ExportEntry,
} from "./exportStore";
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
  const [warningClosed, setWarningClosed] = useState(false);
  const [reload, setReload] = useState(0);
  const press = useRef<{ id: string; x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

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
      // Previews are best effort: a missing one only shows the file icon.
      const blobs = await readExportThumbnails(list.map((e) => e.id)).catch(() => new Map<string, Blob>());
      if (!live) return;
      const map = new Map<string, string>();
      for (const [id, blob] of blobs) {
        try {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          map.set(id, url);
        } catch {
          /* no preview */
        }
      }
      setThumbs(map);
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
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const timer = setTimeout(() => {
      if (press.current?.id !== entry.id) return;
      press.current.fired = true;
      setPopup({ kind: "menu", entry });
    }, LONG_PRESS_MS);
    press.current = { id: entry.id, x: e.clientX, y: e.clientY, timer, fired: false };
  };
  const moveOrCancel = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && (e.type === "pointercancel" || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)) {
      clearTimeout(p.timer);
      press.current = null;
    }
  };
  const click = (entry: ExportEntry) => {
    const p = press.current;
    press.current = null;
    if (p) clearTimeout(p.timer);
    if (p?.fired || busy) return;
    void open(entry);
  };

  return (
    <>
      <div className="lib-body lib-exports" inert={inert}>
        <div className="lib-exports-summary">
          <strong>{libraryText(locale, "exportsUsed", { size: sizeText })}</strong>
          <span>{libraryText(locale, "exportsHint")}</span>
        </div>
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
            <ul>
              {items.map((entry) => (
                <li key={entry.id} className="lib-row export">
                  <button
                    type="button" className="lib-row-main" disabled={busy}
                    onPointerDown={(e) => down(entry, e)} onPointerMove={moveOrCancel} onPointerCancel={moveOrCancel}
                    onClick={() => click(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (press.current) clearTimeout(press.current.timer);
                      press.current = null;
                      setPopup({ kind: "menu", entry });
                    }}
                  >
                    <span className="lib-export-thumb">
                      {thumbs.get(entry.id) ? <img src={thumbs.get(entry.id)} alt="" draggable={false} /> : <FileIcon />}
                    </span>
                    <span className="lib-row-text">
                      <MarqueeText text={entry.name} />
                      <small>
                        {`${entry.format.toUpperCase()} · ${formatLibrarySize(entry.size, locale)} · ${formatLibraryDate(entry.createdAt, locale)}`}
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
