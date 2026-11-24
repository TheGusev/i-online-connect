import { useEffect, useRef } from "react";
import { StoryContour } from "@/features/stories/StoryContour";

export function PostContour() {
  const progress = useRef<SVGPathElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let frame = 0;
    const paint = (now: number) => {
      const amount = reduced ? 100 : Math.min(100, (now - started) / 1800 * 100);
      if (progress.current) {
        progress.current.style.strokeDashoffset = String(100 - amount);
        progress.current.dataset["progressValue"] = String(amount);
      }
      if (amount < 100) frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <StoryContour kind="post" progressRef={progress} />;
}
