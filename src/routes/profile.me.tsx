import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { MyProfile, PrivacySettings, ProfileIntent } from "@/api";
import { Button, Card, Chip, Input, Select, TextArea } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { badgeLevel } from "@/features/chat/trust";
import { IntentCard, intentOptions } from "@/features/profile/components/IntentCard";
import { PrivacySection } from "@/features/profile/components/PrivacySection";
import { ProfileHero } from "@/features/profile/components/ProfileHero";
import { ProfilePanel } from "@/features/profile/components/ProfilePanel";
import { TagEditor } from "@/features/profile/components/TagEditor";
import { TrustBadgeExplained } from "@/features/profile/components/TrustBadgeExplained";
import { TrustStatsSection } from "@/features/profile/components/TrustStatsSection";
import { VerificationSection } from "@/features/profile/components/VerificationSection";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/hooks";
import { useMediaActions } from "@/features/profile/hooks/useMediaActions";

export const Route = createFileRoute("/profile/me")({
  head: () => ({
    meta: [
      { title: "Мой профиль — Я Онлайн" },
      {
        name: "description",
        content:
          "Своя личная страница в «Я Онлайн»: редактирование в один клик, настройки приватности, статус верификации и личная статистика доверия.",
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

type Draft = {
  name: string;
  age: string;
  city: string;
  bio: string;
  intent: ProfileIntent;
  intentNote: string;
};

function MyProfilePage() {
  const { data, isPending, isError } = useMyProfile();
  const update = useUpdateMyProfile();
  const navigate = useNavigate();
  const media = useMediaActions(data?.media ?? []);

  const [draft, setDraft] = useState<Draft | null>(null);

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

  const startEdit = () => {
    if (!data) return;
    setDraft({
      name: data.name,
      age: String(data.age),
      city: data.city,
      bio: data.bio,
      intent: data.intent,
      intentNote: data.intentNote,
    });
  };

  const save = () => {
    if (!draft) return;
    const age = Number.parseInt(draft.age, 10);
    if (!Number.isFinite(age) || age < 18 || age > 120) {
      toast.error("Возраст указывается числом от 18 до 120");
      return;
    }
    if (draft.name.trim().length < 2) {
      toast.error("Имя не может быть пустым");
      return;
    }
    update.mutate(
      {
        name: draft.name.trim(),
        age,
        city: draft.city.trim(),
        bio: draft.bio.trim(),
        intent: draft.intent,
        intentNote: draft.intentNote.trim(),
      },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success("Профиль обновлён");
        },
      },
    );
  };

  return (
    <AppShell>
      {isPending ? <p className="text-sm text-muted-foreground">Загружаем профиль…</p> : null}
      {isError ? <p className="text-sm text-destructive">Не удалось открыть профиль</p> : null}

      {data ? (
        <div className="pb-10">
          <Reveal delay={60} className="mt-4">
            <ProfileHero
              media={data.media}
              name={draft ? draft.name : data.name}
              age={draft ? Number.parseInt(draft.age, 10) || data.age : data.age}
              city={draft ? draft.city : data.city}
              trustLevel={badgeLevel(data.trustLevel)}
              onUpload={media.upload}
              onDelete={media.remove}
              onPrimary={media.makePrimary}
              uploadDisabled={media.full}
              uploadHint={media.hint}
              progress={media.progress}
              busy={media.busy}
            />
            <p className="mt-2 px-1 text-xs text-muted-foreground">{media.hint}</p>

            {draft ? (
              <Card className="mt-3 space-y-3 p-4">
                <Input
                  label="Как тебя зовут"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Возраст"
                    inputMode="numeric"
                    value={draft.age}
                    onChange={(event) => setDraft({ ...draft, age: event.target.value })}
                  />
                  <Input
                    label="Город"
                    value={draft.city}
                    onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                  />
                </div>
                <TextArea
                  label="О себе"
                  value={draft.bio}
                  onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                />
                <Select
                  label="Ищу"
                  value={draft.intent}
                  options={intentOptions}
                  onChange={(event) =>
                    setDraft({ ...draft, intent: event.target.value as ProfileIntent })
                  }
                />
                <TextArea
                  label="Пара слов о том, кого ты ищешь"
                  rows={3}
                  value={draft.intentNote}
                  onChange={(event) => setDraft({ ...draft, intentNote: event.target.value })}
                />
                <div className="flex items-center gap-2">
                  <Button className="flex-1" onClick={save} disabled={update.isPending}>
                    <Check className="size-4" aria-hidden="true" />
                    {update.isPending ? "Сохраняем…" : "Сохранить"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setDraft(null)}
                    disabled={update.isPending}
                  >
                    <X className="size-4" aria-hidden="true" />
                    Отмена
                  </Button>
                </div>
              </Card>
            ) : (
              <Button variant="secondary" className="mt-3 w-full" onClick={startEdit}>
                <Pencil className="size-4" aria-hidden="true" />
                Редактировать профиль
              </Button>
            )}
          </Reveal>

          {!draft ? (
            <>
              <ProfilePanel title="О себе" defaultOpen storageKey="me-about" className="mt-5">
                <p className="max-w-2xl text-base leading-loose text-muted-foreground">
                  {data.bio || "Пока пусто — расскажи о себе через «Редактировать профиль»."}
                </p>
              </ProfilePanel>

              <ProfilePanel title="Ищу" defaultOpen storageKey="me-intent">
                <IntentCard intent={data.intent} note={data.intentNote} />
              </ProfilePanel>
            </>
          ) : null}

          <ProfilePanel
            title="Интересы"
            hint={`${data.interests.length}`}
            storageKey="me-interests"
          >
            <TagEditor
              items={data.interests}
              label="Новый интерес"
              addLabel="Добавить"
              saving={update.isPending}
              onSave={(interests) => patch({ interests })}
            />
          </ProfilePanel>

          <ProfilePanel title="Что важно" hint={`${data.values.length}`} storageKey="me-values">
            <TagEditor
              items={data.values}
              label="Что для тебя важно"
              addLabel="Добавить"
              variant="outline"
              saving={update.isPending}
              onSave={(values) => patch({ values })}
            />
          </ProfilePanel>

          <ProfilePanel title="Доверие" storageKey="me-trust">
            <TrustBadgeExplained level={data.trustLevel} details={data.trust} />
          </ProfilePanel>

          <ProfilePanel
            title="Настройки приватности"
            description="Ты решаешь, что видно другим и кто может к тебе обратиться."
            storageKey="me-privacy"
          >
            <PrivacySection privacy={data.privacy} onChange={patchPrivacy} />
          </ProfilePanel>

          <ProfilePanel
            title="Верификация"
            description="Подтверждение по видео — основа доверия в «Я Онлайн»."
            hint={data.verification === "verified" ? "Подтверждён" : "Не пройдена"}
            defaultOpen={data.verification !== "verified"}
            storageKey="me-verification"
          >
            <VerificationSection
              status={data.verification}
              onStart={() => void navigate({ to: "/verification" })}
            />
          </ProfilePanel>

          <ProfilePanel
            title="Только для тебя"
            description="Личная статистика доверия — её не видит никто, кроме тебя."
            storageKey="me-stats"
          >
            <TrustStatsSection stats={data.stats} />
          </ProfilePanel>

          <Reveal as="footer" className="mt-5">
            <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
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
