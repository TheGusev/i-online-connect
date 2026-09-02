/**
 * Вход в админку. Отдельная форма, не связанная с пользовательским /auth:
 * пользовательская сессия админку не открывает даже у администратора.
 *
 * Защита формы:
 *  - honeypot: скрытое поле contactFax, которое человек не видит. Заполнено —
 *    сервер отвечает обычной ошибкой входа и ничего не делает;
 *  - Yandex SmartCaptcha, если задан VITE_YANDEX_CAPTCHA_KEY (скрипт грузим
 *    только на этой странице, чтобы не тянуть его в обычное приложение);
 *  - кнопка блокируется на время запроса — двойной сабмит не проходит;
 *  - текст ошибки всегда общий: подсказывать боту, что не так, нельзя.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { adminApi, setAdminSession } from "@/api/admin";
import { ApiError } from "@/api/client";
import { Button, Card, Input } from "@/components/ds";

const CAPTCHA_KEY = (import.meta.env["VITE_YANDEX_CAPTCHA_KEY"] as string | undefined) ?? "";

declare global {
  interface Window {
    smartCaptcha?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; hl?: string; callback?: (token: string) => void },
      ) => number;
    };
  }
}

function useSmartCaptcha(onToken: (token: string) => void) {
  const holder = useRef<HTMLDivElement | null>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!CAPTCHA_KEY || rendered.current) return;

    const render = () => {
      if (!holder.current || rendered.current || !window.smartCaptcha) return;
      rendered.current = true;
      window.smartCaptcha.render(holder.current, {
        sitekey: CAPTCHA_KEY,
        hl: "ru",
        callback: onToken,
      });
    };

    if (window.smartCaptcha) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://smartcaptcha.yandexcloud.net/captcha.js";
    script.defer = true;
    script.onload = render;
    document.head.append(script);
  }, [onToken]);

  return { holder, enabled: Boolean(CAPTCHA_KEY) };
}

export function AdminLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const captcha = useSmartCaptcha(setCaptchaToken);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      const result = await adminApi.login({
        email,
        password,
        totp,
        ...(captchaToken ? { captchaToken } : {}),
        ...(honeypot ? { contactFax: honeypot } : {}),
      });
      setAdminSession(result.token, result.expiresIn);
      toast.success("Вход выполнен");
      onDone();
    } catch (cause) {
      // Причину не детализируем: пароль, код или роль — сообщение одно.
      const message =
        cause instanceof ApiError && cause.status === 429
          ? "Слишком много попыток. Подождите 10 минут."
          : "Не удалось войти. Проверьте данные и код в приложении.";
      setError(message);
      setTotp("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-bold text-foreground">Служебный вход</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Доступ только для администраторов. Нужен код из приложения-аутентификатора.
        </p>

        <form className="mt-5 space-y-3" onSubmit={submit} noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
          />
          <Input
            label="Пароль"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            maxLength={200}
          />
          <Input
            label="Код из приложения"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />

          {/* Ловушка для ботов: скрыта от людей и от скринридеров. */}
          <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
            <label htmlFor="contactFax">Fax</label>
            <input
              id="contactFax"
              name="contactFax"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          {captcha.enabled ? <div ref={captcha.holder} className="min-h-[80px]" /> : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <Button type="submit" fullWidth loading={busy}>
            Войти
          </Button>
        </form>
      </Card>
    </main>
  );
}
