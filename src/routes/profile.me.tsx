import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { MyProfile, PrivacySettings, ProfileIntent } from "@/api";
import { Avatar, Card, Chip, Select } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { IntentCard, intentOptions } from "@/features/profile/components/IntentCard";
import { InlineEditable, InlineTextField } from "@/features/profile/components/InlineEdit";
import { MediaManager } from "@/features/profile/components/MediaManager";
import { PrivacySection } from "@/features/profile/components/PrivacySection";
import { ProfileCollapseToggle } from "@/features/profile/components/ProfileCollapseToggle";
import { ProfileSection } from "@/features/profile/components/ProfileSection";
import { TagEditor } from "@/features/profile/components/TagEditor";
import { TrustBadgeExplained } from "@/features/profile/components/TrustBadgeExplained";
import { TrustStatsSection } from "@/features/profile/components/TrustStatsSection";
import { VerificationSection } from "@/features/profile/components/VerificationSection";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/hooks";
import { useProfileCollapse } from "@/features/profile/hooks/useProfileCollapse";

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
  const navigate = useNavigate();
  const { collapsed, toggle } = useProfileCollapse();

  const [editingIntent, setEditingIntent] = useState(false);
  const [intentDraft, setIntentDraft] = useState<ProfileIntent>("serious");
  const [intentNote, setIntentNote] = useState("");

  const primaryPhoto =
    data?.media.find((item) => item.kind === "photo" && item.isPrimary) ??
    data?.media.find((item) => item.kind === "photo");

  const patch = (next: Partial<MyProfile>) => update.mutate(next);
  const patchPrivacy = (next: Partial<PrivacySettings>) => {
    if (!data) return;
    patch({ privacy: { ...data.privacy, ...next } });
    if (next.visibleInFeed === false) {
      toast("Твой профиль временно скрыт из ленты", {
        description: "Тебя не будет в дневных подборках. Диалоги и Spaces работают как обычно.",
      });
    }
    if (next.visibleInFeed === true) {
      toast.success("Профиль снова в подборках");
    }
  };

  return (
    <AppShell>
      {isPending ? <p className="text-sm text-muted-foreground">Загружаем профиль…</p> : null}
      {isError ? <p className="text-sm text-destructive">Не удалось открыть профиль</p> : null}

      {data ? (
        <div className="pb-8">
          <Reveal delay={80} as="header" className="mt-5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <Avatar
                name={data.name}
                src={primaryPhoto?.url ?? null}
                size="lg"
                verified={data.verification === "verified"}
              />
              <div className="min-w-0">
                <InlineTextField
                  label="Как тебя зовут"
                  value={data.name}
                  saving={update.isPending}
                  onSave={(name) => patch({ name })}
                  renderValue={(name) => (
                    <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                      {name}
                    </h1>
                  )}
                />
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <InlineTextField
                    label="Возраст"
                    value={String(data.age)}
                    saving={update.isPending}
                    onSave={(age) => {
                      const parsed = Number.parseInt(age, 10);
                      if (Number.isFinite(parsed) && parsed >= 18) patch({ age: parsed });
                    }}
                    renderValue={(age) => (
                      <p className="text-sm text-muted-foreground">{age} лет</p>
                    )}
                  />
                  <InlineTextField
                    label="Город"
                    value={data.city}
                    saving={update.isPending}
                    onSave={(city) => patch({ city })}
                    renderValue={(city) => (
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{city}</span>
                      </p>
                    )}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <TrustBadgeExplained level={data.trustLevel} details={data.trust} />
            </div>
          </Reveal>

          <div className="mt-6 flex items-center justify-between gap-4 border-t pt-4">
            <ProfileCollapseToggle collapsed={collapsed} onToggle={toggle} />
          </div>

          {!collapsed && (
            <div id="profile-collapsible-content">
              {/* Отдельной крупной карусели нет: галерея и управление живут в
                  одном блоке, чтобы фото не дублировались на мобильном. */}
              <Reveal delay={40}>
                <MediaManager media={data.media} />
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
                      <InlineTextFieldless value={intentNote} onChange={setIntentNote} />
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
                  onStart={() => void navigate({ to: "/verification" })}
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
                  Это твоя личная страница, а не витрина. Здесь нет рейтингов и мест в списке —
                  только то, что ты сам решил рассказать. И <Chip size="sm">интересы</Chip> помогают
                  AI искать людей рядом по смыслу.
                </Card>
              </Reveal>
            </div>
          )}
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
