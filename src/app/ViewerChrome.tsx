// Top of the viewing screen (T10 2.4): the file name bar, the full-name card and the drawing check strip
// (模型/配置▾｜圖層｜分享). Owner: P4 group D.
import { libraryText } from "../library/libraryText";
import { Capacitor } from "@capacitor/core";
import { MODEL_SPACE, type CadSpace } from "../types/drawing";
import { useI18n } from "../i18n/translations";
import { CloseIcon, FolderOpenIcon, SheetsIcon } from "../components/Icons";
import { formatFileSize } from "./shellText";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { fileSource, resolveFileSource, safeSourcePath, type FileSource } from "../files/fileSource";

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
  const sourceText = safeSourcePath(source || '') || origin.path
    // A browser never tells a page where a picked file lives (only the Android app gets the location).
    || (Capacitor.isNativePlatform()
      ? (locale === 'en' ? 'Original source path not provided' : '原始來源路徑未提供')
      : (locale === 'en' ? 'Not provided by the browser' : '瀏覽器不提供'));
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

export function CheckStrip({ spaces, space, switching, missing, xrefsUnloaded, onSpace, onTab, onExport, onInspect }: {
  spaces: CadSpace[];
  space: string;
  switching: boolean;
  missing: number;
  xrefsUnloaded: number;
  onSpace(name: string): void;
  onTab(tab: StripTab): void;
  onExport?(): void;
  onInspect?(): void;
}) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(0);
  const [offset, setOffset] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; dx: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  const goTo = (next: number) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && viewport.current?.contains(active)) active.blur();
    setOffset(0);
    setPage(Math.max(0, Math.min(1, next)));
  };
  // A horizontal trackpad gesture is one page, including its momentum tail.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let total = 0, last = 0, switched = false;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault(); e.stopPropagation();
      const now = performance.now();
      if (now - last > 180) { total = 0; switched = false; }
      last = now;
      total += e.deltaX * (e.deltaMode === 1 ? 16 : 1);
      if (!switched && Math.abs(total) >= 24) {
        switched = true;
        setPage(p => Math.max(0, Math.min(1, p + Math.sign(total))));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const finish = (e: PointerEvent<HTMLDivElement>, cancel = false) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.dragged) {
      suppressClick.current = true;
      e.preventDefault(); e.stopPropagation();
      goTo(cancel || Math.abs(g.dx) < 32 ? page : page + (g.dx < 0 ? 1 : -1));
    }
    setOffset(0);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const ordered = [...(spaces.length ? spaces : [{ name: MODEL_SPACE, order: 0 }])].sort((a, b) => (a.name === MODEL_SPACE ? -1 : b.name === MODEL_SPACE ? 1 : a.order - b.order));
  const caption = switching ? t("viewer.spaceSwitching") : space === MODEL_SPACE ? t("viewer.spaceModel") : space;
  return (
    <nav className="check-strip" aria-label={t("viewer.checkStripLabel")} data-fit="corner" data-strip-page={page} data-dragging={offset !== 0 || undefined}>
      <div className="check-strip-viewport" ref={viewport}
        onPointerDownCapture={e => {
          // Left button / finger as before; the mouse's middle button drags pages too (no auto-scroll circle).
          const middle = e.pointerType === "mouse" && e.button === 1;
          if (!e.isPrimary || (e.button !== 0 && !middle)) return;
          if (middle) e.preventDefault();
          suppressClick.current = false;
          gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dragged: false };
        }}
        onPointerMove={e => {
          const g = gesture.current;
          if (!g || g.id !== e.pointerId) return;
          const dx = e.clientX - g.x;
          if (!g.dragged && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - g.y))) return;
          g.dragged = true; g.dx = dx;
          suppressClick.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault(); e.stopPropagation();
          const width = e.currentTarget.clientWidth;
          setOffset(Math.max(-width * (1 - page), Math.min(width * page, dx)));
        }}
        onPointerUp={e => finish(e)} onPointerCancel={e => finish(e, true)}
        onLostPointerCapture={e => { if (e.target === e.currentTarget && gesture.current) finish(e, true); }}
        onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); } }}
        onMouseDown={e => { if (e.button === 1) e.preventDefault(); }}
        onAuxClick={e => { if (e.button === 1) e.preventDefault(); }}>
        <div className="check-strip-track" style={{ transform: `translateX(calc(${-page * 100}% + ${offset}px))` }}>
        <div className="check-strip-page" data-check-page="1" inert={page !== 0} aria-hidden={page !== 0}>
      
        <label className={`space-switch${switching ? " is-busy" : ""}`} title={t("viewer.spaceTitle")}>
          <SheetsIcon /><span className="space-name">{caption}</span><span className="space-caret" aria-hidden="true">▾</span>
          <select aria-label={t("viewer.spaceSelectLabel")} value={space} disabled={switching} onChange={(e) => onSpace(e.target.value)}
            onMouseDown={e => { if (typeof e.currentTarget.showPicker === "function") e.preventDefault(); }}
            onClick={e => { e.currentTarget.focus(); e.currentTarget.showPicker?.(); }}>
            {ordered.map((s) => (
              <option key={s.name} value={s.name}>{s.name === MODEL_SPACE ? t("viewer.spaceModelOption") : s.name}</option>
            ))}
          </select>
        </label>
      <button type="button" onClick={() => onTab("layers")}>{t("viewer.stripLayers")}</button>
        {onExport ? <button type="button" className="strip-export" aria-label={t("markup.share")} title={t("export.buttonTip")} onClick={onExport}>{t("markup.share")}</button> : null}
        </div>
        <div className="check-strip-page" data-check-page="2" inert={page !== 1} aria-hidden={page !== 1}>
      <button type="button" aria-label={missing > 0 ? `${t("viewer.stripMissing")}, ${t("viewer.missingCount", { N: missing })}` : undefined} onClick={() => onTab("missing")}>
        {t("viewer.stripMissing")}{missing > 0 ? <em>{t("viewer.stripWarn", { N: missing })}</em> : null}
      </button>
      <button type="button" aria-label={xrefsUnloaded > 0 ? `${t("viewer.stripXrefs")}, ${t("viewer.xrefUnloadedCount", { N: xrefsUnloaded })}` : undefined} onClick={() => onTab("xrefs")}>
        {t("viewer.stripXrefs")}{xrefsUnloaded > 0 ? <em>{t("viewer.stripWarn", { N: xrefsUnloaded })}</em> : null}
      </button>
      {onInspect ? <button type="button" onClick={onInspect}>{t("bar.info")}</button> : null}
        </div>
        </div>
      </div>
      <div className="check-strip-dots" role="group" aria-label={t("viewer.checkStripLabel")}
        onKeyDown={e => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const next = e.key === "ArrowRight" ? 1 : 0;
            goTo(next);
            (e.currentTarget.children[next] as HTMLButtonElement).focus();
          }
        }}>
        {[0, 1].map(i => <button key={i} type="button" aria-label={libraryText(locale, "page", { n: i + 1 })} aria-pressed={page === i} onClick={() => goTo(i)}><span /></button>)}
      </div>
    </nav>
  );
}
