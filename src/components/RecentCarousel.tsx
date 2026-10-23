import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/**
 * Recent drawings as pages of two cards. Fingers swipe natively (scroll snap); on a computer, hold the
 * middle mouse button and drag sideways (like the middle-button pan on the drawing). Dots under the row show the page and can be tapped.
 * `label` names the dot group and `pageLabel(n)` each dot (defaults are Traditional Chinese).
 */
export function RecentCarousel({
  count, children, label = "最近開啟頁數", pageLabel = (n: number) => `第 ${n} 頁`,
}: { count: number; children: ReactNode; label?: string; pageLabel?: (page: number) => string }) {
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(count / 2));
  // One page = two cards plus the 10 px gap after them.
  const pageWidth = () => (row.current?.clientWidth ?? 0) + 10;

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, pageWidth())));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (p: number) => {
    const el = row.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(pages - 1, p)) * pageWidth(), behavior: "smooth" });
  };

  // Middle mouse button only: touch and pen already scroll the row natively, left click opens a card.
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 1 || !row.current) return;
    e.preventDefault(); // no browser auto-scroll circle
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, left: row.current.scrollLeft, moved: false };
    row.current.classList.add("dragging");
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = row.current;
    if (!d || !el) return;
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
    el.scrollLeft = d.left - (e.clientX - d.x);
  };
  const up = () => {
    const d = drag.current, el = row.current;
    if (!d || !el) return;
    el.classList.remove("dragging");
    goTo(Math.round(el.scrollLeft / Math.max(1, pageWidth())));
    // A drag must not also open the card it ended on.
    if (d.moved) {
      const swallow = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 300);
    }
    drag.current = null;
  };

  return (
    <>
      <div className="recent-list" ref={row} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onAuxClick={(e) => e.preventDefault()} onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}>
        {children}
      </div>
      {pages > 1 ? (
        <div className="recent-dots" role="tablist" aria-label={label}>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === page} aria-label={pageLabel(i + 1)} onClick={() => goTo(i)} />
          ))}
        </div>
      ) : null}
    </>
  );
}
