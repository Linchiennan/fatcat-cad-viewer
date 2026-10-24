// Bottom tools of the viewer: the phone glove bar and the desktop dock (T18 2.1-2.4). Owner: P4 group D.
// GloveBar.test.tsx (ours) fixes the glove bar's accessible names, order and two-character captions.
import { useState, type ComponentType, type ReactNode } from "react";
import type { ViewCommand } from "../types/drawing";
import type { MeasurementMode } from "../viewer/measurementGeometry";
import { useI18n, type TranslationKey } from "../i18n/translations";
import { IconTile } from "./IconTile";
import {
  AngleIcon, AreaIcon, ArrowLeftIcon, DistanceIcon, ExitIcon, FitIcon, HomeIcon, PathIcon, PenIcon, PlusIcon,
  ResetIcon, RulerIcon, SearchIcon, TrashIcon, type IconProps,
} from "./Icons";

export function SelectionIcon(props: IconProps) {
  return <svg {...props} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 3l14 10-7 1-3 7z" /></svg>;
}

/** Tools that replace the five buttons while measuring (T18 2.3). */
export type MeasureTools = {
  mode: MeasurementMode;
  /** Open the measuring mode picker. */
  onMode(): void;
  onUndo(): void;
  canUndo: boolean;
  /** Keep the current result and start the next one. */
  onKeep(): void;
  canKeep: boolean;
  /** Clear everything (the App asks first). Shown between the mode and 復原 when given. */
  onClearAll?(): void;
  canClearAll?: boolean;
  /** Pick a mode from the bar's own picker (four big tiles above the bar). Without it only onMode() is called. */
  onPickMode?(mode: BarMode): void;
};

export type ToolbarProps = {
  onCommand(command: ViewCommand): void;
  /** False for PDF: measure, markup, search and info are greyed out with an explanation. */
  canMeasure: boolean;
  onMeasure(): void;
  onMarkup(): void;
  onSearch(): void;
  onInspect(): void;
  onSelect?(): void;
  selecting?: boolean;
  measuring?: boolean;
  marking?: boolean;
  onClearMarks?(): void;
  canClearMarks?: boolean;
  searching?: boolean;
  inspecting?: boolean;
  measureTools?: MeasureTools;
};

/** Modes the glove bar can pick (object measuring lives in the full panel only). */
export type BarMode = "distance" | "path" | "area" | "angle";
export const BAR_MODES: readonly BarMode[] = ["distance", "path", "area", "angle"];
const MODE_ICON: Record<MeasurementMode, ComponentType<IconProps>> = {
  distance: DistanceIcon, path: PathIcon, area: AreaIcon, angle: AngleIcon, object: DistanceIcon,
};
const barMode = (mode: MeasurementMode): BarMode => (mode === "object" ? "distance" : mode);

/** Short side lines next to the icon of the two "ear" buttons. */
function Whiskers() {
  return (
    <svg className="glove-whiskers" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M1 5l14 3M1 15l14-3M99 5l-14 3M99 15l-14-3" />
    </svg>
  );
}

/** The cat paw drawn behind the centre button: four toe beans and a big two-lobed pad. */
export function PawShape({ className = "glove-paw" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g className="paw-toes">
        <ellipse cx="13" cy="34" rx="8.5" ry="11" transform="rotate(-26 13 34)" />
        <ellipse cx="35" cy="13" rx="9" ry="11.5" transform="rotate(-9 35 13)" />
        <ellipse cx="65" cy="13" rx="9" ry="11.5" transform="rotate(9 65 13)" />
        <ellipse cx="87" cy="34" rx="8.5" ry="11" transform="rotate(26 87 34)" />
      </g>
      <path className="paw-pad" d="M50 31C74 31 94 47 94 67C94 86 81 97 66 97C58 97 54 94 50 94C46 94 42 97 34 97C19 97 6 86 6 67C6 47 26 31 50 31Z" />
    </svg>
  );
}

type Slot = {
  key: string;
  name: string;
  label: string;
  tip: string;
  Icon: ComponentType<IconProps>;
  onClick(): void;
  pressed?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  /** extra decorations after the icon (the mode caret) */
  after?: ReactNode;
};

function GloveSlot({ slot, place }: { slot: Slot; place: number }) {
  const shape = place === 2 ? "paw" : place === 1 || place === 3 ? "ear" : "plain";
  const className = `glove-btn glove-${shape}${slot.pressed ? " is-on" : ""}${slot.disabled ? " is-off" : ""}`;
  return (
    <IconTile name={slot.name} label={slot.label} tip={slot.tip} pressed={slot.pressed} expanded={slot.expanded}
      disabled={slot.disabled} className={className} onClick={slot.onClick}>
      {shape === "paw" ? <PawShape /> : shape === "ear" ? <Whiskers /> : null}
      <slot.Icon className="glove-icon" />
      {slot.after}
    </IconTile>
  );
}

/** Phone glove bar: 量測｜標註｜回到初始畫面｜搜尋｜資訊. */
export function GloveBar(props: ToolbarProps) {
  const { t } = useI18n();
  const [picker, setPicker] = useState(false);
  const tools = props.measuring ? props.measureTools : undefined;
  const pdf = !props.canMeasure;
  const tr = (key: TranslationKey) => t(key);

  let slots: Slot[];
  if (tools) {
    const mode = barMode(tools.mode);
    const closeFirst = (run: () => void) => () => { setPicker(false); run(); };
    const canClear = tools.canClearAll ?? false;
    slots = [
      { key: "end", name: tr("bar.measureEnd"), label: tr("bar.end"), tip: tr("bar.exitTip"), Icon: ExitIcon, pressed: true, onClick: closeFirst(props.onMeasure) },
      {
        key: "mode", name: tr("bar.modeName"), label: picker ? tr("bar.modeCollapse") : t(`bar.modeShort.${mode}`), tip: tr("bar.modeTip"),
        Icon: MODE_ICON[mode], pressed: picker, expanded: picker,
        after: <svg className="glove-caret" viewBox="0 0 10 6" aria-hidden="true" focusable="false"><path d="M0 0h10L5 6z" /></svg>,
        onClick: () => { if (tools.onPickMode) setPicker((open) => !open); tools.onMode(); },
      },
      ...(tools.onClearAll ? [{
        key: "clear", name: tr("bar.clearAll"), label: tr("bar.clearShort"), tip: tr("bar.clearTip"), Icon: TrashIcon,
        disabled: !canClear, onClick: closeFirst(() => tools.onClearAll?.()),
      }] : []),
      { key: "undo", name: tr("bar.undo"), label: tr("bar.undoShort"), tip: tr("bar.undoTip"), Icon: ArrowLeftIcon, disabled: !tools.canUndo, onClick: closeFirst(tools.onUndo) },
      { key: "keep", name: tr("bar.keep"), label: tr("bar.keepShort"), tip: tr("bar.keepTip"), Icon: PlusIcon, disabled: !tools.canKeep, onClick: closeFirst(tools.onKeep) },
    ];
  } else {
    slots = [
      {
        key: "measure", name: props.measuring ? tr("bar.measureEnd") : tr("bar.measure"), label: props.measuring ? tr("bar.end") : tr("bar.measure"),
        tip: pdf ? tr("bar.measureNoPdf") : tr("bar.measureTip"), Icon: RulerIcon, pressed: !!props.measuring, disabled: pdf, onClick: props.onMeasure,
      },
      {
        key: "markup", name: props.marking ? tr("bar.markupEnd") : tr("bar.markup"), label: props.marking ? tr("bar.end") : tr("bar.markup"),
        tip: pdf ? tr("bar.markupNoPdf") : tr("bar.markupTip"), Icon: PenIcon, pressed: !!props.marking, disabled: pdf, onClick: props.onMarkup,
      },
      props.marking ? { key: "clearMarks", name: tr("markup.clear"), label: tr("markup.clearShort"), tip: tr("markup.clearTip"), Icon: TrashIcon, disabled: !props.canClearMarks, onClick: () => props.onClearMarks?.() }
        : { key: "home", name: tr("bar.home"), label: tr("bar.homeShort"), tip: tr("bar.homeTip"), Icon: HomeIcon, onClick: () => props.onCommand("home") },
      {
        key: "search", name: props.searching ? tr("bar.searchEnd") : tr("bar.search"), label: props.searching ? tr("bar.end") : tr("bar.search"),
        tip: pdf ? tr("bar.searchNoPdf") : tr("bar.searchTip"), Icon: SearchIcon, pressed: !!props.searching, disabled: pdf, onClick: props.onSearch,
      },
      {
        key: "select", name: t(props.selecting ? 'select.end' : 'select.title'), label: t('select.title'),
        tip: t('select.tip'), Icon: SelectionIcon, pressed: !!props.selecting, disabled: pdf, onClick: () => props.onSelect?.(),
      },
    ];
  }

  return (
    <>
      {tools && picker && tools.onPickMode ? (
        <div className="mode-picker" role="group" aria-label={tr("bar.modePicker")}>
          {BAR_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            const on = barMode(tools.mode) === m;
            return (
              <button key={m} type="button" className={`mode-tile${on ? " is-on" : ""}`} aria-pressed={on}
                onClick={() => { setPicker(false); tools.onPickMode?.(m); }}>
                <Icon /><span>{t(`bar.modeName.${m}`)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <nav className={`glove-bar${tools ? " is-measuring" : ""}`} aria-label={tools ? tr("bar.measureLabel") : tr("bar.label")} data-fit="toolbar">
        {slots.map((slot, i) => <GloveSlot key={slot.key} slot={slot} place={i} />)}
      </nav>
    </>
  );
}

type DockItem = { key: string; name: string; short: string; tip: string; Icon: ComponentType<IconProps>; pressed?: boolean; onClick(): void };

/** Desktop dock (fit, reset, measure, info, markup, search). PDF: fit and reset only. */
export function ViewerDock(props: ToolbarProps & { spaces?: { name: string }[]; space?: string; onSpace?(name: string): void }) {
  const { t } = useI18n();
  const sep = t("tip.joiner");
  const view: DockItem[] = [
    { key: "fit", name: t("viewer.fit"), short: t("dock.fitShort"), tip: t("dock.fitTip"), Icon: FitIcon, onClick: () => props.onCommand("fit") },
    { key: "reset", name: t("viewer.resetView"), short: t("dock.resetShort"), tip: t("dock.resetTip"), Icon: ResetIcon, onClick: () => props.onCommand("reset") },
  ];
  const tools: DockItem[] = props.canMeasure ? [
    { key: "measure", name: props.measuring ? t("bar.measureEnd") : t("bar.measure"), short: t("bar.measure"), tip: t("dock.measureTip"), Icon: RulerIcon, pressed: !!props.measuring, onClick: props.onMeasure },
    { key: "select", name: t(props.selecting ? 'select.end' : 'select.title'), short: t('select.title'), tip: t('select.tip'), Icon: SelectionIcon, pressed: !!props.selecting, onClick: () => props.onSelect?.() },
    { key: "markup", name: props.marking ? t("bar.markupEnd") : t("bar.markup"), short: t("bar.markup"), tip: t("dock.markupTip"), Icon: PenIcon, pressed: !!props.marking, onClick: props.onMarkup },
    { key: "search", name: props.searching ? t("bar.searchEnd") : t("bar.search"), short: t("bar.search"), tip: t("dock.searchTip"), Icon: SearchIcon, pressed: !!props.searching, onClick: props.onSearch },
  ] : [];
  const item = (d: DockItem) => (
    <button key={d.key} type="button" className={`dock-item${d.pressed ? " is-on" : ""}`} aria-label={d.name} aria-pressed={d.pressed}
      title={`${d.name}${sep}${d.tip}`} onClick={d.onClick}>
      <span className="dock-tile"><d.Icon /></span>
      <span className="dock-caption">{d.short}</span>
      <span className="dock-tip" role="tooltip">{d.name}{sep}{d.tip}</span>
    </button>
  );
  return (
    <nav className="viewer-dock" aria-label={t("viewer.controlsLabel")} data-fit="toolbar">
      {view.map(item)}
      {props.marking ? <button type="button" className="dock-item" aria-label={t("markup.clear")} title={t("markup.clearTip")} disabled={!props.canClearMarks} onClick={props.onClearMarks}><span className="dock-tile"><TrashIcon /></span><span className="dock-caption">{t("markup.clearShort")}</span></button> : null}
      {tools.length ? <span className="dock-sep" aria-hidden="true" /> : null}
      {tools.map(item)}
    </nav>
  );
}
