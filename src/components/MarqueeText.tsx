import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/**
 * One line of text; when it is wider than its box it scrolls slowly left and back (marquee) so a long
 * file name can be read in full. Short text stays still.
 */
export function MarqueeText({ text }: { text: string }) {
  const box = useRef<HTMLElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const b = box.current, i = inner.current;
      setShift(b && i ? Math.max(0, i.scrollWidth - b.clientWidth) : 0);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && box.current) ro.observe(box.current);
    return () => ro?.disconnect();
  }, [text]);
  // About 40 px per second, with pauses at both ends (see the keyframes).
  const style = shift > 0 ? ({ "--marquee-shift": `-${shift}px`, "--marquee-time": `${Math.max(4, shift / 40 + 3)}s` } as CSSProperties) : undefined;
  return (
    <strong className={shift > 0 ? "marquee scrolling" : "marquee"} ref={box} title={text}>
      <span ref={inner} style={style}>{text}</span>
    </strong>
  );
}
