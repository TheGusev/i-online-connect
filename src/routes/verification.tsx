import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Clock,
  ListChecks,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { VerificationChallenge, VerificationTicket } from "@/api";
import { ApiError } from "@/api";
import { Button, Card } from "@/components/ds";
import { Reveal } from "@/components/landing/Reveal";
import { AppShell } from "@/components/layout/AppShell";
import { useMyProfile } from "@/features/profile/hooks";
import { LiveVideoCapture } from "@/features/trust/components/LiveVideoCapture";
import {
  useSubmitVerificationVideo,
  useVerificationChallenge,
  useVerificationStatus,
} from "@/features/trust/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/verification")({
  head: () => ({
    meta: [
      { title: "Видео-верификация профиля — Я Онлайн" },
      {
        name: "description",
        content:
          "Живое видео на 4–8 секунд, задание от сервера и автоматическая сверка с фото профиля — так в «Я Онлайн» не остаётся фейковых анкет.",
      },
      { property: "og:title", content: "Видео-верификация профиля — Я Онлайн" },
      {
        property: "og:description",
        content: "Живое видео, задание от сервера и понятный результат проверки.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerificationPage,
});

type Stage = "intro" | "record" | "result";

const MAX_VERIFICATION_VIDEO_BYTES = 40 * 1024 * 1024;

const steps: { id: Stage; label: string }[] = [
  { id: "intro", label: "Задание" },
  { id: "record", label: "Живое видео" },
  { id: "result", label: "Результат" },
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
            <span
              className={cn(active ? "font-semibold text-foreground" : "text-muted-foreground")}
            >
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

/** Осталось времени у задания: оно одноразовое и живёт 5 минут. */
function useChallengeCountdown(challenge: VerificationChallenge | null) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!challenge) return;
    const tick = () =>
      setLeft(Math.max(0, Math.round((Date.parse(challenge.expiresAt) - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  return left;
}

function ResultCard({ ticket, onRetry }: { ticket: VerificationTicket; onRetry: () => void }) {
  if (ticket.status === "verified") {
    return (
      <Card className="p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft">
          <BadgeCheck className="size-6 text-foreground" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-bold">Профиль подтверждён</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {ticket.reason || "Лицо на видео совпало с фото профиля."} Бейдж «Подтверждён» уже виден
          другим людям, а запись мы храним только для разбора спорных ситуаций.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/profile/me">Вернуться в профиль</Link>
        </Button>
      </Card>
    );
  }

  if (ticket.status === "rejected") {
    return (
      <Card className="p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning-soft">
          <ShieldAlert className="size-6 text-warning-foreground" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-bold">Пока не сходится</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {ticket.reason || "Не удалось сопоставить видео с фото профиля."} Это не приговор: проверь
          свет, сними шапку и очки, при необходимости обнови фото в профиле — и попробуй снова.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}>Записать заново</Button>
          <Button variant="ghost" asChild>
            <Link to="/profile/me">Обновить фото профиля</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary">
        <Clock className="size-6 animate-pulse text-primary" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-xl font-bold">Смотрим твоё видео</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {ticket.reason || "Автоматическая сверка не приняла решение сама."} Заявку смотрит живой
        человек из команды доверия — обычно это занимает до{" "}
        {Math.max(1, Math.round(ticket.etaMinutes / 60))} ч. Приложением можно пользоваться как
        обычно, мы напишем, когда закончим.
      </p>
      <Button className="mt-5" variant="secondary" asChild>
        <Link to="/profile/me">Вернуться в профиль</Link>
      </Button>
    </Card>
  );
}

function VerificationPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const status = useVerificationStatus();
  const challengeMutation = useVerificationChallenge();
  const submit = useSubmitVerificationVideo();

  const [stage, setStage] = useState<Stage>("intro");
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [video, setVideo] = useState<Blob | null>(null);
  const [ticket, setTicket] = useState<VerificationTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const secondsLeft = useChallengeCountdown(challenge);
  const hasPhoto = (profile?.media ?? []).some((item) => item.kind === "photo");

  // Заявка уже в работе — показываем её статус, а не новую запись.
  useEffect(() => {
    if (!status.data) return;
    if (
      status.data.status === "pending" ||
      status.data.status === "verified" ||
      (stage === "result" && status.data.status === "rejected")
    ) {
      setTicket(status.data);
      setStage("result");
      if (status.data.status === "verified") {
        void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
        void queryClient.invalidateQueries({ queryKey: ["trust", "summary"] });
      }
    }
  }, [queryClient, stage, status.data]);

  const requestChallenge = () => {
    setError(null);
    challengeMutation.mutate(undefined, {
      onSuccess: (next) => {
        setChallenge(next);
        setVideo(null);
        setStage("record");
      },
      onError: (cause) => {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Не удалось получить задание. Проверь связь и попробуй ещё раз.",
        );
      },
    });
  };

  const send = () => {
    if (!challenge || !video) return;
    if (video.size > MAX_VERIFICATION_VIDEO_BYTES) {
      setError("Видео получилось больше 40 МБ. Запишите короткий ролик на 4–8 секунд заново.");
      return;
    }
    if (video.type && !video.type.includes("webm") && !video.type.includes("mp4")) {
      setError("Этот формат видео не поддерживается. Запишите ролик камерой ещё раз.");
      return;
    }
    const attemptedAt = Date.now();
    setError(null);
    setUploadProgress(0);
    submit.mutate(
      { challengeId: challenge.id, video, onProgress: setUploadProgress },
      {
        onSuccess: (result) => {
          setTicket(result);
          setStage("result");
          void status.refetch();
          if (result.status === "verified") {
            toast.success("Профиль подтверждён", {
              description: "Бейдж «Подтверждён» уже виден другим людям.",
            });
          } else if (result.status === "rejected") {
            toast.error("Видео не подтвердило профиль", { description: result.reason });
          } else {
            toast("Заявку смотрит команда доверия", { description: result.reason });
          }
        },
        onError: (cause) => {
          void status.refetch().then(({ data }) => {
            const submittedAt = data?.submittedAt ? Date.parse(data.submittedAt) : 0;
            if (data && submittedAt >= attemptedAt - 5_000) {
              setTicket(data);
              setStage("result");
              toast("Видео принято", { description: "Проверка продолжается в фоне." });
              return;
            }
            const message =
              cause instanceof ApiError
                ? cause.message
                : "Не удалось загрузить видео. Проверь связь — запись сохранена.";
            setError(message);
            toast.error("Видео не отправилось", { description: message });
          });
        },
      },
    );
  };

  const retry = () => {
    setTicket(null);
    setVideo(null);
    setChallenge(null);
    setUploadProgress(0);
    setStage("intro");
  };

  return (
    <AppShell>
      <Link
        to="/profile/me"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />В профиль
      </Link>

      <header className="mb-7">
        <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Верификация
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Подтвердим, что это правда ты</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Сервер даст короткое задание, ты запишешь живое видео на 4–8 секунд, а мы сверим кадры с
          фото из профиля. Никаких документов и публикаций — запись видит только проверка.
        </p>
      </header>

      <StepRail stage={stage} />

      {error ? (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {stage === "intro" ? (
        <Reveal>
          <Card className="p-6">
            <h2 className="inline-flex items-center gap-2 text-lg font-bold">
              <ScanFace className="size-4 text-primary" aria-hidden="true" />
              Как это работает
            </h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <li>
                <b className="text-foreground">1.</b> Сервер сгенерирует задание: повернуть голову,
                показать жест и произнести код. Оно одноразовое и живёт 5 минут — заранее записанное
                видео не подойдёт.
              </li>
              <li>
                <b className="text-foreground">2.</b> Ты запишешь видео на 4–8 секунд с фронтальной
                камеры.
              </li>
              <li>
                <b className="text-foreground">3.</b> Мы сравним кадры с главным фото профиля. Если
                уверенности мало — заявку посмотрит живой модератор.
              </li>
            </ol>

            {!hasPhoto ? (
              <p className="mt-5 rounded-2xl border border-warning/35 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                Сначала добавь фото в профиль — с ним мы будем сверять видео.
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                loading={challengeMutation.isPending}
                disabled={!hasPhoto}
                onClick={requestChallenge}
              >
                Получить задание
              </Button>
              {status.data?.status === "rejected" ? (
                <span className="self-center text-xs text-muted-foreground">
                  Прошлая попытка: {status.data.reason}
                </span>
              ) : null}
            </div>
          </Card>
        </Reveal>
      ) : null}

      {stage === "record" && challenge ? (
        <Reveal>
          <Card className="p-6">
            <h2 className="inline-flex items-center gap-2 text-lg font-bold">
              <ListChecks className="size-4 text-primary" aria-hidden="true" />
              Твоё задание
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
              {challenge.instructions.map((instruction) => (
                <li key={instruction} className="flex gap-2">
                  <span className="text-primary" aria-hidden="true">
                    •
                  </span>
                  {instruction}
                </li>
              ))}
              <li className="flex gap-2">
                <span className="text-primary" aria-hidden="true">
                  •
                </span>
                произнесите вслух код{" "}
                <b className="tracking-widest text-foreground">{challenge.spokenCode}</b>
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {secondsLeft > 0
                ? `Задание действует ещё ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                : "Задание истекло — получи новое."}
            </p>

            <div className="mt-5">
              <LiveVideoCapture
                video={video}
                onRecorded={setVideo}
                onRetake={() => setVideo(null)}
                disabled={submit.isPending}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                loading={submit.isPending}
                disabled={!video || secondsLeft === 0}
                onClick={send}
              >
                {submit.isPending
                  ? uploadProgress < 100
                    ? `Загружаем ${uploadProgress}%`
                    : "Принимаем видео…"
                  : "Отправить на сверку"}
              </Button>
              <Button variant="ghost" onClick={requestChallenge} disabled={submit.isPending}>
                Новое задание
              </Button>
            </div>
          </Card>
        </Reveal>
      ) : null}

      {stage === "result" && ticket ? (
        <Reveal>
          <ResultCard ticket={ticket} onRetry={retry} />
        </Reveal>
      ) : null}
    </AppShell>
  );
}
