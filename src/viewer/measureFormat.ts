// How many digits after the decimal point measurements show. One setting for the whole app, kept on
// this device; results, labels on the drawing and the info card all use it.
import { convertMeasurement, type MeasurementUnit } from "./measurementGeometry";

const KEY = "fatcat:measure-decimals";
export const DECIMAL_CHOICES = [0, 1, 2, 3] as const;
export const DEFAULT_DECIMALS = 1;

export function loadDecimals(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return (DECIMAL_CHOICES as readonly number[]).includes(n) && localStorage.getItem(KEY) !== null ? n : DEFAULT_DECIMALS;
  } catch { return DEFAULT_DECIMALS; }
}

export function saveDecimals(n: number): void {
  try { localStorage.setItem(KEY, String(n)); } catch { /* Private mode: the choice lasts for this visit. */ }
}

/** A number with exactly `decimals` digits after the point (12.50, not 12.5). */
export function fixedNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat("zh-TW", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** A measured length or area in the display unit, e.g. "45.44 cm" or "1,017.88 cm²". */
export function formatMeasure(value: number, source: MeasurementUnit, display: MeasurementUnit, decimals: number, area = false): string {
  const unit = display === "drawing" ? "圖面單位" : display;
  return `${fixedNumber(convertMeasurement(value, source, display, area), decimals)} ${unit}${area ? "²" : ""}`;
}
