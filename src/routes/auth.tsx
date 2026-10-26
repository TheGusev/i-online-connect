import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/api";
import { PasswordResetFlow } from "@/features/auth/PasswordResetFlow";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { PhoneAuthFlow } from "@/features/auth/phone/PhoneAuthFlow";
import { SocialLoginButtons } from "@/features/auth/SocialLoginButtons";

import { Button, Card, Input } from "@/components/ds";
import { useLogin } from "@/features/auth/hooks";
import { SessionLoading, SessionOffline } from "@/features/auth/session";
import { useSessionStore } from "@/store/useSessionStore";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход в «Я Онлайн» — вернуться в свой профиль" },
      {
        name: "description",
        content:
          "Вход в «Я Онлайн» по номеру телефона: срочные дела, чаты и сообщества в одном месте.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Вход в «Я Онлайн»" },
      {
        property: "og:description",
        content: "Срочные дела — в одном чате. Вход по номеру телефона.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"welcome" | "phone" | "email" | "reset">("welcome");
  const config = useQuery({ queryKey: ["auth-config"], queryFn: authApi.getAuthConfig, enabled: mode === "email", retry: false });
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const user = useSessionStore((state) => state.user);
  // Новый аккаунт без имени: показываем только шаг «Как вас зовут?».
  if (status === "authed" && user && !user.name.trim()) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-10 text-foreground">
        <PhoneAuthFlow initialStep="name" onDone={() => void navigate({ to: "/chat" })} />
      </main>
    );
  }
  if (status === "loading" && mode !== "phone") return <SessionLoading />;
  if (status === "offline") return <SessionOffline />;
  if (status === "authed") return <Navigate to="/chat" replace />;

  const submit = () => {
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || password.length < 1) {
      setError(t("auth.error"));
      return;
    }
    setError(null);
    login.mutate(
      { email: value, password },
      {
        onSuccess: () => void navigate({ to: "/chat" }),
        onError: (cause) => {
          console.error("[auth] вход не удался:", cause);
          setError(cause instanceof Error ? cause.message : t("auth.error"));
        },
      },
    );
  };

  if (mode === "welcome") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-16 text-foreground">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="grid size-24 place-items-center rounded-[2rem] bg-primary text-primary-foreground shadow-glow">
            <MessageCircle className="size-12" aria-hidden="true" />
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight">Я онлайн</h1>
          <p className="mt-2 text-lg text-muted-foreground">Срочные дела — в одном чате</p>
        </div>
        <Button className="h-12 w-full shadow-glow" onClick={() => setMode("phone")}>
          Войти по номеру
        </Button>
        <button type="button" onClick={() => setMode("email")} className="mt-3 min-h-11 text-sm font-semibold text-muted-foreground">
          Войти по почте
        </button>
        <div className="mt-3"><SocialLoginButtons /></div>
        <Link to="/nearby" className="mt-8 grid min-h-11 place-items-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          Посмотреть объявления рядом
        </Link>
        <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">
          Продолжая, вы принимаете <Link to="/rules" className="underline">правила сообщества</Link> и{" "}
          <Link to="/safety-center" className="underline">правила безопасности</Link>
        </p>
      </main>
    );
  }

  if (mode === "phone") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-10 text-foreground">
        <PhoneAuthFlow onBack={() => setMode("welcome")} onDone={() => void navigate({ to: "/chat" })} />
        <div className="mt-4"><SocialLoginButtons /></div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center px-4 py-3 lg:px-6">
          <Button variant="ghost" size="sm" onClick={() => setMode(mode === "reset" ? "email" : "welcome")}>
            <ArrowLeft aria-hidden="true" />
            Назад
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">{mode === "reset" ? "Восстановление пароля" : t("auth.title")}</h1>
        {mode !== "reset" && <p className="mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>}

        <Card className="mt-6 space-y-4 p-5">
          {mode === "reset" ? <PasswordResetFlow initialEmail={email} onDone={() => { setPassword(""); setError(null); setMode("email"); }} /> : <>
          <Input
            label={t("auth.email")}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            label={t("auth.password")}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          {error && <p className="px-1 text-xs text-destructive">{error}</p>}
          <Button className="w-full" disabled={login.isPending} onClick={submit}>
            {login.isPending ? t("auth.loading") : t("auth.submit")}
          </Button>
          {config.data?.passwordResetEnabled && <Button variant="ghost" fullWidth onClick={() => setMode("reset")}>Забыли пароль?</Button>}
          </>}
        </Card>
        {mode === "email" && <div className="mt-4"><SocialLoginButtons /></div>}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link
            to="/onboarding"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("auth.start")}
          </Link>
        </p>
      </main>
    </div>
  );
}
