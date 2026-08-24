import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type HeadingTag = "h1" | "h2" | "h3";

/**
 * Заголовок с двумя эффектами: слова всплывают волной при появлении в вьюпорте
 * и по тексту бесконечно скользит тёплый градиент.
 */
export function WaveHeading({
  children,
  as: Tag = "h2",
  className,
  delay = 0,
  step = 70,
  gradient = true,
  id,
}: {
  children: ReactNode;
  as?: HeadingTag;
  className?: string;
  delay?: number;
  step?: number;
  gradient?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [visible, setVisible] = useState(false);

  const text = typeof children === "string" ? children : "";
  const words = text.split(/(\s+)/).filter((part) => part.length > 0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const classes = cn(className, gradient && "text-gradient-wave");

  // Не строка (например, JSX с иконкой) — отдаём как есть, только с градиентом.
  if (!text) {
    return (
      <Tag ref={ref} id={id} className={classes}>
        {children}
      </Tag>
    );
  }

  let wordIndex = 0;

  return (
    <Tag ref={ref} id={id} className={classes} aria-label={text}>
      <span aria-hidden="true">
        {words.map((part, i) => {
          if (/^\s+$/.test(part)) {
            return <span key={`s-${i}`}>{part}</span>;
          }
          const currentDelay = delay + wordIndex * step;
          wordIndex += 1;
          return (
            <span
              key={`w-${i}`}
              className={cn("wave-word", visible && "wave-word-in")}
              style={{ animationDelay: `${currentDelay}ms` }}
            >
              {part}
            </span>
          );
        })}
      </span>
    </Tag>
  );
}
