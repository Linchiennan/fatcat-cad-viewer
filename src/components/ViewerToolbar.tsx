// Bottom tools of the viewer: the cat-paw glove bar, on phone and desktop alike (T18 2.1-2.3; the desktop dock was dropped 2026-10-27). Owner: P4 group D.
// GloveBar.test.tsx (ours) fixes the glove bar's accessible names, order and two-character captions.
import { useState, type ComponentType, type ReactNode } from "react";
import type { ViewCommand } from "../types/drawing";
import type { MeasurementMode } from "../viewer/measurementGeometry";
import { useI18n, type TranslationKey } from "../i18n/translations";
import { IconTile } from "./IconTile";
import { YarnLine } from "./YarnLine";
import {
  AngleIcon, AreaIcon, ArrowLeftIcon, DistanceIcon, ExitIcon, HomeIcon, PathIcon, PenIcon, PlusIcon,
  RulerIcon, SearchIcon, TrashIcon, type IconProps,
} from "./Icons";

export function SelectionIcon(props: IconProps) {
  return <svg {...props} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 3l14 10-7 1-3 7z" /></svg>;
}

/** 選取 on the phone glove bar: a smaller arrow with a curled cat tail (用戶選 T2，箭頭再小一點). */
export function SelectionTailIcon(props: IconProps) {
  return (
    <svg {...props} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 2.8L13.1 8.1 9.3 9.1 11.6 13.1 9.8 14 7.6 10 4.8 12.7z" />
      <path d="M10.8 13.9c1.3 2.8 3.8 4.6 6.6 4 2.5-.5 3.2-3.3 1.8-5-.9-1.1-2.5-.9-2.9.3" />
    </svg>
  );
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

/** Three slightly curved whiskers each side of the two "ear" buttons, reaching just past the edges (用戶選 W1). */
function Whiskers() {
  return (
    <svg className="glove-whiskers" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 2Q9 3.6 17 7M0 10Q9 9.3 17 10M0 18Q9 16.4 17 13M100 2Q91 3.6 83 7M100 10Q91 9.3 83 10M100 18Q91 16.4 83 13" />
    </svg>
  );
}

/**
 * Two round-tipped ears leaning outwards, drawn as one outline that meets the head line on both sides (用戶 2026-10-27：
 * 貓耳往上移後破口). y = 20 is the button's top border; the fill hides that border under each ear.
 */
function Ears() {
  return (
    <svg className="glove-ears" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {/* both run on to y = 22 (the inside of the border), so the head line never shows under an ear */}
      {/* Same ears as chosen; only the feet are tidied (用戶 2026-10-27：貓耳下方不要有細細的線): the fill also covers the
          button's rounded corner under the outer foot (it showed as a thin half-covered line), the outer side runs down to
          meet that corner's border, and the inner sides stop on the head line instead of poking below it. */}
      {/* the fill reaches ~1 px below the border: scaled views (the layout preview at 74 %) left a faint line otherwise */}
      <path className="ear-fill" d="M8.3 25.8 12.4 7.5C14 .5 19 -.5 24 4.2L42.7 22 43.6 23.6 17.5 23.6 14 23.8 11 24.8ZM91.7 25.8 89 24.8 86 23.8 82.5 23.6 56.4 23.6 57.3 22 76 4.2C81 -.5 86 .5 87.6 7.5Z" />
      <path className="ear-line" d="M8.35 23.6 12.4 7.5C14 .5 19 -.5 24 4.2L40.6 20M59.4 20 76 4.2C81 -.5 86 .5 87.6 7.5L91.65 23.6" />
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
      {shape === "paw" ? <PawShape /> : shape === "ear" ? <><Ears /><Whiskers /></> : null}
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
        tip: t('select.tip'), Icon: SelectionTailIcon, pressed: !!props.selecting, disabled: pdf, onClick: () => props.onSelect?.(),
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
        <YarnLine />
      </nav>
    </>
  );
}
