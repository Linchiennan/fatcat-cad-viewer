// Loading screen (T20 2.1-2.2): walking cat paw prints, file name, stage, progress and 取消. Owner: P4 group D.
import { useEffect, useRef, useState } from "react";
import type { LoadStage } from "../types/drawing";
import { useI18n } from "../i18n/translations";
import { stageKey } from "../app/shellText";

/** One paw print in a 24×24 box, toes up: four oval toe beans in an arc over a two-lobed pad. */
function PawPrint({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(70) scale(1.5) translate(-12 -12)`}>
      <ellipse cx="4.6" cy="10" rx="2.1" ry="2.8" transform="rotate(-26 4.6 10)" />
      <ellipse cx="9.2" cy="5.6" rx="2.2" ry="2.9" transform="rotate(-9 9.2 5.6)" />
      <ellipse cx="14.8" cy="5.6" rx="2.2" ry="2.9" transform="rotate(9 14.8 5.6)" />
      <ellipse cx="19.4" cy="10" rx="2.1" ry="2.8" transform="rotate(26 19.4 10)" />
      <path d="M12 10.6c4.1 0 7.3 3 7.3 6.6 0 2.9-2 4.4-4.2 4.4-1.4 0-2.1-.7-3.1-.7s-1.7.7-3.1.7c-2.2 0-4.2-1.5-4.2-4.4 0-3.6 3.2-6.6 7.3-6.6z" />
    </g>
  );
}

const STEPS: [number, number][] = [[16, 46], [44, 26], [74, 46], [102, 26]];

/** Four orange prints, low-high-low-high, appearing one after another (decorative). */
export function PawWalk() {
  return (
    <svg className="paw-walk" viewBox="0 0 120 64" aria-hidden="true" focusable="false">
      {STEPS.map(([x, y], i) => (
        <g key={i} className="paw-step" style={{ animationDelay: `${i * 0.25}s` }}><PawPrint x={x} y={y} /></g>
      ))}
    </svg>
  );
}

/** Minimum time a stage line stays on screen. The engine moves between stages in milliseconds near the end
 * (準備圖面 ↔ 準備文字 five times within 0.1 s on A06), which made the big line flicker (用戶 2026-10-28). */
export const STAGE_HOLD_MS = 700;

/** The latest stage, changing at most once per STAGE_HOLD_MS; a stage that is replaced while waiting is skipped. */
export function useSteadyStage(stage: LoadStage, hold = STAGE_HOLD_MS): LoadStage {
  const [shown, setShown] = useState(stage);
  const since = useRef(Date.now()); // the first stage also stays for the hold time
  useEffect(() => {
    if (stage === shown) return;
    const wait = Math.max(0, since.current + hold - Date.now());
    const timer = setTimeout(() => { since.current = Date.now(); setShown(stage); }, wait);
    return () => clearTimeout(timer);
  }, [stage, shown, hold]);
  return shown;
}

/** A known progress only once it has stayed known for `after` ms: the file read reports 14 → 100 % within a few ms and
 * goes back to unknown, which flashed a full bar and "100%" for one frame. */
export const PROGRESS_AFTER_MS = 300;
export function useSteadyProgress(progress: number | null, after = PROGRESS_AFTER_MS): number | null {
  const [ready, setReady] = useState(false);
  const known = progress !== null;
  useEffect(() => {
    if (!known) { setReady(false); return; }
    const timer = setTimeout(() => setReady(true), after);
    return () => clearTimeout(timer);
  }, [known, after]);
  return ready ? progress : null;
}

export function LoadingScreen({ stage, progress: rawProgress, fileName, onCancel }: {
  stage: LoadStage;
  /** 0..1, or null when unknown. */
  progress: number | null;
  fileName: string;
  onCancel(): void;
}) {
  const { t } = useI18n();
  const label = t(stageKey(useSteadyStage(stage)));
  const progress = useSteadyProgress(rawProgress);
  const percent = progress === null ? null : Math.round(progress * 100);
  return (
    <section className="loading-screen" aria-live="polite">
      <PawWalk />
      <p className="loading-name">{fileName}</p>
      <h1 className="loading-stage">{label}</h1>
      <div className={percent === null ? "loading-bar is-unknown" : "loading-bar"} role="progressbar"
        aria-valuenow={percent ?? undefined} aria-valuemax={100} aria-valuemin={0} aria-label={label}>
        <span style={progress === null ? undefined : { transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
      </div>
      {/* the line keeps its place when the percent is unknown, so nothing below jumps up and down */}
      <p className={percent === null ? "loading-percent is-empty" : "loading-percent"} aria-hidden={percent === null ? true : undefined}>{percent === null ? " " : `${percent}%`}</p>
      <button type="button" className="loading-cancel" onClick={onCancel}>{t("action.cancel")}</button>
    </section>
  );
}
