import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AiBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-in gap-3 fade-in slide-in-from-bottom-2 duration-500">
      <span
        className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground"
        style={{ background: "var(--gradient-verified)" }}
        aria-hidden="true"
      >
        <Sparkles className="size-4" />
      </span>
      <div
        className="max-w-[85%] rounded-3xl rounded-tl-lg bg-card px-5 py-4 text-[15px] leading-relaxed"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-in justify-end fade-in slide-in-from-bottom-2 duration-500">
      <div className="max-w-[85%] rounded-3xl rounded-tr-lg bg-primary px-5 py-3 text-[15px] leading-relaxed text-primary-foreground">
        {children}
      </div>
    </div>
  );
}

export function TypingBubble() {
  const { t } = useTranslation();
  return (
    <AiBubble>
      <span className="sr-only">{t("onboarding.chat.typing")}</span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 animate-bounce rounded-full bg-muted-foreground/50"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </span>
    </AiBubble>
  );
}
