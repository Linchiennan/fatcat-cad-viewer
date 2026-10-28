// Units of one sheet (T16 3.4) and the remembered panel height (T16 2.4-2).
import { readPosition, savePosition } from "../viewer/readingPosition";
import type { MeasurementUnit } from "../viewer/measurementGeometry";
import { formatMeasure, fixedNumber } from "../viewer/measureFormat";
import { convertMeasurement } from "../viewer/measurementGeometry";

export const UNIT_CHOICES: MeasurementUnit[] = ["drawing", "mm", "cm", "m", "in", "ft"];
/** Names in the unit menus. */
export const UNIT_NAMES: Record<MeasurementUnit, string> = {
  drawing: "圖面單位", mm: "毫米 (mm)", cm: "公分 (cm)", m: "公尺 (m)", in: "英吋 (in)", ft: "英尺 (ft)",
};

export type SheetUnits = {
  /** 1 drawing unit = … */
  source: MeasurementUnit;
  display: MeasurementUnit;
  /** The file says nothing about its unit and centimetres are assumed. */
  assumed: boolean;
};

/**
 * Display unit before the user picks one (用戶 2026-10-28): 繁中 cm, as Taiwanese drawings are read; English follows the
 * phone's region: inches in the US (also Liberia, Myanmar), millimetres elsewhere, what architects there draw in.
 */
export function defaultDisplayUnit(locale: string, languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]): MeasurementUnit {
  if (locale !== "en") return "cm";
  const region = languages.map((l) => /^[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(l ?? "")?.[1]?.toUpperCase()).find(Boolean);
  return region && ["US", "LR", "MM"].includes(region) ? "in" : "mm";
}

/** Units when a sheet is ready: saved choice, else INSUNITS, else centimetres; display saved, else the default for the language. */
export function sheetUnits(viewKey: string, fileUnit: MeasurementUnit, defaultDisplay: MeasurementUnit = "cm"): SheetUnits {
  const saved = viewKey ? readPosition(viewKey) : null;
  const source = saved?.sourceUnit && UNIT_CHOICES.includes(saved.sourceUnit) ? saved.sourceUnit : fileUnit === "drawing" ? "cm" : fileUnit;
  let display = saved?.displayUnit && UNIT_CHOICES.includes(saved.displayUnit) ? saved.displayUnit : defaultDisplay;
  if (source === "drawing") display = "drawing";
  return { source, display, assumed: fileUnit === "drawing" && source === "cm" };
}

/** A change in the panel: a new "1 drawing unit =" moves the display unit along; drawing units only show as drawing units. */
export function nextUnits(prev: { source: MeasurementUnit; display: MeasurementUnit }, change: { source?: MeasurementUnit; display?: MeasurementUnit }) {
  const source = change.source ?? prev.source;
  const display: MeasurementUnit = source === "drawing" ? "drawing" : change.source ?? change.display ?? prev.display;
  return { source, display };
}

/** Apply a panel change and save both units for the sheet. */
export function changeUnits(viewKey: string, fileUnit: MeasurementUnit, prev: SheetUnits, change: { source?: MeasurementUnit; display?: MeasurementUnit }): SheetUnits {
  const { source, display } = nextUnits(prev, change);
  if (viewKey) savePosition(viewKey, { sourceUnit: source, displayUnit: display });
  return { source, display, assumed: fileUnit === "drawing" && source === "cm" };
}

/** Text of a length or area result in the panel, strip and info card ("62.8 cm", "1,017.9 cm²"). */
export const formatResult = (units: SheetUnits, decimals: number) => (value: number, area = false) =>
  formatMeasure(value, units.source, units.display, decimals, area);

/**
 * Text of a number on the drawing: no unit word when the display unit is the drawing unit (T15 2.2-4), nor when the
 * 齒輪「圖上顯示單位」 is off (`withUnit` false: the number in the display unit only).
 */
export function formatLabel(value: number, units: SheetUnits, decimals: number, withUnit = true, area = false): string {
  if (units.display === "drawing" || units.source === "drawing") return fixedNumber(value, decimals);
  if (!withUnit) return fixedNumber(convertMeasurement(value, units.source, units.display, area), decimals);
  return formatMeasure(value, units.source, units.display, decimals, area);
}

const HEIGHT_KEY = "fatcat:measure-panel-height";
export const PANEL_MIN_HEIGHT = 110;

/** Largest panel height for a window: window height − 190, never below 110. */
export const panelMaxHeight = (viewportHeight: number) => Math.max(PANEL_MIN_HEIGHT, viewportHeight - 190);
/** `min`: the panel's own shortest useful height (title + one full row of mode tiles), when it is known. */
export const clampPanelHeight = (h: number, viewportHeight: number, min = PANEL_MIN_HEIGHT) =>
  Math.round(Math.min(Math.max(min, panelMaxHeight(viewportHeight)), Math.max(min, h)));

/** Saved panel height, or null (nothing saved, unreadable, or below 110). */
export function loadPanelHeight(): number | null {
  try {
    const raw = localStorage.getItem(HEIGHT_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= PANEL_MIN_HEIGHT ? n : null;
  } catch { return null; }
}

export function savePanelHeight(h: number): void {
  try { localStorage.setItem(HEIGHT_KEY, String(Math.round(h))); } catch { /* private mode: this visit only */ }
}
