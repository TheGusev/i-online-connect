import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BellRing, Check, Pencil, Settings, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { MyProfile, PrivacySettings, ProfileIntent } from "@/api";
import { Button, Card, Chip, getTrustLevel, Input, Select, TextArea } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { IntentCard, intentOptions } from "@/features/profile/components/IntentCard";
import { PrivacySection } from "@/features/profile/components/PrivacySection";
import { ProfileHero } from "@/features/profile/components/ProfileHero";
import { badgeLevel } from "@/features/chat/trust";
import { parseProfileAge } from "@/features/profile/age";
import { InviteQrSheet } from "@/components/InviteQrSheet";
import { ProfilePanel } from "@/features/profile/components/ProfilePanel";
import { TagEditor } from "@/features/profile/components/TagEditor";
import { TrustBadgeExplained } from "@/features/profile/components/TrustBadgeExplained";
import { TrustStatsSection } from "@/features/profile/components/TrustStatsSection";
import { VerificationSection } from "@/features/profile/components/VerificationSection";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/hooks";
import { useMediaActions } from "@/features/profile/hooks/useMediaActions";
import { EntryNotices } from "@/features/auth/EntryNotices";

export const Route = createFileRoute("/profile/me")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean } =>
    search["edit"] === true || search["edit"] === "1" || search["edit"] === 1 ? { edit: true } : {},
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
  valuesText: string;
  joyText: string;
  dealbreakersText: string;
};

function MyProfilePage() {
  const { data, isPending, isError } = useMyProfile();
  const update = useUpdateMyProfile();
  const navigate = useNavigate();
  const media = useMediaActions(data?.media ?? []);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

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
      age: data.age ? String(data.age) : "",
      city: data.city,
      bio: data.bio,
      intent: data.intent,
      intentNote: data.intentNote,
      valuesText: data.questionnaire?.valuesText ?? "",
      joyText: data.questionnaire?.joyText ?? "",
      dealbreakersText: data.questionnaire?.dealbreakersText ?? "",
    });
  };

  // «Заполнить анкету» из «Рядом» открывает редактирование сразу.
  const { edit } = Route.useSearch();
  useEffect(() => {
    if (edit && data && !draft) startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, data]);

  const save = () => {
    if (!draft) return;
    const { age, valid } = parseProfileAge(draft.age);
    if (!valid) {
      toast.error("Возраст указывается числом от 18 до 100");
      return;
    }
    if (draft.name.trim().length < 2) {
      toast.error("Имя не может быть пустым");
      return;
    }
    update.mutate(
      {
        name: draft.name.trim(),
        ...(age !== null ? { age } : {}),
        city: draft.city.trim(),
        bio: draft.bio.trim(),
        intent: draft.intent,
        intentNote: draft.intentNote.trim(),
        questionnaire: {
          valuesText: draft.valuesText.trim(),
          joyText: draft.joyText.trim(),
          dealbreakersText: draft.dealbreakersText.trim(),
        },
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
          <EntryNotices recovery />
          <Reveal delay={60} className="mt-4">
            <ProfileHero
              media={data.media}
              name={draft ? draft.name : data.name}
              age={draft ? parseProfileAge(draft.age).age : data.age}
              city={draft ? draft.city : data.city}
              trustLevel={badgeLevel(data.trustLevel)}
              ring={getTrustLevel(data)}
              ownerPresentation
              verified={data.verification === "verified"}
              onUpload={media.upload}
              onDelete={media.remove}
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
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="hud-title text-xs">Анкета</p>
                  {data.completeness ? (
                    <p className="text-xs text-muted-foreground">
                      Заполнено {data.completeness.filled} из {data.completeness.total}
                      {data.completeness.complete ? " — знакомства открыты" : ". Интересы (от 3) и фото добавляются ниже и в галерее."}
                    </p>
                  ) : null}
                  <TextArea
                    label="Что для тебя по-настоящему важно"
                    rows={2}
                    value={draft.valuesText}
                    onChange={(event) => setDraft({ ...draft, valuesText: event.target.value })}
                  />
                  <TextArea
                    label="Что тебя радует"
                    rows={2}
                    value={draft.joyText}
                    onChange={(event) => setDraft({ ...draft, joyText: event.target.value })}
                  />
                  <TextArea
                    label="Что для тебя неприемлемо (необязательно)"
                    rows={2}
                    value={draft.dealbreakersText}
                    onChange={(event) => setDraft({ ...draft, dealbreakersText: event.target.value })}
                  />
                </div>
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
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                <Button variant="secondary" className="min-w-0 gap-1.5 px-2 text-xs sm:px-5 sm:text-sm" onClick={startEdit}>
                  <Pencil aria-hidden="true" />
                  <span className="min-w-0">Редактировать профиль</span>
                </Button>
                <Button variant="secondary" size="icon" aria-label="Поделиться" title="Поделиться" onClick={() => setShareOpen(true)}>
                  <Share2 aria-hidden="true" />
                </Button>
                <Button variant="secondary" size="icon" asChild>
                  <Link to="/settings" aria-label="Настройки" title="Настройки">
                    <Settings aria-hidden="true" />
                  </Link>
                </Button>
              </div>
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
              <Button asChild variant="secondary" className="mt-5"><Link to="/onboarding">Заполнить анкету</Link></Button>
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
            title="Поделиться профилем"
            url={typeof window !== "undefined" ? `${window.location.origin}/profile/${data.id}` : `/profile/${data.id}`}
          />

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
