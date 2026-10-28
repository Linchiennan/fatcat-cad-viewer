// Interface depth style (用戶 2026-10-28): 原始 plus three 3D looks (glass, layered, metal), picked from the switch left of 繁中｜EN on the home
// page and kept on this device. The looks live in components/ui3d.css under :root[data-ui-style]; 原始 sets nothing.
import { useState } from "react";
import { useI18n } from "../i18n/translations";

// 用戶 2026-10-28：柔光、厚底不要（存過這兩種的裝置回到原始）
export const UI_STYLES = ["plain", "glass", "layered", "metal"] as const;
export type UiStyle = (typeof UI_STYLES)[number];
const KEY = "fatcat-ui-style";

export function readUiStyle(): UiStyle {
  try { const v = localStorage.getItem(KEY); return (UI_STYLES as readonly string[]).includes(v ?? "") ? (v as UiStyle) : "plain"; } catch { return "plain"; }
}

export function applyUiStyle(style: UiStyle): void {
  const root = document.documentElement;
  if (style === "plain") delete root.dataset.uiStyle; else root.dataset.uiStyle = style;
}

/** Remembered on this device; storage refused (private mode) still applies for this visit. */
export function saveUiStyle(style: UiStyle): void {
  applyUiStyle(style);
  try { localStorage.setItem(KEY, style); } catch { /* applied, just not kept */ }
}

/** Compact pill beside the language switch: one select, two-character names. */
export function UiStyleSwitch() {
  const { t } = useI18n();
  const [style, setStyle] = useState<UiStyle>(readUiStyle);
  return (
    <label className="ui-style-switch" title={t("uiStyle.tip")}>
      <svg className="ui-style-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 21 8v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8" /></svg>
      <select aria-label={t("uiStyle.label")} value={style} onChange={(e) => { const v = e.target.value as UiStyle; setStyle(v); saveUiStyle(v); }}>
        {UI_STYLES.map((s) => <option key={s} value={s}>{t(`uiStyle.${s}`)}</option>)}
      </select>
    </label>
  );
}

/** Gradients the glass / layered / metal looks paint the cat ears with (an SVG fill can only point at defs in the page).
 * Each is the top 18 % of one head-long gradient over the tile colour #1d3343, so the ears run on into the button
 * (glass: white 22 → 15.5 %, layered: 12 → 7.7 %, metal: 35 → 24.9 %) — see the .glove-ear rules in ui3d.css. */
export function UiStyleDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fc3d-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4f5a66" /><stop offset="1" stopColor="#404f5c" /></linearGradient>
        <linearGradient id="fc3d-layer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#384b59" /><stop offset="1" stopColor="#2f4352" /></linearGradient>
        <linearGradient id="fc3d-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6c7a85" /><stop offset="1" stopColor="#556572" /></linearGradient>
      </defs>
    </svg>
  );
}
