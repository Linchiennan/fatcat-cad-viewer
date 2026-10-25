import { useRef, type HTMLAttributes } from "react";
import { useMouseDragScroll } from "./middleDragScroll";

/** A horizontally scrolling row (div or nav) that a mouse can also drag with the middle button. */
export function DragRow({ as = "div", ...props }: HTMLAttributes<HTMLElement> & { as?: "div" | "nav" }) {
  const ref = useRef<HTMLElement>(null);
  useMouseDragScroll(ref);
  const Tag = as;
  return <Tag ref={ref as never} {...props} />;
}
