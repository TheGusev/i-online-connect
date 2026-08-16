import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, MapPin, PlayCircle, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DailyMatch } from "@/api";
import { Button, Chip } from "@/components/ds";
import { TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";

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

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition-shadow duration-300 hover:shadow-lift">
      <div className="relative">
        <img
          src={match.photoUrl}
          alt={match.name}
          width={640}
          height={800}
          loading="lazy"
          className="h-72 w-full object-cover sm:h-96"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/75 via-foreground/20 to-transparent p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Link
                to="/profile/$id"
                params={{ id: match.id }}
                className="text-2xl font-bold text-primary-foreground underline-offset-4 hover:underline"
              >
                {match.name}, {match.age}
              </Link>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary-foreground/85">
                <MapPin className="size-3.5" aria-hidden="true" />
                {match.city}
              </p>
            </div>
            <span className="rounded-full bg-card/95 shadow-soft backdrop-blur">
              <TrustBadge level={badgeLevel(match.trustLevel)} size="sm" withTooltip />
            </span>
          </div>
        </div>
        {match.hasVideo ? (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
            <PlayCircle className="size-3.5" aria-hidden="true" />
            {t("feed.videoIntro")}
          </span>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        <blockquote className="border-l-2 border-primary/40 pl-3 text-base leading-relaxed text-foreground">
          «{match.quote}»
        </blockquote>

        <ul className="flex flex-wrap gap-2">
          {match.interests.slice(0, 5).map((interest) => (
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
        </ul>

        <div className="rounded-2xl bg-gradient-warm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("feed.aiExplanation")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">{match.aiExplanation}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onWrite}>
            {t("feed.write")}
          </Button>
          <Button variant="secondary" onClick={onSave}>
            {saved ? (
              <BookmarkCheck className="size-4" aria-hidden="true" />
            ) : (
              <Bookmark className="size-4" aria-hidden="true" />
            )}
            {saved ? t("feed.saved") : t("feed.save")}
          </Button>
          <Button variant="ghost" onClick={onSkip} className="ml-auto text-muted-foreground">
            <X className="size-4" aria-hidden="true" />
            {t("feed.skip")}
          </Button>
        </div>
      </div>
    </article>
  );
}
