// Shared dialog shell for the library screens (T11 2.11). Owner: P4 group A.
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

/** Focus the first control on open, give focus back on close. */
function useDialogFocus(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled]), select, [tabindex]:not([tabindex='-1'])");
    first?.focus();
    return () => previous?.focus?.();
  }, [ref]);
}

/** Tab / Shift+Tab stay inside the dialog. */
function trapTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), select:not([disabled])"));
  if (items.length === 0) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Modal box over a dimmed backdrop; tapping the backdrop cancels. */
export function Dialog({ className, label, role = "dialog", onCancel, children }: {
  className: string; label: string; role?: "dialog" | "alertdialog"; onCancel(): void; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box);
  return (
    <div className="lib-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={className} role={role} aria-modal="true" aria-label={label} ref={box} onKeyDown={trapTab}>
        {children}
      </div>
    </div>
  );
}
