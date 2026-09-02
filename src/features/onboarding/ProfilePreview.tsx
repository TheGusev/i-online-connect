import { MapPin, Video, VideoOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Avatar, Chip, TrustBadge } from "@/components/ds";
import type { OnboardingDraft } from "@/api";

export function ProfilePreview({
  draft,
  photoUrl,
}: {
  draft: OnboardingDraft;
  photoUrl?: string | null;
}) {
  const { t } = useTranslation();
  const hasVideo = Boolean(draft.videoName);

  return (
    <div
      className="overflow-hidden rounded-3xl border border-border bg-card"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <div className="flex items-center gap-4 p-5" style={{ background: "var(--gradient-warm)" }}>
        <Avatar
          name={draft.name || "Профиль"}
          src={photoUrl ?? null}
          size="lg"
          verified={hasVideo}
        />

        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">
            {draft.name}
            {draft.age ? `, ${draft.age}` : ""}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden="true" />
            {draft.city}
            {draft.hideExactLocation ? " · только город" : ""}
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <TrustBadge level={hasVideo ? "confirmed" : "new"} />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {hasVideo ? (
              <Video className="size-3.5" aria-hidden="true" />
            ) : (
              <VideoOff className="size-3.5" aria-hidden="true" />
            )}
            {hasVideo ? t("onboarding.preview.video") : t("onboarding.preview.noVideo")}
          </span>
        </div>

        {draft.intent && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("onboarding.preview.intent")}
            </h3>
            <p className="mt-2">
              <Chip variant="intent">{t(`onboarding.s2.${draft.intent}`)}</Chip>
            </p>
          </section>
        )}

        {draft.about && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("onboarding.preview.about")}
            </h3>
            <p className="mt-2 leading-relaxed">{draft.about}</p>
          </section>
        )}

        {draft.interests.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("onboarding.preview.interests")}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.interests.map((item) => (
                <Chip key={item} size="sm">
                  {item}
                </Chip>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("onboarding.preview.values")}
          </h3>
          <dl className="mt-2 space-y-2 text-sm">
            {(["values", "joy", "dealbreakers"] as const).map((key) =>
              draft.values[key] ? (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{t(`onboarding.s6.${key}`)}</dt>
                  <dd className="leading-relaxed">{draft.values[key]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
