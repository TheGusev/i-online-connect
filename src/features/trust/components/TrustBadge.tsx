import { useTranslation } from "react-i18next";

import type { TrustLevel } from "@/api";

export function TrustBadge({ level, score }: { level: TrustLevel; score?: number }) {
  const { t } = useTranslation();

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {t(`trust.levels.${level}`)}
      {typeof score === "number" ? <span className="font-medium">{score}</span> : null}
    </span>
  );
}
