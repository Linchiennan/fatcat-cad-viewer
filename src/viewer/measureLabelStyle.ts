// How length numbers sit on measuring lines (用戶指定可在齒輪選單選 D／E／F). One setting for the whole app, kept on
// this device; the overlay re-renders when it changes.
import { useSyncExternalStore } from "react";

/** angle: turned with the line, just above it; box: in place on a dark box; gap: the line breaks around the number. */
export type MeasureLabelStyle = "angle" | "box" | "gap";
export const LABEL_STYLES: readonly MeasureLabelStyle[] = ["angle", "box", "gap"];
export const DEFAULT_LABEL_STYLE: MeasureLabelStyle = "box";
const KEY = "fatcat:measure-label-style";

export function loadLabelStyle(): MeasureLabelStyle {
  try {
    const v = localStorage.getItem(KEY);
    return (LABEL_STYLES as readonly string[]).includes(v ?? "") ? (v as MeasureLabelStyle) : DEFAULT_LABEL_STYLE;
  } catch { return DEFAULT_LABEL_STYLE; }
}

let current: MeasureLabelStyle | null = null;
const listeners = new Set<() => void>();

export function setLabelStyle(style: MeasureLabelStyle): void {
  current = style;
  try { localStorage.setItem(KEY, style); } catch { /* Private mode: the choice lasts for this visit. */ }
  listeners.forEach((l) => l());
}

export function useLabelStyle(): MeasureLabelStyle {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (current ??= loadLabelStyle()),
    () => (current ??= loadLabelStyle()),
  );
}

// Whether numbers on the drawing carry their unit ("15.6 cm" or "15.6"). Off by default (用戶指定); the result panel
// always shows the unit.
const UNIT_KEY = "fatcat:measure-label-unit";
let unitOn: boolean | null = null;
const loadLabelUnit = (): boolean => { try { return localStorage.getItem(UNIT_KEY) === "1"; } catch { return false; } };

export function setLabelUnit(on: boolean): void {
  unitOn = on;
  try { localStorage.setItem(UNIT_KEY, on ? "1" : "0"); } catch { /* Private mode: the choice lasts for this visit. */ }
  listeners.forEach((l) => l());
}

export function useLabelUnit(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (unitOn ??= loadLabelUnit()),
    () => (unitOn ??= loadLabelUnit()),
  );
}

// Colours of the measuring marks (用戶 2026-10-28：量測設定可改標註字色、外框色、線色；預設 5 種常用色、別用黃色).
// The CAD standard colours 1 紅, 7 白, 3 綠, 5 藍, 6 洋紅 — yellow (2) left out — plus 橘, the amber the marks always had
// (用戶：補上原本用的橘色). 紅 and 橘 are the exact colours of before, so the defaults look as they did.
export const MEASURE_COLORS = [
  { id: "orange", hex: "#ffb547" },
  { id: "red", hex: "#ff1f1f" },
  { id: "white", hex: "#ffffff" },
  { id: "green", hex: "#34c759" },
  { id: "blue", hex: "#3d8bff" },
  { id: "magenta", hex: "#ff4fd8" },
] as const;
export type MeasureColorId = (typeof MEASURE_COLORS)[number]["id"];
export type MeasureColorPart = "text" | "box" | "line";
export type MeasureColors = Record<MeasureColorPart, MeasureColorId>;
/** The colours before this setting existed (用戶：預設就是增加這功能之前的配色): red numbers, amber box rim and lines. */
export const DEFAULT_MEASURE_COLORS: MeasureColors = { text: "red", box: "orange", line: "orange" };
const COLOR_KEY = "fatcat:measure-colors";
export const measureColorHex = (id: MeasureColorId): string => MEASURE_COLORS.find((c) => c.id === id)?.hex ?? MEASURE_COLORS[0].hex;

/** The chosen colours as saved on this device (the export reads them outside React). */
export function loadMeasureColors(): MeasureColors {
  const out = { ...DEFAULT_MEASURE_COLORS };
  try {
    const saved = JSON.parse(localStorage.getItem(COLOR_KEY) ?? "{}") as Partial<Record<string, string>>;
    for (const part of Object.keys(out) as MeasureColorPart[]) {
      const v = saved[part];
      if (MEASURE_COLORS.some((c) => c.id === v)) out[part] = v as MeasureColorId;
    }
  } catch { /* unreadable or blocked: defaults */ }
  return out;
}

let colors: MeasureColors | null = null;
export function setMeasureColor(part: MeasureColorPart, id: MeasureColorId): void {
  colors = { ...(colors ??= loadMeasureColors()), [part]: id };
  try { localStorage.setItem(COLOR_KEY, JSON.stringify(colors)); } catch { /* Private mode: the choice lasts for this visit. */ }
  listeners.forEach((l) => l());
}

export function useMeasureColors(): MeasureColors {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => (colors ??= loadMeasureColors()),
    () => (colors ??= loadMeasureColors()),
  );
}

/** 還原預設：all three colours back to DEFAULT_MEASURE_COLORS, and the saved choice dropped. */
export function resetMeasureColors(): void {
  colors = { ...DEFAULT_MEASURE_COLORS };
  try { localStorage.removeItem(COLOR_KEY); } catch { /* nothing kept anyway */ }
  listeners.forEach((l) => l());
}
