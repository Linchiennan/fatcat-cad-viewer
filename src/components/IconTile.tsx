import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

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
  // A mouse resting on the tile for a second shows the same name + use (desktop has no long press); leaving hides it.
  const hover = useRef<number | undefined>(undefined);
  const enter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(hover.current);
    hover.current = window.setTimeout(() => setShowTip(true), LONG_PRESS_MS);
  };
  const leave = (e: ReactPointerEvent) => {
    stop();
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(hover.current);
    window.clearTimeout(hide.current);
    setShowTip(false);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(hide.current); window.clearTimeout(hover.current); }, []);
  return (
    // No native title: on desktop it popped a second, plain tooltip next to ours. The use stays readable as the description.
    <button type="button" className={`${className} has-tip`} aria-label={name} aria-description={tip}
      aria-pressed={pressed} aria-expanded={expanded} aria-disabled={disabled || undefined}
      onPointerDown={start} onPointerUp={stop} onPointerEnter={enter} onPointerLeave={leave} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (held.current) { held.current = false; return; } if (!disabled) onClick(); }}>
      {children}<span>{label}</span>
      {showTip ? <span className="glove-tip" role="tooltip"><strong>{name}</strong>{tip}</span> : null}
    </button>
  );
}
