// Hold a camera button for a second to read its name and use (用戶 2026-11-24：工程相機的說明在手機上看不到, the
// `title` text only showed under a resting mouse). Same bubble and timing as the viewer's IconTile; a mouse resting on
// it for a second shows it too. The click that ends a hold does nothing (a <label> does not open its file picker).
// The bubble floats over the page (a portal), so the camera panel's own scrolling box never clips it: above the
// button, or to its left when the phone is sideways and the panel is a column on the right.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { LONG_PRESS_MS, TIP_HIDE_MS } from "../components/IconTile";

const GAP = 10, EDGE = 8;

/** Put a shown bubble next to its button, inside the screen. Exported for the check. */
export function placeTip(tip: HTMLElement, at: DOMRect, vw = window.innerWidth, vh = window.innerHeight): void {
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const sideways = vw > vh && vh <= 600;
  let left: number, top: number;
  if (sideways || at.top - GAP - h < EDGE) {
    // to the left (or right when there is no room on the left), centred on the button's height
    left = at.left - GAP - w >= EDGE ? at.left - GAP - w : at.right + GAP;
    top = at.top + at.height / 2 - h / 2;
  } else {
    left = at.left + at.width / 2 - w / 2;
    top = at.top - GAP - h;
  }
  tip.style.left = `${Math.round(Math.min(Math.max(EDGE, left), vw - EDGE - w))}px`;
  tip.style.top = `${Math.round(Math.min(Math.max(EDGE, top), vh - EDGE - h))}px`;
}

export function useHoldTip() {
  const [shown, setShown] = useState<{ key: string; at: DOMRect } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hide = useRef<number | undefined>(undefined);
  const hover = useRef<number | undefined>(undefined);
  const held = useRef<string | null>(null);
  const at = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => { window.clearTimeout(timer.current); window.clearTimeout(hide.current); window.clearTimeout(hover.current); }, []);
  const later = (key: string) => { window.clearTimeout(hide.current); hide.current = window.setTimeout(() => setShown((s) => (s?.key === key ? null : s)), TIP_HIDE_MS); };
  const bind = (key: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      held.current = null; at.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(hover.current); // a press is not a resting mouse
      const el = e.currentTarget as HTMLElement;
      window.clearTimeout(timer.current); window.clearTimeout(hide.current);
      timer.current = window.setTimeout(() => { held.current = key; setShown({ key, at: el.getBoundingClientRect() }); }, LONG_PRESS_MS);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      // a finger that moves is a scroll, not a hold
      if (at.current && Math.hypot(e.clientX - at.current.x, e.clientY - at.current.y) > 10) { window.clearTimeout(timer.current); at.current = null; }
    },
    onPointerUp: () => { window.clearTimeout(timer.current); if (held.current === key) later(key); },
    onPointerCancel: () => { window.clearTimeout(timer.current); if (held.current === key) later(key); },
    onPointerEnter: (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = e.currentTarget as HTMLElement;
      window.clearTimeout(hover.current);
      hover.current = window.setTimeout(() => setShown({ key, at: el.getBoundingClientRect() }), LONG_PRESS_MS);
    },
    onPointerLeave: (e: ReactPointerEvent) => {
      window.clearTimeout(timer.current);
      if (e.pointerType === "mouse") { window.clearTimeout(hover.current); setShown((s) => (s?.key === key ? null : s)); }
      else if (held.current === key) later(key);
    },
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
    onClickCapture: (e: ReactMouseEvent) => {
      if (held.current === key) { held.current = null; e.preventDefault(); e.stopPropagation(); return; }
      // a real click: no bubble left behind for a button the click may take off the screen (the resting-mouse one
      // fired after 照片 opened the list and stayed up)
      window.clearTimeout(hover.current); window.clearTimeout(timer.current); setShown(null);
    },
  });
  const tip = (key: string, name: string, text: string) => (shown?.key === key
    ? createPortal(<span ref={(el) => { if (el) placeTip(el, shown.at); }} className="glove-tip camera-hold-tip" role="tooltip"><strong>{name}</strong>{text}</span>, document.body)
    : null);
  return { bind, tip };
}
