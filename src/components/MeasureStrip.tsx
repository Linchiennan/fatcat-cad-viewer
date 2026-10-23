import type { MeasurementSettings } from "../viewer/measurementGeometry";
import { resultValue, type MeasureResult } from "../viewer/measureResults";
import { fixedNumber } from "../viewer/measureFormat";
import { GearIcon } from "./Icons";
import "./measureStrip.css";
import { useI18n, type TranslationKey } from "../i18n/translations";

/** Glove mode: one compact line of result above the measuring tools; 設定 opens the full panel. */
export function MeasureStrip({ settings, format, onDetail, unitAssumed, decimals = 1 }: {
  settings: MeasurementSettings;
  decimals?: number;
  unitAssumed?: boolean;
  format(value: number, area?: boolean): string;
  onDetail(): void;
}) {
  const { t } = useI18n();
  const mode = settings.mode === "object" ? "distance" : settings.mode;
  const current: MeasureResult = { mode, points: settings.points };
  const value = resultValue(current);
  const shown = value === null ? null : mode === "angle" ? `${fixedNumber(value, decimals)}°` : format(value, mode === "area");
  // Just the result (e.g. 距離 269.9 cm); the details live in the full panel behind the gear.
  // Before the first result it says how to measure.
  return (
    <section className="measure-strip" aria-label={t("strip.label")} role="status">
      <div className="measure-strip-main">
        <span className="measure-strip-mode">{t(`measure.historyName.${mode}` as TranslationKey)}</span>
        <strong>{shown ?? "—"}</strong>
        {shown ? null : <span className="measure-strip-sub">{t(`strip.hint.${mode}` as TranslationKey)}{unitAssumed ? t("strip.assumedCm") : ""}</span>}
      </div>
      <button type="button" className="measure-settings-btn" aria-label={t("measure.settingsLabel")} title={t("measure.settingsLabel")} onClick={onDetail}><GearIcon /></button>
    </section>
  );
}
