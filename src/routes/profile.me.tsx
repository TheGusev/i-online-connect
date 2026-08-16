import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useState } from "react";

import type { MyProfile, PrivacySettings, ProfileIntent } from "@/api";
import { Card, Chip, Select } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { IntentCard, intentOptions } from "@/features/profile/components/IntentCard";
import { InlineEditable, InlineTextField } from "@/features/profile/components/InlineEdit";
import { MediaCarousel } from "@/features/profile/components/MediaCarousel";
import { PrivacySection } from "@/features/profile/components/PrivacySection";
import { ProfileSection } from "@/features/profile/components/ProfileSection";
import { TagEditor } from "@/features/profile/components/TagEditor";
import { TrustBadgeExplained } from "@/features/profile/components/TrustBadgeExplained";
import { TrustStatsSection } from "@/features/profile/components/TrustStatsSection";
import { VerificationSection } from "@/features/profile/components/VerificationSection";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/hooks";

export const Route = createFileRoute("/profile/me")({
  head: () => ({
    meta: [
      { title: "Мой профиль — Я Онлайн" },
      {
        name: "description",
        content:
          "Своя личная страница в «Я Онлайн»: инлайн-редактирование, настройки приватности, статус верификации и личная статистика доверия.",
      },
      { property: "og:title", content: "Мой профиль — Я Онлайн" },
      {
        property: "og:description",
        content: "Редактируй свою страницу, управляй приватностью и видимостью профиля.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyProfilePage,
});

function MyProfilePage() {
  const { data, isPending, isError } = useMyProfile();
  const update = useUpdateMyProfile();

  const [editingIntent, setEditingIntent] = useState(false);
  const [intentDraft, setIntentDraft] = useState<ProfileIntent>("serious");
  const [intentNote, setIntentNote] = useState("");

  const patch = (next: Partial<MyProfile>) => update.mutate(next);
  const patchPrivacy = (next: Partial<PrivacySettings>) => {
    if (!data) return;
    patch({ privacy: { ...data.privacy, ...next } });
  };

  return (
    <AppShell>
      {isPending ? <p className="text-sm text-muted-foreground">Загружаем профиль…</p> : null}
      {isError ? <p className="text-sm text-destructive">Не удалось открыть профиль</p> : null}

      {data ? (
        <div className="pb-8">
          <Reveal>
            <MediaCarousel media={data.media} name={data.name} />
          </Reveal>

          <Reveal delay={80} as="header" className="mt-7">
            <InlineTextField
              label="Как тебя зовут"
              value={data.name}
              saving={update.isPending}
              onSave={(name) => patch({ name })}
              renderValue={(name) => (
                <h1 className="text-4xl font-bold tracking-tight">
                  {name}, {data.age}
                </h1>
              )}
            />
            <div className="mt-2">
              <InlineTextField
                label="Город"
                value={data.city}
                saving={update.isPending}
                onSave={(city) => patch({ city })}
                renderValue={(city) => (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-4" aria-hidden="true" />
                    {city}
                  </p>
                )}
              />
            </div>
            <div className="mt-4">
              <TrustBadgeExplained level={data.trustLevel} details={data.trust} />
            </div>
          </Reveal>

          <ProfileSection title="О себе" delay={60}>
            <InlineTextField
              label="Расскажи о себе"
              value={data.bio}
              multiline
              saving={update.isPending}
              onSave={(bio) => patch({ bio })}
              renderValue={(bio) => (
                <p className="max-w-2xl text-base leading-loose text-muted-foreground">{bio}</p>
              )}
            />
          </ProfileSection>

          <ProfileSection title="Ищу" delay={60}>
            <InlineEditable
              editing={editingIntent}
              saving={update.isPending}
              onEdit={() => {
                setIntentDraft(data.intent);
                setIntentNote(data.intentNote);
                setEditingIntent(true);
              }}
              onCancel={() => setEditingIntent(false)}
              onSave={() => {
                patch({ intent: intentDraft, intentNote: intentNote.trim() });
                setEditingIntent(false);
              }}
              view={<IntentCard intent={data.intent} note={data.intentNote} />}
              form={
                <div className="space-y-3">
                  <Select
                    label="Намерение"
                    value={intentDraft}
                    options={intentOptions}
                    onChange={(event) => setIntentDraft(event.target.value as ProfileIntent)}
                  />
                  <InlineTextFieldless
                    value={intentNote}
                    onChange={setIntentNote}
                  />
                </div>
              }
            />
          </ProfileSection>

          <ProfileSection title="Интересы" delay={60}>
            <TagEditor
              items={data.interests}
              label="Новый интерес"
              addLabel="Добавить"
              saving={update.isPending}
              onSave={(interests) => patch({ interests })}
            />
          </ProfileSection>

          <ProfileSection title="Что важно" delay={60}>
            <TagEditor
              items={data.values}
              label="Что для тебя важно"
              addLabel="Добавить"
              variant="outline"
              saving={update.isPending}
              onSave={(values) => patch({ values })}
            />
          </ProfileSection>

          <ProfileSection
            title="Настройки приватности"
            description="Ты решаешь, что видно другим и кто может к тебе обратиться."
            delay={60}
          >
            <PrivacySection privacy={data.privacy} onChange={patchPrivacy} />
          </ProfileSection>

          <ProfileSection
            title="Верификация"
            description="Подтверждение по видео — основа доверия в «Я Онлайн»."
            delay={60}
          >
            <VerificationSection
              status={data.verification}
              onStart={() => patch({ verification: "pending" })}
            />
          </ProfileSection>

          <ProfileSection
            title="Только для тебя"
            description="Личная статистика доверия — её не видит никто, кроме тебя."
            delay={60}
          >
            <TrustStatsSection stats={data.stats} />
          </ProfileSection>

          <Reveal as="footer" className="mt-12">
            <Card className="p-5 text-sm leading-relaxed text-muted-foreground">
              Это твоя личная страница, а не витрина. Здесь нет рейтингов и мест в списке — только
              то, что ты сам решил рассказать. И <Chip size="sm">интересы</Chip> помогают AI искать
              людей рядом по смыслу.
            </Card>
          </Reveal>
        </div>
      ) : null}
    </AppShell>
  );
}

/** Свободный текст для намерения внутри формы. */
function InlineTextFieldless({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <textarea
      rows={3}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Пара слов о том, кого ты ищешь"
      placeholder="Пара слов о том, кого ты ищешь"
      className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/12"
    />
  );
}
