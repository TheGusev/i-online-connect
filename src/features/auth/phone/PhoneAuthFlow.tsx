import { ArrowLeft, Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError, authApi, mediaApi, profileApi } from "@/api";
import { Avatar, Button } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

import { formatNational, nationalDigits, normalizeRuPhone } from "./phone";
import { needsFirstEntry } from "../first-entry";
import { ShortEntry } from "../ShortEntry";

type Step = "phone" | "code" | "name";

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Шаги входа по номеру: номер → код → имя (только для нового).
 * Используется на /auth и в нижнем окне входа у гостя.
 */
export function PhoneAuthFlow({
  onDone,
  onBack,
  initialStep = "phone",
}: {
  onDone: () => void;
  onBack?: () => void;
  initialStep?: Step;
}) {
  const setSession = useSessionStore((state) => state.setSession);
  const [step, setStep] = useState<Step>(initialStep);
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const phone = normalizeRuPhone(digits);
  const user = useSessionStore(state => state.user);

  useEffect(() => {
    if (step !== "code") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const left = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const requestCode = async () => {
    if (!phone) {
      setError("Введите номер полностью");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.requestPhoneCode(phone);
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
      setCode("");
      setStep("code");
    } catch (cause) {
      setError(messageOf(cause, "Не удалось отправить код"));
      const match = cause instanceof ApiError && cause.status === 429 ? /(\d+)\s*с/.exec(cause.message) : null;
      if (match && step === "code") setResendAt(Date.now() + Number(match[1]) * 1000);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!phone || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const session = await authApi.verifyPhoneCode(phone, value);
      setSession(session);
      if (needsFirstEntry(session.user)) setStep("name");
      else onDone();
    } catch (cause) {
      setError(messageOf(cause, "Неверный код"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    const value = name.trim();
    if (value.length < 2) {
      setError("Введите имя");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await profileApi.updateMyProfile({ name: value });
      if (photo) {
        try {
          await mediaApi.uploadMedia(photo, photo.name);
        } catch {
          // Фото необязательно: ошибка загрузки не мешает войти.
        }
      }
      const current = useSessionStore.getState();
      if (current.user && current.token) {
        current.setSession({ token: current.token, user: { ...current.user, name: value } });
      }
      onDone();
    } catch (cause) {
      setError(messageOf(cause, "Не удалось сохранить имя"));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setError(null);
    if (step === "code") setStep("phone");
    else onBack?.();
  };

  if (user && needsFirstEntry(user)) return <ShortEntry />;

  return (
    <div className="flex flex-col">
      {step !== "name" && (step === "code" || onBack) ? (
        <button
          type="button"
          onClick={back}
          aria-label="Назад"
          className="-ml-2 mb-4 grid size-11 place-items-center rounded-full text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
      ) : null}

      {step === "phone" ? (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight">Ваш номер</h1>
          <p className="mt-2 text-sm text-muted-foreground">Пришлём код в SMS</p>
          <label className="mt-8 flex h-14 items-center gap-3 rounded-2xl border border-border bg-card px-4 focus-within:border-primary">
            <span className="text-base font-semibold">+7</span>
            <span className="sr-only">Номер телефона</span>
            <input
              autoFocus
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="999 123-45-67"
              value={formatNational(digits)}
              onChange={(event) => setDigits(nationalDigits(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter") void requestCode();
              }}
              className="min-w-0 flex-1 bg-transparent text-lg tracking-wide outline-none placeholder:text-muted-foreground"
            />
          </label>
          {error ? <p className="mt-2 px-1 text-sm text-destructive">{error}</p> : null}
          <Button className="mt-5 h-12 w-full shadow-glow" loading={busy} disabled={!phone} onClick={() => void requestCode()}>
            Получить код
          </Button>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Нажимая «Получить код», вы соглашаетесь с{" "}
            <a href="/rules" className="underline underline-offset-2">условиями использования</a>
          </p>
        </>
      ) : null}

      {step === "code" ? (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight">Введите код</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Мы отправили SMS на +7 {formatNational(digits)}
          </p>
          <label className="relative mt-8 block">
            <span className="sr-only">Код из SMS</span>
            <input
              autoFocus
              value={code}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(value);
                if (value.length === 6) void verify(value);
              }}
              className="absolute inset-0 z-10 size-full cursor-text opacity-0"
            />
            <span className="grid grid-cols-6 gap-2" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={`grid h-14 place-items-center rounded-xl border bg-card text-2xl font-bold ${
                    code[index] ? "border-primary" : index === code.length ? "border-primary/60" : "border-border"
                  }`}
                >
                  {code[index] ?? ""}
                </span>
              ))}
            </span>
          </label>
          {error ? <p className="mt-3 px-1 text-sm text-destructive">{error}</p> : null}
          <div className="mt-6 flex flex-col items-center gap-1 text-sm">
            {left > 0 ? (
              <p className="text-muted-foreground tabular-nums">
                Отправить ещё раз через {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </p>
            ) : (
              <button type="button" disabled={busy} onClick={() => void requestCode()} className="min-h-11 font-semibold text-primary">
                Отправить код ещё раз
              </button>
            )}
            <button type="button" onClick={back} className="min-h-11 text-muted-foreground">
              Изменить номер
            </button>
          </div>
        </>
      ) : null}

      {step === "name" ? (
        <>
          <h1 className="text-center text-3xl font-extrabold tracking-tight">Как вас зовут?</h1>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative mx-auto mt-8 rounded-full"
            aria-label="Добавить фото"
          >
            <Avatar name={name || "?"} src={photoUrl} size="lg" />
            <span className="absolute -bottom-1 -right-1 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
              <Camera className="size-4" aria-hidden="true" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setPhoto(file);
              setPhotoUrl(URL.createObjectURL(file));
            }}
          />
          <p className="mt-3 text-center text-sm text-muted-foreground">Фото — по желанию</p>
          <label className="mt-6 block">
            <span className="sr-only">Имя</span>
            <input
              autoFocus
              value={name}
              autoComplete="given-name"
              placeholder="Имя"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveName();
              }}
              className="h-14 w-full rounded-2xl border border-border bg-card px-4 text-lg outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </label>
          {error ? <p className="mt-2 px-1 text-sm text-destructive">{error}</p> : null}
          <Button className="mt-5 h-12 w-full shadow-glow" loading={busy} onClick={() => void saveName()}>
            Войти в чат
          </Button>
        </>
      ) : null}
    </div>
  );
}
