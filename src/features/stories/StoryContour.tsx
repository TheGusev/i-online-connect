import { useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";

export function StoryContour({
  progressRef,
  kind = "story",
}: {
  progressRef: RefObject<SVGPathElement | null>;
  kind?: "story" | "post";
}) {
  const svg = useRef<SVGSVGElement>(null);
  const gradient = useId();
  const [size, setSize] = useState({ width: 100, height: 100 });

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setSize(old => old.width === width && old.height === height
          ? old : { width, height });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const w = Math.max(8, size.width);
  const h = Math.max(8, size.height);
  const r = Math.min(18, w / 4, h / 4);
  const d = [
    `M ${w / 2} 2 H ${w - r}`,
    `Q ${w - 2} 2 ${w - 2} ${r}`,
    `V ${h - r} Q ${w - 2} ${h - 2} ${w - r} ${h - 2}`,
    `H ${r} Q 2 ${h - 2} 2 ${h - r}`,
    `V ${r} Q 2 2 ${r} 2 H ${w / 2}`,
  ].join(" ");

  return (
    <svg ref={svg} aria-hidden="true"
      data-story-contour={kind === "story" ? "" : undefined}
      data-post-contour={kind === "post" ? "" : undefined}
      className="pointer-events-none absolute inset-0 z-40 size-full"
      viewBox={`0 0 ${w} ${h}`} fill="none">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#ff4fa3" />
          <stop offset=".5" stopColor="#ffe4f1" />
          <stop offset="1" stopColor="#ff4fa3" />
        </linearGradient>
      </defs>
      <path d={d} stroke="rgba(255,255,255,.16)" strokeWidth="2" />
      <path ref={progressRef} d={d} pathLength={100}
        stroke={`url(#${gradient})`} strokeWidth="3"
        strokeLinecap="round" strokeDasharray="100 100"
        strokeDashoffset={100} data-story-progress={kind === "story" ? "active" : undefined}
        data-progress-value={0} />
    </svg>
  );
}
