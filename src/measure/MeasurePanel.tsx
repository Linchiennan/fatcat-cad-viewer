// Full measuring panel (T16 2.4): always on screen on a computer, behind the gear on a phone.
import { useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type SVGProps } from "react";
import { useI18n, type TranslationKey } from "../i18n/translations";
import { IconTile } from "../components/IconTile";
import { AngleIcon, AreaIcon, CheckIcon, CloseIcon, DistanceIcon, EraserIcon, GearIcon, PathIcon, PointerIcon, TrashIcon, ArrowLeftIcon } from "../components/Icons";
import { DECIMAL_CHOICES, fixedNumber } from "../viewer/measureFormat";
import { LABEL_STYLES, setLabelStyle, setLabelUnit, useLabelStyle, useLabelUnit, type MeasureLabelStyle } from "../viewer/measureLabelStyle";
import { distanceParts, lengthTotal, resultValue } from "../viewer/measureResults";
import { pathLength, type MeasurableEntity, type MeasurementMode, type MeasurementSettings, type MeasurementUnit } from "../viewer/measurementGeometry";
import { ALL_SNAP_KINDS, canKeep, initialMeasureState, measureReducer, MODE_KEYS, statusKey, type MeasureAction, type MeasureState } from "./measureState";
import { publishPickStatus, usePickStatus } from "./pickStatus";
import { clampPanelHeight, loadPanelHeight, nextUnits, savePanelHeight, UNIT_CHOICES, type SheetUnits } from "./measureUnits";
import { phonePreview } from '../app/devicePreview';
import "./measure.css";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const MODES: { mode: MeasurementMode; Icon: Icon }[] = [
  { mode: "distance", Icon: DistanceIcon },
  { mode: "path", Icon: PathIcon },
  { mode: "area", Icon: AreaIcon },
  { mode: "angle", Icon: AngleIcon },
  { mode: "object", Icon: PointerIcon },
];

/** Property names shown for a picked object (T16 2.4-7); others keep their own name. */
const PROPERTY_KEYS: Record<string, TranslationKey> = {
  handle: "measure.prop.handle", layer: "measure.prop.originalLayer", colorIndex: "measure.prop.aci", trueColor: "measure.prop.trueColor",
  color: "measure.prop.drawnColor", lineType: "measure.prop.lineType", text: "measure.prop.text", rotation: "measure.prop.rotation",
  textHeight: "measure.prop.textHeight", lineweight: "measure.prop.lineWeight", styleName: "measure.prop.style", widthFactor: "measure.prop.widthFactor",
  radius: "measure.prop.radius", pattern: "measure.prop.hatch", dimensionType: "measure.prop.dimType", block: "measure.prop.dimBlock",
};
const unitKey = (u: MeasurementUnit) => `measure.unit.${u}` as TranslationKey;

const KEPT_NAMES: Record<string, MeasurementMode> = { distance: "distance", path: "path", area: "area", angle: "angle", object: "object" };

/** Panel driven by a MeasureState and its reducer. */
export type MeasureStatePanelProps = {
  state: MeasureState;
  dispatch(action: MeasureAction): void;
  units: SheetUnits;
  /** Unit from the file (INSUNITS); "drawing" when it has none. */
  fileUnit: MeasurementUnit;
  /** A unit menu changed (the App applies measureUnits.changeUnits and saves it for the sheet). */
  onUnits(change: { source?: MeasurementUnit; display?: MeasurementUnit }): void;
  decimals: number;
  onDecimals(decimals: number): void;
  /** The index reached a limit. */
  limited: boolean;
  /** Phone (?glove=1): same place and look as the one-line strip. */
  glove?: boolean;
  format(value: number, area?: boolean): string;
  onClose(): void;
  /** 全部清除: the App asks first, then dispatches clear-all. */
  onClearAll(): void;
};

const coarse = () => phonePreview() || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
const viewportHeight = () => (typeof window !== "undefined" ? window.innerHeight : 800);

/** Panel driven by plain MeasurementSettings (the App keeps the settings and the picked object). */
export type MeasureSettingsPanelProps = {
  settings: MeasurementSettings;
  onSettings(next: MeasurementSettings): void;
  sourceUnit: MeasurementUnit;
  displayUnit: MeasurementUnit;
  onUnits(source: MeasurementUnit, display: MeasurementUnit): void;
  decimals: number;
  onDecimals(decimals: number): void;
  unitAssumed: boolean;
  snapLimited: boolean;
  picked: MeasurableEntity | null;
  format(value: number, area?: boolean): string;
  onClearAll(): void;
  onClose(): void;
  glove?: boolean;
};

export type MeasurePanelProps = MeasureStatePanelProps | MeasureSettingsPanelProps;

/** Full measuring panel; accepts either a MeasureState + dispatch or plain settings + onSettings. */
export function MeasurePanel(props: MeasurePanelProps) {
  const status = usePickStatus();
  if ("state" in props) return <PanelBody {...props} />;
  const p = props;
  const state: MeasureState = { ...initialMeasureState(), settings: p.settings, entity: p.picked, status };
  const dispatch = (a: MeasureAction) => {
    if (a.type === "status-reset" || a.type === "mode" || a.type === "snap" || a.type === "snap-kinds") publishPickStatus("plane");
    const next = measureReducer(state, a);
    if (next.settings !== p.settings) p.onSettings(next.settings);
  };
  return (
    <PanelBody state={state} dispatch={dispatch} units={{ source: p.sourceUnit, display: p.displayUnit, assumed: p.unitAssumed }}
      fileUnit={p.unitAssumed ? "drawing" : p.sourceUnit}
      onUnits={(change) => { const n = nextUnits({ source: p.sourceUnit, display: p.displayUnit }, change); p.onUnits(n.source, n.display); }}
      decimals={p.decimals} onDecimals={p.onDecimals} limited={p.snapLimited} glove={p.glove} format={p.format} onClose={p.onClose} onClearAll={p.onClearAll} />
  );
}

function PanelBody({ state, dispatch, units, fileUnit, onUnits, decimals, onDecimals, limited, glove, format, onClose, onClearAll }: MeasureStatePanelProps) {
  const { t } = useI18n();
  const s = state.settings;
  const [height, setHeight] = useState<number | null>(() => loadPanelHeight());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const labelStyle = useLabelStyle();
  const labelUnit = useLabelUnit();
  const drag = useRef<{ id: number; y: number; h: number } | null>(null);
  const panel = useRef<HTMLElement | null>(null);

  // A desktop measure left in 物件 mode (from before it was dropped there) starts in 距離 instead.
  useEffect(() => {
    if (!glove && !s.info && s.mode === "object") dispatch({ type: "mode", mode: "distance" });
  }, [glove, s.info, s.mode]);
  // Shortest height: the title and one whole row of mode tiles, captions included (用戶 2026-10-27：拖到最小剛好一排圖示).
  const minHeight = () => {
    const p = panel.current, row = p?.querySelector(".measure-modes > *");
    if (!p || !row) return undefined;
    const pad = parseFloat(getComputedStyle(p.querySelector(".measure-body") ?? p).paddingBottom) || 0;
    return Math.ceil(row.getBoundingClientRect().bottom - p.getBoundingClientRect().top + p.scrollTop + pad + 2);
  };
  useEffect(() => {
    // A remembered height below one row of tiles (saved before the floor existed) opens at that row.
    setHeight((h) => (h === null ? h : clampPanelHeight(h, viewportHeight(), minHeight())));
  }, []);
  useEffect(() => {
    // Keep a remembered height inside the window when it shrinks.
    const fit = () => setHeight((h) => (h === null ? h : clampPanelHeight(h, viewportHeight(), minHeight())));
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y: e.clientY, h: panel.current?.getBoundingClientRect().height ?? height ?? 200 };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setHeight(clampPanelHeight(d.h + (d.y - e.clientY), viewportHeight(), minHeight()));
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const h = clampPanelHeight(d.h + (d.y - e.clientY), viewportHeight(), minHeight());
    setHeight(h);
    savePanelHeight(h);
  };

  const entity = state.entity;
  const objectMode = s.mode === "object";
  const result = objectMode ? null : { mode: s.mode as Exclude<MeasurementMode, "object">, points: s.points };
  const value = result ? resultValue(result) : null;
  let main = "—";
  const subs: string[] = [];
  if (objectMode) {
    if (entity && !entity.propertiesOnly) main = `${entity.approximate ? "≈ " : ""}${format(entity.length)}`;
    if (entity?.propertiesOnly) subs.push(t("measure.propertiesOnly"));
    else if (entity?.area !== undefined) subs.push(`${t("measure.mode.area")}: ${format(entity.area, true)}`);
  } else if (value !== null) {
    main = s.mode === "angle" ? `${fixedNumber(value, decimals)}°` : format(value, s.mode === "area");
  }
  if (s.mode === "area" && s.points.length >= 3) subs.push(`${t("measure.perimeter")}: ${format(pathLength(s.points, true))}`);
  const parts = s.mode === "distance" ? distanceParts(s.points) : null;
  if (parts) subs.push(t("measure.parts", { x: format(parts.dx), y: format(parts.dy) }));
  const total = s.kept.some((k) => k.mode === "distance" || k.mode === "path") ? lengthTotal(s.kept) : null;
  const canUndo = s.points.length > 0 || !!entity;
  const sourceName = units.source === "drawing" ? t("measure.noUnit") : t(unitKey(units.source));
  const style = height !== null ? { height } : undefined;

  return (
    <section ref={panel} className={`measure-panel${glove ? " glove" : ""}${coarse() ? " coarse" : ""}`} style={style} aria-label={t("measure.title")}>
      <header className="measure-head">
        {/* The drag bar shares the title's row (用戶 2026-10-27：白色拉桿跟量測同排); the whole middle of the row is the grip. */}
        <div className="measure-title-row">
          <strong>{t("measure.title")}</strong>
          <div className="panel-drag" role="separator" aria-orientation="horizontal" aria-label={t("measure.dragLabel")} title={t("measure.dragLabel")}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          <button type="button" className="measure-close" aria-label={t("measure.close")} title={t("measure.close")} onClick={onClose}><CloseIcon /></button>
        </div>
      </header>
      <div className="measure-body">
        <div className="measure-modes" role="group">
          {/* Desktop leaves out 物件 (用戶 2026-10-27：電腦版量測的物件按鈕拿掉，不實用); 選取 still reads an object's data. */}
          {MODES.filter(({ mode }) => glove || mode !== "object").map(({ mode, Icon }) => (
            <IconTile key={mode} name={t(MODE_KEYS[mode])} label={t(`measure.tile.${mode}.short` as TranslationKey)} tip={t(`measure.tile.${mode}.tip` as TranslationKey)} pressed={s.mode === mode} onClick={() => dispatch({ type: "mode", mode })}><Icon /></IconTile>
          ))}
        </div>
        <div className="measure-result" aria-live="polite">
          <output className="measure-value">{main}</output>
          {subs.map((line, i) => <div key={i} className="measure-sub">{line}</div>)}
        </div>
        {objectMode ? (entity ? <PropertyList entity={entity} /> : null) : (
          <div className="measure-keep">
            <div className="measure-keep-actions">
              <IconTile name={t("measure.keepName")} label={t("measure.keepShort")} tip={t("bar.keepTip")} disabled={!canKeep(s)} onClick={() => dispatch({ type: "keep" })}><CheckIcon /></IconTile>
              {s.kept.length ? (
                <IconTile className="icon-tile measure-clear" name={t("measure.clearAllName")} label={t("measure.clearShort")} tip={t("measure.clearAllTip")} onClick={onClearAll}><TrashIcon /></IconTile>
              ) : null}
            </div>
            {s.kept.length ? (
              <ol className="measure-kept">
                {s.kept.map((k, i) => {
                  const v = resultValue(k);
                  const shown = v === null ? "—" : k.mode === "angle" ? `${fixedNumber(v, decimals)}°` : format(v, k.mode === "area");
                  return <li key={i}>{`${i + 1}. ${t(MODE_KEYS[KEPT_NAMES[k.mode]])}　${shown}`}</li>;
                })}
              </ol>
            ) : null}
            {total !== null ? <div className="measure-total">{t("measure.total", { 值: format(total) })}</div> : null}
          </div>
        )}
        {objectMode && s.kept.length > 0 ? <IconTile className="icon-tile measure-clear" name={t("measure.clearAllName")} label={t("measure.clearShort")} tip={t("measure.clearAllTip")} onClick={onClearAll}><TrashIcon /></IconTile> : null}
        <p className="measure-howto">{t(`measure.howto.${s.mode}` as Parameters<typeof t>[0])}</p>
        <div className="measure-settings">
          <button type="button" className="measure-settings-toggle" aria-expanded={settingsOpen} aria-label={t("measure.settingsLabel")} title={t("measure.settingsTitle")}
            onClick={() => setSettingsOpen((o) => !o)}>
            <GearIcon /><span>{t("measure.settings")}</span>
            <small>{`${sourceName}・${t(s.snap ? "measure.snapOn" : "measure.snapOff")}`}</small>
          </button>
          {settingsOpen ? (
            <div className="measure-settings-body">
              <label>{t("measure.sourceUnitLabel")}
                <select value={units.source} onChange={(e) => { onUnits({ source: e.target.value as MeasurementUnit }); dispatch({ type: "status-reset" }); }}>
                  {UNIT_CHOICES.map((u) => <option key={u} value={u}>{t(u === "drawing" ? "measure.drawingUnit" : unitKey(u))}</option>)}
                </select>
              </label>
              <label>{t("measure.displayUnitLabel")}
                <select value={units.display} onChange={(e) => { onUnits({ display: e.target.value as MeasurementUnit }); dispatch({ type: "status-reset" }); }}>
                  {(units.source === "drawing" ? ["drawing" as const] : UNIT_CHOICES).map((u) => <option key={u} value={u}>{t(u === "drawing" ? "measure.drawingUnit" : unitKey(u))}</option>)}
                </select>
              </label>
              <label className="measure-check">
                <input type="checkbox" checked={s.snap} onChange={(e) => dispatch({ type: "snap", on: e.target.checked })} />{t("measure.snapToggle")}
              </label>
              <label>{t("measure.decimals")}
                <select value={decimals} onChange={(e) => { onDecimals(Number(e.target.value)); dispatch({ type: "status-reset" }); }}>
                  {DECIMAL_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? t("measure.decimalsInt") : t("measure.decimalsN", { N: n })}</option>)}
                </select>
              </label>
              <label className="measure-check">
                <input type="checkbox" checked={labelUnit} onChange={(e) => setLabelUnit(e.target.checked)} />{t("measure.labelUnit")}
              </label>
              <label>{t("measure.labelStyle")}
                <select value={labelStyle} onChange={(e) => setLabelStyle(e.target.value as MeasureLabelStyle)}>
                  {LABEL_STYLES.map((v) => <option key={v} value={v}>{t(`measure.labelStyle.${v}` as TranslationKey)}</option>)}
                </select>
              </label>
              {s.snap && !objectMode ? (
                <div className="measure-snap-kinds" role="group" aria-label={t("measure.snapKindsLabel")}>
                  {ALL_SNAP_KINDS.map((kind) => {
                    const on = s.snapKinds.length === 0 || s.snapKinds.includes(kind);
                    const base = s.snapKinds.length ? s.snapKinds : ALL_SNAP_KINDS;
                    return <button key={kind} type="button" aria-pressed={on} className={on ? "on" : ""}
                      onClick={() => dispatch({ type: "snap-kinds", kinds: on ? base.filter((k) => k !== kind) : [...base, kind] })}>{t(`canvas.snap.${kind}` as TranslationKey)}</button>;
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {units.source === "drawing" ? <p className="measure-hint">{t("measure.unknownUnit")}</p> : null}
        {units.assumed && fileUnit === "drawing" ? <p className="measure-hint">{t("measure.assumedCm")}</p> : null}
        {limited ? <p className="measure-hint">{t("measure.snapLimited")}</p> : null}
      </div>
      <footer className="measure-foot">
        <span className="measure-status">{t(statusKey(state.status))}</span>
        <IconTile name={t("measure.undoPoint")} label={t("measure.undoShort")} tip={t("measure.undoTip")} disabled={!canUndo} onClick={() => dispatch({ type: "undo-point" })}><ArrowLeftIcon /></IconTile>
        <IconTile name={t("measure.redo")} label={t("measure.redoShort")} tip={t("measure.redoTip")} disabled={!canUndo} onClick={() => dispatch({ type: "restart" })}><EraserIcon /></IconTile>
      </footer>
    </section>
  );
}

function PropertyList({ entity }: { entity: MeasurableEntity }) {
  const { t } = useI18n();
  const rows: [string, string][] = [[t("measure.prop.type"), entity.kind], [t("measure.prop.layer"), entity.layer]];
  for (const [k, v] of Object.entries(entity.properties ?? {})) {
    if (v === undefined || v === null || v === "" || typeof v === "object") continue;
    rows.push([PROPERTY_KEYS[k] ? t(PROPERTY_KEYS[k]) : k, String(v)]);
  }
  return (
    <dl className="measure-props">
      {rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
