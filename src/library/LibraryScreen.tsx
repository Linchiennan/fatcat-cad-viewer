// Drawing library overlay (T11 2, 4, 8.5; exports area spec 005). Owner: P4 group A.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { DragRow } from "../components/DragRow";
import { IS_WEB_BUILD } from "../app/platform";
import { MarqueeText } from "../components/MarqueeText";
import { RecentCarousel } from "../components/RecentCarousel";
import {
  ArrowLeftIcon, ChevronRightIcon, CloseIcon, FileIcon, FolderCheckIcon, FolderIcon, FolderOpenIcon, ImportIcon, MoreIcon,
  RenameIcon, TrashIcon,
} from "../components/Icons";
import { openArchive, type ArchiveItem, type ArchiveSession } from "../files/archives";
import { FILE_ACCEPT, detectDrawingFormat, isArchiveFormat } from "../files/fileTypes";
import { cannotPickFolder } from "../files/folderPick";
import { useI18n } from "../i18n/translations";
import {
  MAX_NAME_LENGTH, ROOT_ID, copyLibraryEntry, createLibraryFolder, deleteLibraryEntry, importArchiveToLibrary,
  importDrawingToLibrary, libraryBreadcrumb, listLibraryChildren, listLibraryFolders, listRecentDrawings, moveLibraryEntry,
  openLibraryDrawing, renameLibraryEntry, replaceLibraryDrawing, requestPersistentStorage,
  folderImportItems, folderNameOf, type ArchiveImportItem, type LibraryDrawingEntry, type LibraryEntry, type LibraryFolderEntry,
} from "./drawingLibrary";
import { libraryText } from "./libraryText";
import {
  decideLibraryBack, filterLibraryEntries, formatLibraryDate, formatLibrarySize, isAbortError, libraryErrorMessage,
  progressPercent, setLibraryBackHandler, sortLibraryEntries, type LibrarySort,
} from "./libraryView";
import { Dialog } from "./LibraryDialog";
import { ImportVersionDialog } from "./ImportVersionDialog";
import { importDrawingWithDecision, type ImportConflict, type ImportChoice } from "./drawingLibrary";
import { ExportsView, LONG_PRESS_MS, type ExportPopup } from "./ExportsView";
import "./library.css";

export type LibraryScreenProps = {
  /** Open a file; entryId is set when it came from the library. */
  onOpen(file: File, entryId: string): void;
  onClose(): void;
  /** An archive handed in from outside (picker or Android) to extract here, or null. */
  incomingArchive: File | null;
  /** The library has taken the incoming archive (App clears it). */
  onArchiveTaken(): void;
};

type Toast = { text: string; error: boolean };
type Overlay =
  | { kind: "actions"; entry: LibraryEntry }
  | { kind: "text"; mode: "create" | "rename"; entry?: LibraryEntry }
  | { kind: "destination"; mode: "copy" | "move"; entry: LibraryEntry }
  | { kind: "delete"; entry: LibraryEntry }
  | null;
type ArchiveState = {
  name: string;
  phase: "loading" | "ready" | "extracting" | "error";
  items: ArchiveItem[];
  checked: Set<string>;
  progress: number;
  error: string | null;
};

const TOAST_MS = 3200;

export function LibraryScreen({ onOpen, onClose, incomingArchive, onArchiveTaken }: LibraryScreenProps) {
  const { locale, t } = useI18n();
  const [folderId, setFolderId] = useState(ROOT_ID);
  const [children, setChildren] = useState<LibraryEntry[]>([]);
  const [crumbs, setCrumbs] = useState<LibraryFolderEntry[]>([]);
  const [recent, setRecent] = useState<LibraryDrawingEntry[]>([]);
  const [folders, setFolders] = useState<LibraryFolderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Overlays are mutually exclusive: one popup at a time (T11 4.1-3); the archive dialog sits above them.
  const [popup, setPopup] = useState<Overlay>(null);
  const [searchText, setSearchText] = useState("");
  const [notice, setNotice] = useState<Toast | null>(null);
  const [sortMode, setSortMode] = useState<LibrarySort>("name");
  const [archive, setArchive] = useState<ArchiveState | null>(null);
  const [reload, setReload] = useState(0);
  // Hold a row to select several and delete them together, as 歷史輸出 does (用戶 2026-10-27：長按出現全選刪除).
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const press = useRef<{ id: string; x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const suppressClick = useRef(false);
  const cancelPress = () => { if (press.current) clearTimeout(press.current.timer); press.current = null; };
  const exitSelection = () => { setSelecting(false); setSelected(new Set()); };
  useEffect(() => () => cancelPress(), []);
  // Exports area (spec 005): replaces the old "new folder" button.
  const [exportsOpen, setExportsOpen] = useState(false);
  const [exportPopup, setExportPopup] = useState<ExportPopup>(null);
  const busyRef = useRef(false);
  const [importConflict, setImportConflict] = useState<ImportConflict | null>(null);
  const choiceRef = useRef<((choice: ImportChoice) => void) | null>(null);
  const chooseImport = useCallback((choice: ImportChoice) => {
    const resolve = choiceRef.current;
    choiceRef.current = null;
    setImportConflict(null);
    resolve?.(choice);
  }, []);
  const decideImport = (conflict: ImportConflict) => new Promise<ImportChoice>(resolve => {
    choiceRef.current = resolve;
    setImportConflict(conflict);
  });
  useEffect(() => () => { choiceRef.current?.('cancel'); choiceRef.current = null; }, []);
  const addInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [folderOffer, setFolderOffer] = useState<{ name: string; items: ArchiveImportItem[]; bytes: number } | null>(null);
  // Phones: the files picked instead of a folder, each with its tick (all ticked to start).
  const pickInput = useRef<HTMLInputElement>(null);
  const noFolderPick = cannotPickFolder();
  const [pickOffer, setPickOffer] = useState<{ name: string; items: ArchiveImportItem[]; on: boolean[] } | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<LibraryDrawingEntry | null>(null);
  const archiveRun = useRef<{ token: number; controller: AbortController; session: ArchiveSession | null; file: File | null }>({ token: 0, controller: new AbortController(), session: null, file: null });

  const message = useCallback((error: unknown) => {
    if (error instanceof Error && error.message.endsWith('select the file again')) return '檔案或圖庫在確認期間已變更，未儲存；請重新加入檔案。';
    const m = libraryErrorMessage(error);
    return "key" in m ? t(m.key) : libraryText(locale, m.own);
  }, [t, locale]);
  const showError = useCallback((error: unknown) => setNotice({ text: message(error), error: true }), [message]);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => requestPersistentStorage(), []);

  // Load the current folder; late results for a folder we already left are dropped (T11 4.1-4).
  useEffect(() => {
    let live = true;
    setLoading(true);
    (async () => {
      try {
        const [list, path, all, rec] = await Promise.all([
          listLibraryChildren(folderId), libraryBreadcrumb(folderId), listLibraryFolders(),
          folderId === ROOT_ID ? listRecentDrawings(6) : Promise.resolve([]),
        ]);
        if (!live) return;
        setChildren(list);
        setCrumbs(path);
        setFolders(all);
        setRecent(rec);
      } catch (e) {
        if (!live) return;
        setChildren([]);
        setRecent([]);
        showError(e);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [folderId, reload, showError]);

  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const goToFolder = (id: string) => {
    setSearchText("");
    setFolderId(id);
  };

  /** Run one write at a time; busy clicks are ignored (T11 4.1-5). */
  const runBusy = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      if (!isAbortError(e)) showError(e);
      refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // ---- archives (T11 2.10, 4.5) ----
  const cancelArchive = useCallback(() => {
    const run = archiveRun.current;
    run.token++;
    run.controller.abort();
    run.session?.close();
    run.session = null;
    run.file = null;
    setArchive(null);
  }, []);

  const startArchive = useCallback(async (file: File, incoming: boolean) => {
    cancelArchive();
    const run = archiveRun.current;
    const token = run.token;
    const controller = new AbortController();
    run.controller = controller;
    run.file = file;
    setArchive({ name: file.name, phase: "loading", items: [], checked: new Set(), progress: 0, error: null });
    try {
      const session = await openArchive(file, controller.signal);
      if (run.token !== token) {
        session.close();
        return;
      }
      run.session = session;
      if (incoming) {
        // An archive from outside is kept in the root folder too, before the dialog becomes ready (T11 4.5-1).
        await importDrawingToLibrary(file, ROOT_ID);
        if (run.token !== token) return;
        refresh();
      }
      setArchive({
        name: file.name, phase: "ready", items: session.items, progress: 0, error: null,
        checked: new Set(session.items.filter((i) => i.supported).map((i) => i.path)),
      });
    } catch (e) {
      if (run.token !== token || isAbortError(e)) return;
      setArchive((a) => (a ? { ...a, phase: "error", error: message(e) } : a));
    }
  }, [cancelArchive, message, refresh]);

  const extractArchive = async () => {
    const run = archiveRun.current;
    const state = archive;
    if (!state || state.phase !== "ready" || !run.session || state.checked.size === 0) return;
    const token = run.token;
    const paths = state.items.filter((i) => state.checked.has(i.path)).map((i) => i.path);
    setArchive({ ...state, phase: "extracting", progress: 0, error: null });
    try {
      const files = await run.session.extract(paths, run.controller.signal, (done, total) => {
        if (run.token === token) setArchive((a) => (a ? { ...a, progress: progressPercent(done, total) } : a));
      });
      if (run.token !== token) return;
      const result = await importArchiveToLibrary(files, folderId, state.name, run.controller.signal);
      if (run.token !== token) return;
      cancelArchive();
      goToFolder(result.folder.id);
      refresh();
      setNotice({ text: `${t("archive.imported")}: ${result.drawings.length}`, error: false });
    } catch (e) {
      if (run.token !== token || isAbortError(e)) return;
      const alive = run.session && !run.session.closed;
      setArchive((a) => (a ? { ...a, phase: alive ? "ready" : "error", error: message(e) } : a));
    }
  };

  // Hand-over from the App (Android open/share, other entry points) (T11 4.5-1).
  useEffect(() => {
    if (!incomingArchive) return;
    onArchiveTaken();
    setPopup(null);
    goToFolder(ROOT_ID);
    void startArchive(incomingArchive, true);
  }, [incomingArchive, onArchiveTaken, startArchive]);

  // Leaving the library cancels any archive work.
  useEffect(() => () => cancelArchive(), [cancelArchive]);

  // ---- open / add / replace ----
  const openEntry = (entry: LibraryEntry) => {
    if (loading || busyRef.current) return;
    if (entry.kind === "folder") {
      goToFolder(entry.id);
      return;
    }
    void runBusy(async () => {
      const file = await openLibraryDrawing(entry.id);
      if (isArchiveFormat(entry.format)) void startArchive(file, false);
      else onOpen(file, entry.id);
    });
  };

  // Hold a row (LONG_PRESS_MS, finger moved under 10 px) to start selecting with it; while selecting a tap toggles.
  const toggleSelected = (id: string) => setSelected((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const rowDown = (entry: LibraryEntry, e: ReactPointerEvent) => {
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
  const rowMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (p && (e.type === "pointercancel" || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)) { clearTimeout(p.timer); press.current = null; }
  };
  const rowClick = (entry: LibraryEntry) => {
    const p = press.current;
    press.current = null;
    if (p) clearTimeout(p.timer);
    if (p?.fired || suppressClick.current) { suppressClick.current = false; return; }
    if (selecting) { toggleSelected(entry.id); return; }
    openEntry(entry);
  };
  // Another folder or a new search shows other rows: the selection does not follow.
  useEffect(() => { setSelecting(false); setSelected(new Set()); }, [folderId, exportsOpen]);

  const onAddFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (addInput.current) addInput.current.value = "";
    if (files.length === 0) return;
    void runBusy(async () => {
      if (files.length === 1) {
        const result = await importDrawingWithDecision(files[0], folderId, decideImport);
        if (result.status === 'cancelled') return;
        if (result.status === 'same') { setNotice({ text: '圖庫已有相同檔案', error: false }); return; }
        const entry = result.entry;
        const snapshot = await openLibraryDrawing(entry.id);
        refresh();
        if (isArchiveFormat(entry.format)) void startArchive(snapshot, false);
        else onOpen(snapshot, entry.id);
        return;
      }
      let added = 0;
      let skipped = 0;
      let firstError: unknown = null;
      for (const f of files) {
        try {
          const result = await importDrawingWithDecision(f, folderId, decideImport);
          if (result.status === 'saved') added++;
          else skipped++;
        } catch (e) {
          firstError ??= e;
        }
      }
      refresh();
      const failed = files.length - added - skipped;
      if (failed === 0) setNotice({ text: `${t("library.importedTitle")}: ${added} · 已略過（取消／圖庫已有相同檔案）: ${skipped}`, error: false });
      else setNotice({ text: `${t("library.importedTitle")}: ${added} · ${t("library.failedTitle")}: ${failed}. ${message(firstError)}`, error: true });
    });
  };

  // 整個資料夾 uses the plain folder picker input everywhere: it gives each file its path inside the folder, and the
  // embedded / in-app browsers reject showDirectoryPicker without opening anything. Nothing is imported until the
  // user confirms the count and size.
  // Phone browsers (and the Android app) cannot pick a folder: the picker opens for files and a folder can only be
  // entered. There 整個資料夾 picks several files instead, listed with ticks (all on) before they go into a new
  // folder; desktop browsers keep the folder picker (用戶指定).
  const pickFolder = () => {
    if (busyRef.current) return;
    (cannotPickFolder() ? pickInput : folderInput).current?.click();
  };
  const offerPicked = (files: File[]) => {
    const items = folderImportItems(files);
    if (!items.length) { if (files.length) setNotice({ text: t("library.folderEmpty"), error: true }); return; }
    const d = new Date(), two = (n: number) => String(n).padStart(2, "0");
    const name = t("library.pickFolderName", { date: `${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}` });
    setPickOffer({ name, items, on: items.map(() => true) });
  };
  const importPicked = (offer: { name: string; items: ArchiveImportItem[]; on: boolean[] }) => {
    const items = offer.items.filter((_, i) => offer.on[i]);
    setPickOffer(null);
    if (!items.length) return;
    void runBusy(async () => {
      const result = await importArchiveToLibrary(items, folderId, offer.name, undefined, false);
      refresh();
      goToFolder(result.folder.id);
      setNotice({ text: t("library.folderImported", { n: result.drawings.length, name: result.folder.name }), error: false });
    });
  };
  const offerFolder = (name: string, files: File[]) => {
    const items = folderImportItems(files);
    if (!items.length) { setNotice({ text: t("library.folderEmpty"), error: true }); return; }
    setFolderOffer({ name: name || t("library.addFolder"), items, bytes: items.reduce((n, i) => n + i.file.size, 0) });
  };
  const importFolder = (offer: { name: string; items: ArchiveImportItem[] }) => {
    setFolderOffer(null);
    void runBusy(async () => {
      const result = await importArchiveToLibrary(offer.items, folderId, offer.name);
      refresh();
      goToFolder(result.folder.id);
      setNotice({ text: t("library.folderImported", { n: result.drawings.length, name: result.folder.name }), error: false });
    });
  };

  const onReplaceFile = (list: FileList | null) => {
    const file = list?.[0];
    if (replaceInput.current) replaceInput.current.value = "";
    const target = replaceTarget.current;
    replaceTarget.current = null;
    if (!file || !target || busyRef.current) return;
    void runBusy(async () => {
      await replaceLibraryDrawing(target.id, file);
      setPopup(null);
      refresh();
      onOpen(await openLibraryDrawing(target.id), target.id);
    });
  };

  // ---- back key / Esc (T11 4.2) ----
  const back = useCallback(() => {
    if (choiceRef.current) { chooseImport('cancel'); return; }
    // the delete question first, then selecting itself (as Esc leaves 歷史輸出 selection)
    if (deleteIds && !busyRef.current) { setDeleteIds(null); return; }
    if (selecting && !busyRef.current) { setSelecting(false); setSelected(new Set()); return; }
    const action = decideLibraryBack({
      archiveOpen: archive !== null, busy: busyRef.current, textDialogOpen: popup?.kind === "text",
      destinationOpen: popup?.kind === "destination", deleteOpen: popup?.kind === "delete",
      actionsOpen: popup?.kind === "actions", exportPopupOpen: exportPopup !== null, exportsOpen,
      hasSearch: searchText !== "", inSubfolder: folderId !== ROOT_ID,
    });
    switch (action) {
      case "cancel-archive": cancelArchive(); break;
      case "close-text": case "close-destination": case "close-delete": case "close-actions": setPopup(null); break;
      case "close-export-popup": setExportPopup(null); break;
      case "close-exports": setExportsOpen(false); break;
      case "clear-search": setSearchText(""); break;
      case "up": goToFolder(crumbs.length > 1 ? crumbs[crumbs.length - 2].id : ROOT_ID); break;
      case "close-library": onClose(); break;
      default: break;
    }
  }, [archive, popup, exportPopup, exportsOpen, searchText, folderId, crumbs, cancelArchive, onClose, chooseImport, deleteIds, selecting]);

  useEffect(() => {
    setLibraryBackHandler(back);
    return () => setLibraryBackHandler(null);
  }, [back]);

  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    e.preventDefault();
    back();
  };

  // ---- derived ----
  const visible = useMemo(() => sortLibraryEntries(filterLibraryEntries(children, searchText, locale), sortMode, locale), [children, searchText, sortMode, locale]);
  const showRecent = folderId === ROOT_ID && searchText.trim() === "" && recent.length > 0;
  const blocked = popup !== null || archive !== null || exportPopup !== null || importConflict !== null || deleteIds !== null;
  const describe = (entry: LibraryEntry) => entry.kind === "folder"
    ? formatLibraryDate(entry.updatedAt, locale)
    : `${entry.format.toUpperCase()} · ${formatLibrarySize(entry.size, locale)} · ${formatLibraryDate(entry.updatedAt, locale)}`;

  return (
    <div className="library-screen" onKeyDown={onRootKey}>
      <header className="lib-header" inert={blocked}>
        <button type="button" className="lib-icon-btn" title={t("action.back")} aria-label={t("action.back")} disabled={busy || loading} onClick={back}>
          <ArrowLeftIcon />
        </button>
        <div className="lib-titles">
          <h1>{exportsOpen ? libraryText(locale, "exports") : t("library.title")}</h1>
          <p>{exportsOpen ? libraryText(locale, "exportsSubtitle") : t("library.subtitle")}</p>
        </div>
        <button type="button" className="lib-icon-btn" title={t("library.close")} aria-label={t("library.close")} disabled={busy} onClick={onClose}>
          <CloseIcon />
        </button>
      </header>

      {exportsOpen ? (
        <ExportsView
          popup={exportPopup} setPopup={setExportPopup} busy={busy} runBusy={runBusy} inert={blocked}
          notify={(text) => setNotice({ text, error: false })}
        />
      ) : (
      <div className="lib-body" inert={blocked}>
        <DragRow as="nav" className="lib-crumbs" aria-label={t("library.rootFolder")}>
          <button type="button" className={folderId === ROOT_ID ? "current" : ""} disabled={busy || loading} onClick={() => goToFolder(ROOT_ID)}>
            {t("library.rootFolder")}
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="lib-crumb">
              <span aria-hidden="true">›</span>
              <button type="button" className={c.id === folderId ? "current" : ""} disabled={busy || loading} onClick={() => goToFolder(c.id)}>{c.name}</button>
            </span>
          ))}
        </DragRow>

        {IS_WEB_BUILD ? <p className="lib-web-note">{t("library.webNote")}</p> : null}

        <div className="lib-actions">
          {/* 單一檔案 = browser file picker (no folder info); 整個資料夾 keeps each file's path inside the folder and its
              drawings serve as external references (same-name files in the library are applied automatically). */}
          <button type="button" className="lib-primary" disabled={busy} onClick={() => addInput.current?.click()}>
            <ImportIcon /> <span className="lib-two-line">{t("library.addOneFileBtn")}</span>
          </button>
          {/* Where a folder cannot be picked (phones) the same button picks several files, so it says so (用戶指定). */}
          <button type="button" className="lib-primary" disabled={busy} onClick={pickFolder} title={t(noFolderPick ? "library.pickFilesTip" : "library.addFolderTip")}>
            <FolderOpenIcon /> <span className="lib-two-line">{t(noFolderPick ? "library.pickFilesBtn" : "library.addFolderBtn")}</span>
          </button>
          <button type="button" className="lib-secondary" disabled={busy} onClick={() => { setExportPopup(null); setExportsOpen(true); }}>
            <FolderCheckIcon /> <span>{libraryText(locale, "exports")}</span>
          </button>
          <input ref={addInput} type="file" multiple accept={FILE_ACCEPT} hidden onChange={(e) => onAddFiles(e.currentTarget.files)} />
          <input ref={folderInput} type="file" multiple hidden {...({ webkitdirectory: "" } as object)} aria-label={t("library.addFolder")}
            onChange={(e) => { const list = e.currentTarget.files ? Array.from(e.currentTarget.files) : []; e.currentTarget.value = ""; offerFolder(folderNameOf(list), list); }} />
          <input ref={pickInput} type="file" multiple accept={FILE_ACCEPT} hidden aria-label={t("library.pickFilesLabel")}
            onChange={(e) => { const list = e.currentTarget.files ? Array.from(e.currentTarget.files) : []; e.currentTarget.value = ""; offerPicked(list); }} />
          <input ref={replaceInput} type="file" hidden aria-label={t("library.replacePickerLabel")} onChange={(e) => onReplaceFile(e.currentTarget.files)} />
        </div>

        {showRecent ? (
          <section className="lib-recent">
            <h2>{t("library.recent")}</h2>
            <RecentCarousel count={recent.length} label={libraryText(locale, "recentPages")} pageLabel={(n) => libraryText(locale, "page", { n })}>
              {recent.map((r) => (
                <button key={r.id} type="button" className="recent-card" disabled={busy} onClick={() => openEntry(r)}>
                  <span className="recent-badge">{r.format.toUpperCase()}</span>
                  <MarqueeText text={r.name} />
                  <span className="recent-size">{formatLibrarySize(r.size, locale)}</span>
                </button>
              ))}
            </RecentCarousel>
          </section>
        ) : null}

        <div className="lib-filter">
          <h2>{t("library.filesAndFolders")}</h2>
          <div className="lib-filter-row">
            <input
              type="search" value={searchText} placeholder={t("library.search")} aria-label={t("library.search")}
              onChange={(e) => setSearchText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && searchText) {
                  e.stopPropagation();
                  e.preventDefault();
                  setSearchText("");
                }
              }}
            />
            <select value={sortMode} aria-label={t("library.sort")} onChange={(e) => setSortMode(e.currentTarget.value as LibrarySort)}>
              <option value="name">{t("library.sortName")}</option>
              <option value="newest">{t("library.sortNewest")}</option>
              <option value="largest">{t("library.sortLargest")}</option>
            </select>
          </div>
        </div>

        {selecting ? (
          <div className="export-selection lib-selection" role="toolbar" aria-label={t("library.selection")}>
            <strong role="status">{t("library.selectedCount", { N: selected.size })}</strong>
            <button type="button" disabled={busy} onClick={() => setSelected(new Set(visible.map((e) => e.id)))}>{t("library.selectAll")}</button>
            <button type="button" disabled={busy} onClick={() => setSelected(new Set())}>{t("library.selectNone")}</button>
            <button type="button" disabled={busy || !selected.size} onClick={() => setDeleteIds([...selected])}>{t("action.delete")}</button>
            <button type="button" disabled={busy} onClick={exitSelection}>{t("library.exitSelection")}</button>
          </div>
        ) : null}
        <div className="lib-list" aria-busy={loading}
          onPointerDownCapture={() => { suppressClick.current = false; }}
          onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; cancelPress(); } }}>
          {loading ? (
            <div className="lib-skeleton" aria-label={t("load.opening")}><span /><span /><span /></div>
          ) : visible.length === 0 && searchText.trim() !== "" ? (
            <div className="lib-empty">
              <FolderIcon />
              <strong>{t("library.noResults")}</strong>
              <button type="button" className="lib-secondary" onClick={() => setSearchText("")}>{t("library.clearSearch")}</button>
            </div>
          ) : visible.length === 0 ? (
            <div className="lib-empty">
              <FolderIcon />
              <strong>{t("library.emptyTitle")}</strong>
              <p>{t("library.emptyBody")}</p>
            </div>
          ) : (
            <ul>
              {visible.map((entry) => (
                <li key={entry.id} className={`lib-row ${entry.kind}`} data-selected={selecting && selected.has(entry.id)}>
                  {selecting ? (
                    <input className="lib-row-check" type="checkbox" aria-label={`${t("library.select")} ${entry.name}`}
                      checked={selected.has(entry.id)} disabled={busy} onChange={() => toggleSelected(entry.id)} />
                  ) : null}
                  <button type="button" className="lib-row-main" disabled={busy} onClick={() => rowClick(entry)}
                    onPointerDown={(e) => rowDown(entry, e)} onPointerMove={rowMove} onPointerCancel={rowMove}
                    onContextMenu={(e) => { if (press.current) e.preventDefault(); }}>
                    <span className="lib-row-icon">{entry.kind === "folder" ? <FolderIcon /> : <FileIcon />}</span>
                    <span className="lib-row-text">
                      <MarqueeText text={entry.name} />
                      <small>{describe(entry)}</small>
                    </span>
                    {entry.kind === "folder" ? <ChevronRightIcon className="lib-row-chevron" /> : null}
                  </button>
                  {selecting ? null : <button
                    type="button" className="lib-icon-btn lib-more" title={t("library.itemActions")}
                    aria-label={`${t("library.itemActions")}: ${entry.name}`} disabled={busy}
                    onClick={() => setPopup({ kind: "actions", entry })}
                  >
                    <MoreIcon />
                  </button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      )}

      {popup?.kind === "actions" ? (
        <ActionSheet
          entry={popup.entry}
          onCancel={() => setPopup(null)}
          onReplace={() => {
            replaceTarget.current = popup.entry as LibraryDrawingEntry;
            replaceInput.current?.click();
          }}
          onPick={(kind) => setPopup(kind === "rename" ? { kind: "text", mode: "rename", entry: popup.entry }
            : kind === "delete" ? { kind: "delete", entry: popup.entry } : { kind: "destination", mode: kind, entry: popup.entry })}
        />
      ) : null}

      {popup?.kind === "text" ? (
        <TextDialog
          mode={popup.mode}
          initial={popup.entry?.name ?? ""}
          onCancel={() => setPopup(null)}
          onConfirm={(name) => {
            const target = popup;
            setPopup(null);
            void runBusy(async () => {
              if (target.mode === "create") {
                await createLibraryFolder(folderId, name);
                setNotice({ text: t("library.toast.folderCreated"), error: false });
              } else if (target.entry) {
                await renameLibraryEntry(target.entry.id, name);
                setNotice({ text: t("library.toast.renamed"), error: false });
              }
              refresh();
            });
          }}
        />
      ) : null}

      {popup?.kind === "destination" ? (
        <DestinationDialog
          entry={popup.entry}
          folders={folders}
          onCancel={() => setPopup(null)}
          onPick={(destination) => {
            const target = popup;
            setPopup(null);
            void runBusy(async () => {
              if (target.mode === "copy") await copyLibraryEntry(target.entry.id, destination);
              else await moveLibraryEntry(target.entry.id, destination);
              setNotice({ text: t(target.mode === "copy" ? "library.toast.copied" : "library.toast.moved"), error: false });
              refresh();
            });
          }}
        />
      ) : null}

      {popup?.kind === "delete" ? (
        <Dialog className="lib-dialog" role="alertdialog" label={t("library.deleteTitle")} onCancel={() => setPopup(null)}>
          <h3>{t("library.deleteTitle")}</h3>
          <p>{t(popup.entry.kind === "folder" ? "library.deleteFolderBody" : "library.deleteDrawingBody")}</p>
          <div className="lib-dialog-buttons">
            <button type="button" className="lib-secondary" onClick={() => setPopup(null)}>{t("action.cancel")}</button>
            <button
              type="button" className="lib-danger"
              onClick={() => {
                const target = popup.entry;
                setPopup(null);
                void runBusy(async () => {
                  await deleteLibraryEntry(target.id);
                  setNotice({ text: t("library.toast.deleted"), error: false });
                  refresh();
                });
              }}
            >
              {t("action.delete")}
            </button>
          </div>
        </Dialog>
      ) : null}

      {deleteIds ? (() => {
        const folderCount = children.filter((e) => e.kind === "folder" && deleteIds.includes(e.id)).length;
        return (
          <Dialog className="lib-dialog" role="alertdialog" label={t("library.deleteSelectedTitle")} onCancel={() => setDeleteIds(null)}>
            <h3>{t("library.deleteSelectedTitle")}</h3>
            <p>{t("library.deleteSelectedBody", { N: deleteIds.length })}{folderCount ? ` ${t("library.deleteSelectedFolders", { N: folderCount })}` : ""}</p>
            <div className="lib-dialog-buttons">
              <button type="button" className="lib-secondary" onClick={() => setDeleteIds(null)}>{t("action.cancel")}</button>
              <button
                type="button" className="lib-danger" disabled={busy}
                onClick={() => {
                  const ids = deleteIds;
                  setDeleteIds(null);
                  void runBusy(async () => {
                    try { for (const id of ids) await deleteLibraryEntry(id); }
                    finally { exitSelection(); refresh(); }
                    setNotice({ text: t("library.toast.deletedN", { N: ids.length }), error: false });
                  });
                }}
              >
                {t("library.confirmDelete")}
              </button>
            </div>
          </Dialog>
        );
      })() : null}

      {archive ? (
        <ArchiveDialog
          state={archive}
          onCancel={cancelArchive}
          onToggle={(path, on) => setArchive((a) => {
            if (!a) return a;
            const checked = new Set(a.checked);
            if (on) checked.add(path);
            else checked.delete(path);
            return { ...a, checked };
          })}
          onAll={(on) => setArchive((a) => (a ? { ...a, checked: new Set(on ? a.items.filter((i) => i.supported).map((i) => i.path) : []) } : a))}
          onExtract={() => void extractArchive()}
        />
      ) : null}

      {pickOffer ? (() => {
        const count = pickOffer.on.filter(Boolean).length;
        const bytes = pickOffer.items.reduce((n, item, i) => n + (pickOffer.on[i] ? item.file.size : 0), 0);
        const all = count === pickOffer.items.length;
        return (
          <Dialog className="lib-dialog lib-pick" label={t("library.pickFilesLabel")} onCancel={() => setPickOffer(null)}>
            <h3>{t("library.pickTitle")}</h3>
            <p>{t("library.pickBody", { name: pickOffer.name })}</p>
            <label className="lib-pick-all">
              <input type="checkbox" checked={all} onChange={() => setPickOffer({ ...pickOffer, on: pickOffer.items.map(() => !all) })} />
              <span>{t("library.pickCount", { n: count, total: pickOffer.items.length, size: formatLibrarySize(bytes, locale) })}</span>
            </label>
            <ul className="lib-pick-list">
              {pickOffer.items.map((item, i) => (
                <li key={i}><label>
                  <input type="checkbox" checked={pickOffer.on[i]} onChange={() => setPickOffer({ ...pickOffer, on: pickOffer.on.map((v, k) => (k === i ? !v : v)) })} />
                  <span className="lib-pick-name">{item.file.name}</span>
                  <small>{formatLibrarySize(item.file.size, locale)}</small>
                </label></li>
              ))}
            </ul>
            <div className="lib-dialog-buttons">
              <button type="button" className="lib-secondary" onClick={() => setPickOffer(null)}>{t("action.cancel")}</button>
              <button type="button" className="lib-primary" disabled={!count} onClick={() => importPicked(pickOffer)}>{t("library.pickOk", { n: count })}</button>
            </div>
          </Dialog>
        );
      })() : null}
      {folderOffer ? (
        <Dialog className="lib-dialog" label={t("library.addFolder")} onCancel={() => setFolderOffer(null)}>
          <h3>{t("library.folderConfirmTitle", { name: folderOffer.name })}</h3>
          <p>{t("library.folderConfirmBody", { n: folderOffer.items.length, size: formatLibrarySize(folderOffer.bytes, locale) })}</p>
          <div className="lib-dialog-buttons">
            <button type="button" className="lib-secondary" onClick={() => setFolderOffer(null)}>{t("action.cancel")}</button>
            <button type="button" className="lib-primary" onClick={() => importFolder(folderOffer)}>{t("library.folderConfirmOk")}</button>
          </div>
        </Dialog>
      ) : null}
      {notice ? (
        <div className={notice.error ? "lib-toast error" : "lib-toast"} role={notice.error ? "alert" : "status"} onClick={() => setNotice(null)}>
          {notice.text}
        </div>
      ) : null}

      {busy && !importConflict ? <div className="lib-busy" aria-hidden="true"><span className="lib-spinner" /></div> : null}
      {importConflict ? <ImportVersionDialog conflict={importConflict} onChoose={chooseImport} /> : null}
    </div>
  );
}

function ActionSheet({ entry, onCancel, onReplace, onPick }: {
  entry: LibraryEntry; onCancel(): void; onReplace(): void; onPick(kind: "rename" | "delete"): void;
}) {
  const { t } = useI18n();
  const canReplace = entry.kind === "drawing" && !isArchiveFormat(entry.format);
  // 複製／移動 removed (user request): a drawing sheet only renames or deletes.
  const tiles: { kind: "rename" | "delete"; icon: ReactNode; label: string }[] = [
    { kind: "rename", icon: <RenameIcon />, label: t("action.rename") },
    { kind: "delete", icon: <TrashIcon />, label: t("action.delete") },
  ];
  return (
    <Dialog className="lib-sheet" label={entry.name} onCancel={onCancel}>
      <span className="lib-sheet-handle" aria-hidden="true" />
      <h3>{entry.name}</h3>
      {canReplace ? (
        <div className="lib-replace">
          <p>{t("library.snapshotNote")}</p>
          <button type="button" className="lib-secondary" onClick={onReplace}>{t("library.replace")}</button>
          <p>{t("library.replaceNote")}</p>
        </div>
      ) : null}
      <div className="lib-sheet-tiles two">
        {tiles.map((tile) => (
          <button key={tile.kind} type="button" className={tile.kind === "delete" ? "lib-tile danger" : "lib-tile"} onClick={() => onPick(tile.kind)}>
            {tile.icon}
            <span>{tile.label}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function TextDialog({ mode, initial, onCancel, onConfirm }: { mode: "create" | "rename"; initial: string; onCancel(): void; onConfirm(name: string): void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const title = mode === "create" ? t("library.newFolder") : t("action.rename");
  const label = mode === "create" ? t("library.folderName") : t("action.rename");
  const ok = value.trim() !== "";
  return (
    <Dialog className="lib-dialog" label={title} onCancel={onCancel}>
      <h3>{title}</h3>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onConfirm(value); }}>
        <label className="lib-field">
          <span>{label}</span>
          <input value={value} maxLength={MAX_NAME_LENGTH} onChange={(e) => setValue(e.currentTarget.value)} />
        </label>
        <div className="lib-dialog-buttons">
          <button type="button" className="lib-secondary" onClick={onCancel}>{t("action.cancel")}</button>
          <button type="submit" className="lib-primary" disabled={!ok}>{mode === "create" ? t("action.create") : t("action.save")}</button>
        </div>
      </form>
    </Dialog>
  );
}

function DestinationDialog({ entry, folders, onCancel, onPick }: {
  entry: LibraryEntry; folders: LibraryFolderEntry[]; onCancel(): void; onPick(id: string): void;
}) {
  const { t } = useI18n();
  const root = t("library.rootFolder");
  const byId = new Map(folders.map((f) => [f.id, f]));
  const pathOf = (f: LibraryFolderEntry) => {
    const parts: string[] = [];
    let cur: LibraryFolderEntry | undefined = f;
    for (let guard = 0; cur && guard < 1000; guard++) {
      parts.unshift(cur.name);
      cur = byId.get(cur.parentId);
    }
    return [root, ...parts].join(" / ");
  };
  // A folder can't go into itself or anything below it.
  const blocked = (f: LibraryFolderEntry) => {
    if (entry.kind !== "folder") return false;
    let cur: LibraryFolderEntry | undefined = f;
    for (let guard = 0; cur && guard < 1000; guard++) {
      if (cur.id === entry.id) return true;
      cur = byId.get(cur.parentId);
    }
    return false;
  };
  return (
    <Dialog className="lib-dialog lib-destination" label={t("library.chooseDestination")} onCancel={onCancel}>
      <h3>{t("library.chooseDestination")}</h3>
      <ul className="lib-destinations">
        <li><button type="button" onClick={() => onPick(ROOT_ID)}>{root}</button></li>
        {folders.map((f) => (
          <li key={f.id}><button type="button" disabled={blocked(f)} onClick={() => onPick(f.id)}>{pathOf(f)}</button></li>
        ))}
      </ul>
      <div className="lib-dialog-buttons">
        <button type="button" className="lib-secondary" onClick={onCancel}>{t("action.cancel")}</button>
      </div>
    </Dialog>
  );
}

function ArchiveDialog({ state, onCancel, onToggle, onAll, onExtract }: {
  state: ArchiveState; onCancel(): void; onToggle(path: string, on: boolean): void; onAll(on: boolean): void; onExtract(): void;
}) {
  const { locale, t } = useI18n();
  const extracting = state.phase === "extracting";
  const supported = state.items.some((i) => i.supported);
  const listed = state.items.length > 0;
  return (
    <Dialog className="lib-dialog lib-archive" label={t("archive.title")} onCancel={onCancel}>
      <h3>{t("archive.title")}</h3>
      <strong className="lib-archive-name">{state.name}</strong>
      <p>{t("archive.body")}</p>
      {state.phase === "loading" ? <p className="lib-status" role="status">{t("archive.loading")}</p> : null}
      {extracting ? <p className="lib-status" role="status">{t("archive.importing")} {state.progress}%</p> : null}
      {state.error ? <p className="lib-error" role="alert">{state.error}</p> : null}
      {listed && !supported && state.phase !== "loading" ? <p className="lib-status">{t("archive.noneSupported")}</p> : null}
      {listed && state.phase !== "loading" ? (
        <>
          {state.phase !== "error" ? (
            <div className="lib-archive-tools">
              <button type="button" className="lib-small" disabled={extracting || !supported} onClick={() => onAll(true)}>{t("archive.selectAll")}</button>
              <button type="button" className="lib-small" disabled={extracting || !supported} onClick={() => onAll(false)}>{t("archive.selectNone")}</button>
            </div>
          ) : null}
          <ul className="lib-archive-items">
            {state.items.map((item) => (
              <li key={item.path} className={item.supported ? "" : "unsupported"}>
                <label>
                  <input
                    type="checkbox" checked={state.checked.has(item.path)} disabled={!item.supported || extracting || state.phase === "error"}
                    onChange={(e) => onToggle(item.path, e.currentTarget.checked)}
                  />
                  <span className="lib-archive-path">{item.directory ? `${item.path}/` : item.path}</span>
                  <small>
                    {item.directory
                      ? libraryText(locale, "archiveFolder")
                      : `${formatLibrarySize(item.size, locale)}${item.supported ? "" : ` · ${t("archive.unsupportedEntry")}`}`}
                  </small>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="lib-dialog-buttons">
        <button type="button" className="lib-secondary" onClick={onCancel}>{t("action.cancel")}</button>
        <button type="button" className="lib-primary" disabled={state.phase !== "ready" || state.checked.size === 0} onClick={onExtract}>
          {t("archive.extract")} ({state.checked.size})
        </button>
      </div>
    </Dialog>
  );
}

/** Format of a picked file, used by the App to decide whether it goes to the library as an archive. */
export function isArchiveFile(file: File): boolean {
  const format = detectDrawingFormat(file.name);
  return format !== null && isArchiveFormat(format);
}
