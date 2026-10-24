// Top of the viewing screen (T10 2.4): the file name bar, the full-name card and the drawing check strip
// (模型/配置▾｜圖層｜分享). Owner: P4 group D.
import { MODEL_SPACE, type CadSpace } from "../types/drawing";
import { useI18n } from "../i18n/translations";
import { CloseIcon, FolderOpenIcon, SheetsIcon } from "../components/Icons";
import { formatFileSize } from "./shellText";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fileSource, resolveFileSource, type FileSource } from "../files/fileSource";

function FileMarquee({text, className}: {text:string; className:string}) {
  const viewport = useRef<HTMLSpanElement>(null), content = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    let active = true;
    const measure = () => {
      if (active && viewport.current && content.current) setDistance(Math.max(0, content.current.scrollWidth - viewport.current.clientWidth));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (viewport.current) observer?.observe(viewport.current);
    if (content.current) observer?.observe(content.current);
    void document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => { active=false; observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [text]);
  return <span ref={viewport} className={`file-scroll ${className}`} data-overflow={distance > 1} tabIndex={distance > 1 ? 0 : undefined}
    title={text} style={{'--file-travel':`${-distance}px`, '--file-duration':`${Math.max(4, distance / 32 + 3)}s`} as CSSProperties}>
    <span ref={content} className="file-scroll-content">{text}</span>
  </span>;
}

export function FileBar({ name, size, source, file, entryId, cardOpen, onCard, onLibrary, onClose }: {
  name: string;
  source?: string;
  file?: File;
  entryId?: string;
  size: number;
  cardOpen: boolean;
  onCard(open: boolean): void;
  onLibrary(): void;
  onClose(): void;
}) {
  const { t, locale } = useI18n();
  const [origin, setOrigin] = useState<FileSource>({kind:'import', path:''});
  useEffect(() => {
    let active = true;
    setOrigin(file ? fileSource(file) : {kind:'import', path:''});
    if (file) void resolveFileSource(file, entryId).then(value => { if (active) setOrigin(value); });
    return () => { active = false; };
  }, [file, entryId]);
  const sourceText = source || (origin.kind === 'library' ? `${locale === 'en' ? 'Library' : '圖庫'} / ${origin.path}` : origin.path)
    || (locale === 'en' ? 'Imported file (full path unavailable)' : '匯入檔案（未提供完整路徑）');
  return (
    <header className={`file-bar${cardOpen ? " card-open" : ""}`} data-fit="top">

      <button type="button" className="file-name" aria-label={t("viewer.fullNameLabel")} aria-expanded={cardOpen} onClick={() => onCard(!cardOpen)}>
        <FileMarquee text={name} className="file-title" />
        <FileMarquee text={sourceText} className="file-source" />
        <small>{t("viewer.fileSizeLine", { size: formatFileSize(size, locale) })}</small>
      </button>
      <div className="file-actions">
        <button type="button" className="file-library" aria-label={t("viewer.libraryButton")} onClick={onLibrary}>
          <FolderOpenIcon /><span>{t("viewer.libraryButton")}</span>
        </button>
        <button type="button" className="file-close" aria-label={t("viewer.close")} title={t("viewer.close")} onClick={onClose}><CloseIcon /></button>
      </div>
      {cardOpen ? (
        <div className="name-card" role="note" aria-label={t("viewer.fullNameLabel")} onClick={() => onCard(false)}>
          <strong>{name}</strong>
          <button type="button" aria-label={t("viewer.closeFullName")} onClick={(e) => { e.stopPropagation(); onCard(false); }}><CloseIcon /></button>
        </div>
      ) : null}
    </header>
  );
}

export type StripTab = "layers" | "missing" | "xrefs";

export function CheckStrip({ spaces, space, switching, onSpace, onTab, onExport }: {
  spaces: CadSpace[];
  space: string;
  switching: boolean;
  missing: number;
  xrefsUnloaded: number;
  onSpace(name: string): void;
  onTab(tab: StripTab): void;
  onExport?(): void;
}) {
  const { t } = useI18n();
  const ordered = [...(spaces.length ? spaces : [{ name: MODEL_SPACE, order: 0 }])].sort((a, b) => (a.name === MODEL_SPACE ? -1 : b.name === MODEL_SPACE ? 1 : a.order - b.order));
  const caption = switching ? t("viewer.spaceSwitching") : space === MODEL_SPACE ? t("viewer.spaceModel") : space;
  return (
    <nav className="check-strip" aria-label={t("viewer.checkStripLabel")} data-fit="corner">
      <div className="check-strip-page" data-check-page="1">
        <label className={`space-switch${switching ? " is-busy" : ""}`} title={t("viewer.spaceTitle")}>
          <SheetsIcon /><span className="space-name">{caption}</span><span className="space-caret" aria-hidden="true">▾</span>
          <select aria-label={t("viewer.spaceSelectLabel")} value={space} disabled={switching} onChange={(e) => onSpace(e.target.value)}
            onMouseDown={e => { if (typeof e.currentTarget.showPicker === "function") e.preventDefault(); }}
            onClick={e => { e.currentTarget.focus(); e.currentTarget.showPicker?.(); }}>
            {ordered.map((s) => <option key={s.name} value={s.name}>{s.name === MODEL_SPACE ? t("viewer.spaceModelOption") : s.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onTab("layers")}>{t("viewer.stripLayers")}</button>
        {onExport ? <button type="button" className="strip-export" aria-label={t("markup.share")} title={t("export.buttonTip")} onClick={onExport}>{t("markup.share")}</button> : null}
      </div>
    </nav>
  );
}
