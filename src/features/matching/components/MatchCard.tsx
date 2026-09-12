import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, MapPin, PenLine, PlayCircle, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DailyMatch } from "@/api";
import { Button, Chip, MediaImage } from "@/components/ds";
import { TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";

/**
 * Карточка совпадения: компактная раскладка для телефона.
 *
 * Все действия — в одном ряду: «Написать» (главное), «На потом» и крестик
 * «Пропустить» у правого края. Пустые блоки (цитата, объяснение AI) не
 * рендерятся вовсе, иначе на экране висят пустые плашки.
 */
export function MatchCard({
  match,
  saved,
  onSkip,
  onWrite,
  onSave,
}: {
  match: DailyMatch;
  saved: boolean;
  onSkip: () => void;
  onWrite: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const shared = new Set(match.sharedInterests);
  const quote = match.quote?.trim();
  const explanation = match.aiExplanation?.trim();
  const interests = match.interests.slice(0, 4);
  const restCount = Math.max(0, match.interests.length - interests.length);

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-shadow duration-300 hover:shadow-lift">
      <div className="relative">
        <MediaImage
          src={match.photoUrl}
          alt={match.name}
          className="aspect-[4/5] w-full object-cover sm:aspect-[3/2]"
          wrapperClassName="aspect-[4/5] sm:aspect-[3/2]"
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {match.hasVideo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur">
              <PlayCircle className="size-3.5" aria-hidden="true" />
              {t("feed.videoIntro")}
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-full bg-card/95 shadow-soft backdrop-blur">
            <TrustBadge level={badgeLevel(match.trustLevel)} size="sm" withTooltip />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 via-foreground/25 to-transparent p-4">
          <Link
            to="/profile/$id"
            params={{ id: match.id }}
            className="text-xl font-bold text-primary-foreground underline-offset-4 hover:underline sm:text-2xl"
          >
            {match.name}, {match.age}
          </Link>
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-primary-foreground/85">
            <MapPin className="size-3.5" aria-hidden="true" />
            {match.city}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-3.5 sm:p-5">
        {quote ? (
          <blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-foreground sm:text-base">
            «{quote}»
          </blockquote>
        ) : null}

        {interests.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {interests.map((interest) => (
              <li key={interest}>
                <Chip
                  size="sm"
                  variant={shared.has(interest) ? "intent" : "outline"}
                  className={shared.has(interest) ? "border-primary/40 font-semibold" : ""}
                >
                  {shared.has(interest) ? <Sparkles className="size-3" aria-hidden="true" /> : null}
                  {interest}
                </Chip>
              </li>
            ))}
            {restCount > 0 ? (
              <li>
                <Chip size="sm" variant="outline">
                  +{restCount}
                </Chip>
              </li>
            ) : null}
          </ul>
        ) : null}

        {explanation ? (
          <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{explanation}</span>
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={onWrite} className="flex-1 sm:flex-none">
            <PenLine className="size-4" aria-hidden="true" />
            {t("feed.write")}
          </Button>
          <Button
            variant="secondary"
            onClick={onSave}
            aria-pressed={saved}
            className="shrink-0 px-4"
          >
            {saved ? (
              <BookmarkCheck className="size-4" aria-hidden="true" />
            ) : (
              <Bookmark className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{saved ? t("feed.saved") : t("feed.save")}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSkip}
            title={t("feed.skip")}
            aria-label={t("feed.skip")}
            className="ml-auto size-10 border border-border text-muted-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}
