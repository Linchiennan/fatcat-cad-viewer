// Long press (用戶 2026-11-23：清單長按照片→全部刪除；長按放點→刪除全部定點): held still for `ms`, the action runs; a
// finger that moves is a scroll or a drag and cancels it; the click that ends a long press is not a tap.
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

/** How long a press is held before the long-press action. */
export const LONG_PRESS_MS = 550;

export function useLongPress<T>(onLong: (item: T) => void, ms = LONG_PRESS_MS) {
  const run = useRef(onLong);
  run.current = onLong;
  const state = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const stop = () => { if (state.current) window.clearTimeout(state.current.timer); };
  return {
    /** pointer handlers for one item */
    bind: (item: T) => ({
      onPointerDown: (e: ReactPointerEvent) => {
        stop();
        const s = { timer: 0, x: e.clientX, y: e.clientY, fired: false };
        s.timer = window.setTimeout(() => { s.fired = true; run.current(item); }, ms);
        state.current = s;
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const s = state.current;
        if (s && !s.fired && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) { stop(); state.current = null; }
      },
      onPointerUp: () => { const s = state.current; if (s && !s.fired) { stop(); state.current = null; } },
      onPointerCancel: () => { stop(); state.current = null; },
      onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    }),
    /** true (once) when this click only ends a long press */
    consumed: (): boolean => {
      const fired = !!state.current?.fired;
      if (fired) state.current = null;
      return fired;
    },
  };
}
