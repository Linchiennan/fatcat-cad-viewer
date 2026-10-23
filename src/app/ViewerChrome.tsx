// Top of the viewing screen (T10 2.4): the file name bar, the full-name card and the drawing check strip
// (模型/配置▾｜圖層｜缺件｜外參). Owner: P4 group D.
import { MODEL_SPACE, type CadSpace } from "../types/drawing";
import { useI18n } from "../i18n/translations";
import { CloseIcon, ExportIcon, FolderOpenIcon, SheetsIcon } from "../components/Icons";
import { IconTile } from "../components/IconTile";
import { formatBadge, formatFileSize } from "./shellText";

export function FileBar({ name, size, cardOpen, onCard, onLibrary, onClose, onExport }: {
  name: string;
  size: number;
  cardOpen: boolean;
  onCard(open: boolean): void;
  onLibrary(): void;
  onClose(): void;
  /** 輸出 PNG／PDF (CAD drawings only). */
  onExport?(): void;
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
        {onExport ? (
          <IconTile name={t("export.button")} label={t("export.buttonShort")} tip={t("export.buttonTip")} className="icon-tile file-export" onClick={onExport}><ExportIcon /></IconTile>
        ) : null}
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

export function CheckStrip({ spaces, space, switching, missing, xrefsUnloaded, onSpace, onTab }: {
  spaces: CadSpace[];
  space: string;
  switching: boolean;
  missing: number;
  xrefsUnloaded: number;
  onSpace(name: string): void;
  onTab(tab: StripTab): void;
}) {
  const { t } = useI18n();
  const ordered = [...spaces].sort((a, b) => (a.name === MODEL_SPACE ? -1 : b.name === MODEL_SPACE ? 1 : a.order - b.order));
  const caption = switching ? t("viewer.spaceSwitching") : space === MODEL_SPACE ? t("viewer.spaceModel") : space;
  return (
    <nav className="check-strip" aria-label={t("viewer.checkStripLabel")} data-fit="corner">
      {spaces.length > 1 ? (
        <label className={`space-switch${switching ? " is-busy" : ""}`} title={t("viewer.spaceTitle")}>
          <SheetsIcon /><span className="space-name">{caption}</span><span className="space-caret" aria-hidden="true">▾</span>
          <select aria-label={t("viewer.spaceSelectLabel")} value={space} disabled={switching} onChange={(e) => onSpace(e.target.value)}>
            {ordered.map((s) => (
              <option key={s.name} value={s.name}>{s.name === MODEL_SPACE ? t("viewer.spaceModelOption") : s.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="button" onClick={() => onTab("layers")}>{t("viewer.stripLayers")}</button>
      <button type="button" aria-label={missing > 0 ? `${t("viewer.stripMissing")}, ${t("viewer.missingCount", { N: missing })}` : undefined} onClick={() => onTab("missing")}>
        {t("viewer.stripMissing")}{missing > 0 ? <em>{t("viewer.stripWarn", { N: missing })}</em> : null}
      </button>
      <button type="button" aria-label={xrefsUnloaded > 0 ? `${t("viewer.stripXrefs")}, ${t("viewer.xrefUnloadedCount", { N: xrefsUnloaded })}` : undefined} onClick={() => onTab("xrefs")}>
        {t("viewer.stripXrefs")}{xrefsUnloaded > 0 ? <em>{t("viewer.stripWarn", { N: xrefsUnloaded })}</em> : null}
      </button>
    </nav>
  );
}
