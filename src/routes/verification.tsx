import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Clock,
  Eye,
  MessageCircleHeart,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, Card, TrustBadge } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/hooks";
import { SelfieCapture } from "@/features/trust/components/SelfieCapture";
import { useSubmitVerification } from "@/features/trust/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/verification")({
  head: () => ({
    meta: [
      { title: "Видео-верификация профиля — Я Онлайн" },
      {
        name: "description",
        content:
          "Пройди верификацию за пару минут: live-селфи, сверка с фото профиля и понятный статус проверки.",
      },
      { property: "og:title", content: "Видео-верификация профиля — Я Онлайн" },
      {
        property: "og:description",
        content: "Живое селфи, спокойное объяснение каждого шага и бейдж «Подтверждён» в профиле.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerificationPage,
});

type Stage = "selfie" | "compare" | "waiting" | "done";

const steps: { id: Stage; label: string }[] = [
  { id: "selfie", label: "Живое селфи" },
  { id: "compare", label: "Сверка с фото" },
  { id: "waiting", label: "Проверка" },
  { id: "done", label: "Готово" },
];

function StepRail({ stage }: { stage: Stage }) {
  const current = steps.findIndex((step) => step.id === stage);
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      {steps.map((step, index) => {
        const passed = index < current;
        const active = index === current;
        return (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full border text-[11px] font-bold",
                passed
                  ? "border-success/40 bg-success-soft text-foreground"
                  : active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {passed ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className={cn(active ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-6 bg-border sm:block" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function VerificationPage() {
  const { data } = useMyProfile();
  const update = useUpdateMyProfile();
  const submit = useSubmitVerification();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>("selfie");
  const [shot, setShot] = useState<string | null>(null);
  const [eta, setEta] = useState(15);

  const referencePhoto = data?.media.find((item) => item.kind === "photo")?.url ?? "";

  // Экран ожидания: понятный тайминг вместо бесконечного спиннера.
  useEffect(() => {
    if (stage !== "waiting") return;
    const timer = setTimeout(() => setStage("done"), 3200);
    return () => clearTimeout(timer);
  }, [stage]);

  const send = () => {
    if (!shot) return;
    submit.mutate(
      { selfie: shot, referencePhotoUrl: referencePhoto },
      {
        onSuccess: (ticket) => {
          setEta(ticket.etaMinutes);
          update.mutate({ verification: "pending" });
          setStage("waiting");
          toast.success("Профиль отправлен на верификацию", {
            description: `Обычно проверка занимает около ${ticket.etaMinutes} минут — мы напишем, как только закончим.`,
          });
        },
        onError: () => {
          toast.error("Не удалось отправить селфи", {
            description: "Похоже, связь подвела. Попробуй ещё раз — кадр сохранён.",
          });
        },
      },
    );
  };

  return (
    <AppShell>
      <Link
        to="/profile/me"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        В профиль
      </Link>

      <header className="mb-7">
        <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Верификация
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Подтвердим, что это правда ты</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Два спокойных шага: живое селфи и сверка с фото из профиля. Никаких документов, никаких
          публикаций — кадр видит только модерация.
        </p>
      </header>

      <StepRail stage={stage} />

      {stage === "selfie" ? (
        <Reveal>
          <Card className="p-6">
            <h2 className="inline-flex items-center gap-2 text-lg font-bold">
              <ScanFace className="size-4 text-primary" aria-hidden="true" />
              Шаг 1. Живое селфи
            </h2>
            <p className="mb-5 mt-1 text-sm leading-relaxed text-muted-foreground">
              Найди ровный свет и посмотри в камеру. Улыбаться необязательно — это не фото на
              паспорт.
            </p>
            <SelfieCapture shot={shot} onShot={setShot} onRetake={() => setShot(null)} />
            <Button className="mt-5" fullWidth disabled={!shot} onClick={() => setStage("compare")}>
              Дальше — сверка
            </Button>
          </Card>
        </Reveal>
      ) : null}

      {stage === "compare" ? (
        <Reveal>
          <Card className="p-6">
            <h2 className="inline-flex items-center gap-2 text-lg font-bold">
              <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
              Шаг 2. Сверка с фото профиля
            </h2>
            <p className="mb-5 mt-1 text-sm leading-relaxed text-muted-foreground">
              Посмотри, как это увидит модерация. Если фото профиля устарело — можно вернуться и
              заменить его, так проверка пройдёт быстрее.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <figure>
                <img
                  src={shot ?? ""}
                  alt="Живое селфи"
                  className="aspect-square w-full rounded-3xl border border-border object-cover"
                />
                <figcaption className="mt-2 text-xs text-muted-foreground">
                  Живое селфи, снято сейчас
                </figcaption>
              </figure>
              <figure>
                {referencePhoto ? (
                  <img
                    src={referencePhoto}
                    alt="Фото из профиля"
                    className="aspect-square w-full rounded-3xl border border-border object-cover"
                  />
                ) : (
                  <div className="grid aspect-square w-full place-items-center rounded-3xl border border-dashed border-border text-xs text-muted-foreground">
                    В профиле пока нет фото
                  </div>
                )}
                <figcaption className="mt-2 text-xs text-muted-foreground">
                  Фото из профиля
                </figcaption>
              </figure>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button loading={submit.isPending} onClick={send}>
                Отправить на проверку
              </Button>
              <Button variant="ghost" onClick={() => setStage("selfie")}>
                Пересняться
              </Button>
            </div>
          </Card>
        </Reveal>
      ) : null}

      {stage === "waiting" ? (
        <Reveal>
          <Card className="p-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary">
              <Clock className="size-6 animate-pulse text-primary" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold">Смотрим твоё селфи</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Обычно это занимает около {eta} минут, в редкие часы пик — до двух часов. Приложение
              можно закрыть: мы пришлём уведомление, когда закончим.
            </p>
            <p className="mx-auto mt-4 max-w-md rounded-2xl bg-secondary px-4 py-3 text-xs leading-relaxed text-secondary-foreground">
              Пока идёт проверка, профиль работает как обычно — с бейджем «Новый участник».
            </p>
          </Card>
        </Reveal>
      ) : null}

      {stage === "done" ? (
        <Reveal>
          <Card className="p-8">
            <span className="grid size-14 place-items-center rounded-full bg-success-soft">
              <ShieldCheck className="size-6 text-success" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">Готово, ты подтверждён</h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Селфи совпало с фото профиля. Вот что изменилось:
            </p>

            <ul className="mt-5 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  В профиле появился бейдж <TrustBadge level="confirmed" size="sm" /> — его видят
                  все, кому ты пишешь.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Eye className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Ты попадаешь в подборки к другим подтверждённым людям — и видишь их в своей.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <MessageCircleHeart
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>
                  Первые сообщения от тебя доходят до тех, кто разрешил писать только
                  верифицированным.
                </span>
              </li>
            </ul>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  update.mutate({ verification: "verified" });
                  void navigate({ to: "/profile/me" });
                }}
              >
                Посмотреть профиль
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/safety-center">Центр безопасности</Link>
              </Button>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Селфи удаляется сразу после проверки. Уровень «Проверенный участник» придёт сам —
              после месяца общения без жалоб и первых встреч.
            </p>
          </Card>
        </Reveal>
      ) : null}
    </AppShell>
  );
}
