import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BellRing, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { MyProfile, PrivacySettings, ProfileIntent } from "@/api";
import { Button, Card, Chip, Input, Select, TextArea } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { IntentCard, intentOptions } from "@/features/profile/components/IntentCard";
import { PrivacySection } from "@/features/profile/components/PrivacySection";
import { BusinessCard } from "@/features/profile/components/BusinessCard";
import { CompleteCard, type CompletionStepId } from "@/features/profile/components/CompleteCard";
import { InviteQrSheet } from "@/components/InviteQrSheet";
import { BottomSheet } from "@/components/ds";
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
  const [shareOpen, setShareOpen] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);

  const patch = (next: Partial<MyProfile>) => update.mutate(next);
  const patchPrivacy = (next: Partial<PrivacySettings>) => {
    if (!data) return;
    patch({ privacy: { ...data.privacy, ...next } });
    if (next.visibleInFeed === false) {
      toast("Твой профиль временно скрыт", {
        description: "Диалоги и сообщества работают как обычно.",
      });
    }
    if (next.visibleInFeed === true) {
      toast.success("Профиль снова виден");
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

  const onStep = (id: CompletionStepId) => {
    if (id === "verify") void navigate({ to: "/verification" });
    else if (id === "interests") setInterestsOpen(true);
    else if (id === "photo") document.querySelector<HTMLButtonElement>('[aria-label="Добавить фото"]')?.click();
    else startEdit();
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
            <BusinessCard
              profile={data}
              onEdit={startEdit}
              onShare={() => setShareOpen(true)}
              onUpload={media.upload}
              onDelete={media.remove}
              uploadDisabled={media.full}
              busy={media.busy}
            />

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
              <CompleteCard profile={data} onStep={onStep} />
            )}
          </Reveal>

          {!draft ? (
            <Card className="mt-4 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <BellRing className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Уведомления</p>
                  <p className="text-xs text-muted-foreground">История, push и выбор типов событий</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/settings" search={{ tab: "notifications" }}>Настроить</Link>
                </Button>
              </div>
              <Button variant="secondary" fullWidth className="mt-3" asChild>
                <Link to="/notifications">Открыть центр уведомлений</Link>
              </Button>
            </Card>
          ) : null}

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

          <InviteQrSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            title="Поделиться визиткой"
            url={typeof window !== "undefined" ? `${window.location.origin}/profile/${data.id}` : `/profile/${data.id}`}
          />
          <BottomSheet open={interestsOpen} onClose={() => setInterestsOpen(false)} title="Анкета интересов">
            <TagEditor
              items={data.interests}
              label="Новый интерес"
              addLabel="Добавить"
              saving={update.isPending}
              onSave={(interests) => patch({ interests })}
            />
          </BottomSheet>

          <Reveal as="footer" className="mt-5">
            <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
              Это твоя личная страница, а не витрина. Здесь нет рейтингов и мест в списке — только
              то, что ты сам решил рассказать. <Chip size="sm">Интересы</Chip> помогают находить
              сообщества по делу.
            </Card>
          </Reveal>
        </div>
      ) : null}
    </AppShell>
  );
}
