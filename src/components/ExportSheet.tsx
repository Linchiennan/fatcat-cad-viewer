// Export dialog (bottom sheet), 框選 drag layer, progress and the "saved" note (spec 005). Owner: P4 group D.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n, type TranslationKey } from "../i18n/translations";
import { normaliseBox, type ExportChoice, type ExportFormat, type ExportRange, type PaperSize, type ScreenBox } from "../app/exportFlow";
import { CheckIcon, CloseIcon, ExportIcon, FitIcon, RectIcon, SheetsIcon, ShareIcon, FileIcon } from "./Icons";

function Choice<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; Icon?: typeof FitIcon }[]; onChange(v: T): void;
}) {
  return (
    <fieldset className="export-group">
      <legend>{label}</legend>
      <div className="export-options" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`export-option${value === o.value ? " is-on" : ""}`}
            onClick={() => onChange(o.value)}>
            {o.Icon ? <o.Icon /> : null}<span>{o.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Range / format / paper; the last choice is remembered by the App. */
export function ExportSheet({ choice, onChange, onExport, onClose }: {
  choice: ExportChoice; onChange(next: ExportChoice): void; onExport(): void; onClose(): void;
}) {
  const { t } = useI18n();
  const ranges: { value: ExportRange; label: string; Icon: typeof FitIcon }[] = [
    { value: "view", label: t("export.range.view"), Icon: FitIcon },
    { value: "sheet", label: t("export.range.sheet"), Icon: SheetsIcon },
    { value: "box", label: t("export.range.box"), Icon: RectIcon },
  ];
  return (
    <section className="export-sheet" role="dialog" aria-label={t("export.title")}>
      <header><strong>{t("export.title")}</strong>
        <button type="button" className="export-close" aria-label={t("export.close")} onClick={onClose}><CloseIcon /></button>
      </header>
      <Choice label={t("export.range")} value={choice.range} options={ranges} onChange={(range) => onChange({ ...choice, range })} />
      <Choice<ExportFormat> label={t("export.format")} value={choice.format}
        options={[{ value: "png", label: "PNG" }, { value: "pdf", label: "PDF" }]} onChange={(format) => onChange({ ...choice, format })} />
      {choice.format === "pdf" ? (
        <>
          <Choice<PaperSize> label={t("export.paper")} value={choice.paper}
            options={[{ value: "A4", label: "A4" }, { value: "A3", label: "A3" }]} onChange={(paper) => onChange({ ...choice, paper })} />
          <p className="export-note">{t("export.paperNote")}</p>
        </>
      ) : null}
      <p className="export-note">{t("export.markNote")}</p>
      <button type="button" className="primary-btn export-go" onClick={onExport}><ExportIcon />{choice.range === "box" ? t("export.range.box") : t("export.go")}</button>
    </section>
  );
}

/** 框選: drag a dashed box over the drawing, then confirm (or select again / cancel). */
export function ExportBoxLayer({ onConfirm, onCancel }: { onConfirm(box: ScreenBox): void; onCancel(): void }) {
  const { t } = useI18n();
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [drag, setDrag] = useState<ScreenBox | null>(null);
  const [box, setBox] = useState<ScreenBox | null>(null);
  const local = (e: ReactPointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (box) return;
    const p = local(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { ...p, id: e.pointerId };
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const p = local(e);
    setDrag({ x0: Math.min(s.x, p.x), y0: Math.min(s.y, p.y), x1: Math.max(s.x, p.x), y1: Math.max(s.y, p.y) });
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const p = local(e);
    setBox(normaliseBox(s.x, s.y, p.x, p.y));
    setDrag(null);
  };
  const shown = box ?? drag;
  return (
    <div className="export-box-layer" role="application" aria-label={t("export.boxLabel")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {shown ? <div className="export-box" style={{ left: shown.x0, top: shown.y0, width: shown.x1 - shown.x0, height: shown.y1 - shown.y0 }} /> : null}
      <div className="export-box-bar" onPointerDown={(e) => e.stopPropagation()}>
        {box ? (
          <>
            <button type="button" className="primary-btn" onClick={() => onConfirm(box)}><CheckIcon />{t("export.boxConfirm")}</button>
            <button type="button" className="secondary-btn" onClick={() => setBox(null)}>{t("export.boxRedo")}</button>
          </>
        ) : <p>{t("export.boxHint")}</p>}
        <button type="button" className="secondary-btn" onClick={onCancel}>{t("export.cancel")}</button>
      </div>
    </div>
  );
}

export type ExportNoteState =
  | { kind: "working" }
  | { kind: "done"; name: string; saved: boolean; downscaled?: { w: number; h: number; dpi: number } }
  | { kind: "error"; key: TranslationKey; reason: string };

/** Progress while exporting; afterwards "已儲存" with 分享／打開 (and the lower-resolution note). */
export function ExportNote({ note, onShare, onOpen, onClose }: { note: ExportNoteState; onShare(): void; onOpen(): void; onClose(): void }) {
  const { t } = useI18n();
  if (note.kind === "working") {
    return (
      <div className="export-note-box" role="status" aria-live="polite">
        <p>{t("export.working")}</p>
        <div className="loading-bar is-unknown export-progress" role="progressbar" aria-label={t("export.working")}><span /></div>
      </div>
    );
  }
  if (note.kind === "error") {
    return (
      <div className="export-note-box is-error" role="alert">
        <p>{t(note.key, { reason: note.reason })}</p>
        <button type="button" className="export-close" aria-label={t("export.closeNote")} onClick={onClose}><CloseIcon /></button>
      </div>
    );
  }
  return (
    <div className="export-note-box" role="status">
      <p><strong>{note.saved ? t("export.saved", { name: note.name }) : t("export.savedNoLibrary", { name: note.name })}</strong></p>
      {note.downscaled ? <p className="export-note">{t("export.downscaled", note.downscaled)}</p> : null}
      <div className="export-actions">
        <button type="button" className="secondary-btn" onClick={onShare}><ShareIcon />{t("export.share")}</button>
        <button type="button" className="secondary-btn" onClick={onOpen}><FileIcon />{t("export.open")}</button>
        <button type="button" className="export-close" aria-label={t("export.closeNote")} onClick={onClose}><CloseIcon /></button>
      </div>
    </div>
  );
}
