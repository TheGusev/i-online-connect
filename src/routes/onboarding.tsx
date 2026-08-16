import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";

import { onboardingApi, type OnboardingIntent, type User } from "@/api";
import { Button, Card, Input, TextArea } from "@/components/ds";
import { AiBubble, TypingBubble, UserBubble } from "@/features/onboarding/ChatBubble";
import { InterestsPicker } from "@/features/onboarding/InterestsPicker";
import { MediaStep } from "@/features/onboarding/MediaStep";
import { ProfilePreview } from "@/features/onboarding/ProfilePreview";
import { ONBOARDING_STEPS, useOnboardingStore } from "@/store/useOnboardingStore";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Знакомство с «Я Онлайн» — профиль через диалог" },
      {
        name: "description",
        content:
          "Профиль в «Я Онлайн» собирается в тёплом диалоге с AI: восемь коротких шагов вместо длинной формы регистрации.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Знакомство с «Я Онлайн» — профиль через диалог" },
      {
        property: "og:description",
        content: "AI задаёт вопросы по одному и собирает живой профиль вместе с тобой.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

const INTENTS: OnboardingIntent[] = ["serious", "friends", "projects", "unsure"];

function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stepIndex, draft, answers, patchDraft, toggleInterest, answerStep, goBack, reset } =
    useOnboardingStore();

  const [typing, setTyping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [result, setResult] = useState<User | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const stepId = ONBOARDING_STEPS[stepIndex]!;
  const total = ONBOARDING_STEPS.length;

  // Появление сообщения AI с небольшой задержкой — как в живой переписке.
  useEffect(() => {
    setTyping(true);
    setError(null);
    const id = window.setTimeout(() => setTyping(false), 700);
    return () => window.clearTimeout(id);
  }, [stepIndex]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [stepIndex, typing, submitState]);

  // Финальный шаг: отправляем весь черновик одним объектом через API-клиент.
  useEffect(() => {
    if (stepId !== "summary" || typing || submitState !== "idle") return;
    setSubmitState("loading");
    onboardingApi
      .submitOnboarding(draft)
      .then((user) => {
        setResult(user);
        setSubmitState("ready");
      })
      .catch(() => setSubmitState("error"));
  }, [stepId, typing, submitState, draft]);

  const retry = () => {
    setSubmitState("idle");
    setResult(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            {stepIndex > 0 ? (
              <Button variant="ghost" size="sm" onClick={goBack}>
                <ArrowLeft aria-hidden="true" />
                {t("onboarding.chat.back")}
              </Button>
            ) : (
              <Button asChild variant="ghost" size="sm">
                <Link to="/">
                  <ArrowLeft aria-hidden="true" />
                  {t("app.name")}
                </Link>
              </Button>
            )}
            <p className="ml-auto text-xs font-semibold text-muted-foreground">
              {t("onboarding.chat.progress", { current: stepIndex + 1, total })}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${((stepIndex + 1) / total) * 100}%`,
                background: "var(--gradient-verified)",
              }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 lg:px-6">
        <div className="space-y-5">
          {ONBOARDING_STEPS.slice(0, stepIndex).map((id) => {
            const answer = answers.find((entry) => entry.stepId === id);
            return (
              <div key={id} className="space-y-5">
                <AiBubble>{t(`onboarding.s${ONBOARDING_STEPS.indexOf(id) + 1}.ai`)}</AiBubble>
                {answer ? <UserBubble>{answer.answer}</UserBubble> : null}
              </div>
            );
          })}

          {typing ? (
            <TypingBubble />
          ) : (
            <AiBubble>{t(`onboarding.s${stepIndex + 1}.ai`)}</AiBubble>
          )}
        </div>

        {!typing && (
          <div className="mt-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
            {stepId === "name" && (
              <NameStep
                error={error}
                onSubmit={(name, age) => {
                  patchDraft({ name, age });
                  answerStep({ stepId: "name", answer: t("onboarding.s1.answer", { name, age }) });
                }}
                onError={setError}
              />
            )}

            {stepId === "intent" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {INTENTS.map((intent) => (
                  <Card
                    key={intent}
                    interactive
                    onClick={() => {
                      patchDraft({ intent });
                      answerStep({ stepId: "intent", answer: t(`onboarding.s2.${intent}`) });
                    }}
                    className="cursor-pointer p-5 text-left"
                  >
                    <p className="font-bold">{t(`onboarding.s2.${intent}`)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`onboarding.s2.${intent}Hint`)}
                    </p>
                  </Card>
                ))}
              </div>
            )}

            {stepId === "about" && (
              <AboutStep
                value={draft.about}
                error={error}
                onChange={(about) => patchDraft({ about })}
                onSubmit={() => {
                  if (draft.about.trim().length < 20) {
                    setError(t("onboarding.s3.error"));
                    return;
                  }
                  answerStep({ stepId: "about", answer: draft.about.trim() });
                }}
              />
            )}

            {stepId === "media" && (
              <MediaStep
                photoName={draft.photoName}
                videoName={draft.videoName}
                onPhoto={(photoName) => patchDraft({ photoName })}
                onVideo={(videoName) => patchDraft({ videoName, videoSkipped: false })}
                onSkipVideo={() => {
                  patchDraft({ videoName: null, videoSkipped: true });
                  answerStep({
                    stepId: "media",
                    answer: draft.photoName
                      ? t("onboarding.s4.answerPhotoOnly")
                      : t("onboarding.s4.answerEmpty"),
                  });
                }}
                onSubmit={() =>
                  answerStep({
                    stepId: "media",
                    answer: draft.videoName
                      ? t("onboarding.s4.answerWithVideo")
                      : draft.photoName
                        ? t("onboarding.s4.answerPhotoOnly")
                        : t("onboarding.s4.answerEmpty"),
                  })
                }
              />
            )}

            {stepId === "interests" && (
              <InterestsPicker
                selected={draft.interests}
                onToggle={toggleInterest}
                error={error ?? undefined}
                onSubmit={() => {
                  if (draft.interests.length < 3) {
                    setError(t("onboarding.s5.error"));
                    return;
                  }
                  answerStep({
                    stepId: "interests",
                    answer: t("onboarding.s5.answer", { list: draft.interests.join(" · ") }),
                  });
                }}
              />
            )}

            {stepId === "values" && (
              <div className="space-y-4">
                {(["values", "joy", "dealbreakers"] as const).map((key) => (
                  <TextArea
                    key={key}
                    label={t(`onboarding.s6.${key}`)}
                    rows={2}
                    value={draft.values[key]}
                    onChange={(event) =>
                      patchDraft({ values: { ...draft.values, [key]: event.target.value } })
                    }
                  />
                ))}
                {error && <p className="px-1 text-xs text-destructive">{error}</p>}
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      const filled = (["values", "joy", "dealbreakers"] as const).every((key) =>
                        draft.values[key].trim(),
                      );
                      if (!filled) {
                        setError(t("onboarding.s6.error"));
                        return;
                      }
                      answerStep({ stepId: "values", answer: t("onboarding.s6.answer") });
                    }}
                  >
                    {t("onboarding.chat.next")}
                  </Button>
                </div>
              </div>
            )}

            {stepId === "location" && (
              <div className="space-y-4">
                <Input
                  label={t("onboarding.s7.city")}
                  value={draft.city}
                  error={error ?? undefined}
                  onChange={(event) => patchDraft({ city: event.target.value })}
                />
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
                  <input
                    type="checkbox"
                    checked={draft.hideExactLocation}
                    onChange={(event) => patchDraft({ hideExactLocation: event.target.checked })}
                    className="mt-1 size-4 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{t("onboarding.s7.hide")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("onboarding.s7.hideHint")}
                    </span>
                  </span>
                </label>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      const city = draft.city.trim();
                      if (city.length < 2) {
                        setError(t("onboarding.s7.error"));
                        return;
                      }
                      answerStep({
                        stepId: "location",
                        answer: draft.hideExactLocation
                          ? t("onboarding.s7.answerHidden", { city })
                          : t("onboarding.s7.answer", { city }),
                      });
                    }}
                  >
                    {t("onboarding.chat.next")}
                  </Button>
                </div>
              </div>
            )}

            {stepId === "summary" && (
              <div className="space-y-5">
                {submitState === "loading" && <BuildingLoader />}

                {submitState === "error" && (
                  <div className="rounded-3xl border border-border bg-card p-5">
                    <p className="text-sm text-destructive">{t("onboarding.s8.error")}</p>
                    <Button className="mt-4" onClick={retry}>
                      {t("onboarding.s8.retry")}
                    </Button>
                  </div>
                )}

                {submitState === "ready" && result && (
                  <div className="space-y-5 animate-in fade-in duration-700">
                    <p className="text-sm text-muted-foreground">{t("onboarding.s8.ready")}</p>
                    <ProfilePreview draft={draft} />
                    <div className="flex flex-wrap gap-3">
                      <Button
                        size="lg"
                        onClick={() => {
                          reset();
                          void navigate({ to: "/feed" });
                        }}
                      >
                        {t("onboarding.s8.confirm")}
                      </Button>
                      <Button variant="secondary" size="lg" onClick={goBack}>
                        {t("onboarding.s8.edit")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} className="h-4" />
      </main>
    </div>
  );
}

function NameStep({
  error,
  onSubmit,
  onError,
}: {
  error: string | null;
  onSubmit: (name: string, age: number) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const draft = useOnboardingStore((state) => state.draft);
  const [name, setName] = useState(draft.name);
  const [age, setAge] = useState(draft.age ? String(draft.age) : "");

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      onError(t("onboarding.s1.nameError"));
      return;
    }
    const parsed = Number(age);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      onError(t("onboarding.s1.ageError"));
      return;
    }
    if (parsed < 18) {
      onError(t("onboarding.s1.ageMin"));
      return;
    }
    onError(null);
    onSubmit(trimmed, parsed);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Input
          label={t("onboarding.s1.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label={t("onboarding.s1.age")}
          value={age}
          inputMode="numeric"
          className="sm:w-32"
          onChange={(event) => setAge(event.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </div>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={submit}>{t("onboarding.chat.send")}</Button>
      </div>
    </div>
  );
}

function AboutStep({
  value,
  error,
  onChange,
  onSubmit,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <TextArea
        label={t("onboarding.s3.label")}
        rows={5}
        value={value}
        hint={t("onboarding.s3.hint")}
        error={error ?? undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex justify-end">
        <Button onClick={onSubmit}>{t("onboarding.chat.next")}</Button>
      </div>
    </div>
  );
}

function BuildingLoader() {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-6 py-12 text-center"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <span className="relative grid size-16 place-items-center">
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-30"
          style={{ background: "var(--gradient-verified)" }}
        />
        <span
          className="relative grid size-14 place-items-center rounded-full text-primary-foreground"
          style={{ background: "var(--gradient-verified)" }}
        >
          <Sparkles className="size-6 animate-pulse" aria-hidden="true" />
        </span>
      </span>
      <p className="text-lg font-extrabold">{t("onboarding.s8.loading")}</p>
      <p className="text-sm text-muted-foreground">{t("onboarding.s8.loadingHint")}</p>
      <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full"
          style={{ background: "var(--gradient-verified)" }}
        />
      </div>
    </div>
  );
}
