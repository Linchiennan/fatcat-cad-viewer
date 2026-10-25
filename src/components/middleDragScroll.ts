import { useEffect, type RefObject } from "react";

type Options = {
  /** Mouse buttons that drag (0 = left, 1 = middle). Default: middle only, so left clicks keep working. */
  buttons?: number[];
  /** Called when a drag ends, e.g. to snap to the nearest page. */
  onEnd?(el: HTMLElement): void;
};

/**
 * Lets a mouse scroll a horizontally overflowing row by holding a button and dragging, the way a finger
 * swipes it on a phone. Touch and pen are left alone (they scroll natively). The middle button's browser
 * auto-scroll circle is suppressed, and a drag never also clicks the item it ends on.
 */
export function useMouseDragScroll(ref: RefObject<HTMLElement | null>, { buttons = [1], onEnd }: Options = {}): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let drag: { id: number; x: number; left: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !buttons.includes(e.button)) return;
      if (e.button === 1) e.preventDefault(); // no auto-scroll circle
      drag = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) <= 4) return;
      if (!drag.moved) {
        drag.moved = true;
        el.setPointerCapture?.(e.pointerId);
        el.classList.add("dragging");
      }
      el.scrollLeft = drag.left - dx;
    };
    const up = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const moved = drag.moved;
      drag = null;
      el.classList.remove("dragging");
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (!moved) return;
      onEnd?.(el);
      const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 300);
    };
    // Middle mouse down also starts the browser's auto-scroll on some platforms; and its auxclick may open links.
    const noAuto = (e: MouseEvent) => { if (e.button === 1 && buttons.includes(1)) e.preventDefault(); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("mousedown", noAuto);
    el.addEventListener("auxclick", noAuto);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("mousedown", noAuto);
      el.removeEventListener("auxclick", noAuto);
    };
    // The options are fixed per element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
