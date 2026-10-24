import { useEffect, useRef, useState } from "react";

const FADE_MS = 160;
const HOLD_MS = 1800;

/**
 * Top-of-screen note saying what a measuring tap snapped to (已點到端點, 已點到四分點 …). Every new
 * snap fades the old note out and the new one in, so two snaps of the same kind in a row still show
 * as two separate events.
 */
export function SnapToast({ text, serial, previewText }: { text: string | null; serial: number; previewText?: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    for (const t of timers.current) clearTimeout(t);
    if (!text) { setShown(null); setVisible(false); return; }
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const showNew = () => { setShown(text); setVisible(true); later(() => setVisible(false), HOLD_MS); };
    timers.current = [];
    if (visible) { setVisible(false); later(showNew, FADE_MS); } else showNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, text]);
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);
  // A live aim is not a confirmed tap: never time it out or show the last tap
  // while the pointer is currently outside the snapping tolerance.
  if (previewText !== undefined) return previewText ? <div className="snap-toast on" role="status" aria-live="polite">{previewText}</div> : null;
  if (!shown) return null;
  return <div className={`snap-toast${visible ? " on" : ""}`} role="status" aria-live="polite">{shown}</div>;
}
