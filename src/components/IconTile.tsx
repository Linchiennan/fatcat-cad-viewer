import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/translations";

export const LONG_PRESS_MS = 1000;
export const TIP_HIDE_MS = 1600;

/**
 * The app's simple, icon-first button: a big icon with a caption of at most two characters. The full
 * name is the accessible name; holding the button for a second shows the name and how to use it
 * without running it. A disabled tile stays pressable for the explanation (aria-disabled) but never runs.
 */
export function IconTile({ name, label, tip, pressed, expanded, disabled, className = "icon-tile", onClick, children }: {
  name: string; label: string; tip: string; pressed?: boolean; expanded?: boolean; disabled?: boolean; className?: string;
  onClick(): void; children: ReactNode;
}) {
  const { t } = useI18n();
  const [showTip, setShowTip] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hide = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const start = () => {
    held.current = false;
    window.clearTimeout(timer.current);
    window.clearTimeout(hide.current);
    timer.current = window.setTimeout(() => { held.current = true; setShowTip(true); }, LONG_PRESS_MS);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    if (held.current) { window.clearTimeout(hide.current); hide.current = window.setTimeout(() => setShowTip(false), TIP_HIDE_MS); }
  };
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(hide.current); }, []);
  return (
    <button type="button" className={`${className} has-tip`} aria-label={name} title={`${name}${t("tip.joiner")}${tip}`}
      aria-pressed={pressed} aria-expanded={expanded} aria-disabled={disabled || undefined}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (held.current) { held.current = false; return; } if (!disabled) onClick(); }}>
      {children}<span>{label}</span>
      {showTip ? <span className="glove-tip" role="tooltip"><strong>{name}</strong>{tip}</span> : null}
    </button>
  );
}
