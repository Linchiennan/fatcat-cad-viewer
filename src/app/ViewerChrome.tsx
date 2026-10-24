// Top of the viewing screen (T10 2.4): the file name bar, the full-name card and the drawing check strip
// (模型/配置▾｜圖層｜分享). Owner: P4 group D.
import { MODEL_SPACE, type CadSpace } from "../types/drawing";
import { useI18n } from "../i18n/translations";
import { CloseIcon, FolderOpenIcon, SheetsIcon } from "../components/Icons";
import { formatBadge, formatFileSize } from "./shellText";

export function FileBar({ name, size, cardOpen, onCard, onLibrary, onClose }: {
  name: string;
  size: number;
  cardOpen: boolean;
  onCard(open: boolean): void;
  onLibrary(): void;
  onClose(): void;
}) {
  const { t, locale } = useI18n();
  const badge = formatBadge(name);
  return (
    <header className={`file-bar${cardOpen ? " card-open" : ""}`} data-fit="top">
      {badge ? <span className="format-badge">{badge}</span> : null}
      <button type="button" className="file-name" aria-label={t("viewer.fullNameLabel")} aria-expanded={cardOpen} onClick={() => onCard(!cardOpen)}>
        <strong>{name}</strong>
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
