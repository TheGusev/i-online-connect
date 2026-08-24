import { useState } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { Button, Card, Input } from "@/components/ds";
import { useLogin } from "@/features/auth/hooks";
import { SessionLoading } from "@/features/auth/session";
import { useSessionStore } from "@/store/useSessionStore";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход в «Я Онлайн» — вернуться в свой профиль" },
      {
        name: "description",
        content:
          "Войдите в «Я Онлайн» по email и паролю, чтобы вернуться к своим совпадениям, чатам и пространствам.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Вход в «Я Онлайн»" },
      {
        property: "og:description",
        content: "Ваши совпадения, диалоги и сообщества — там, где вы их оставили.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useSessionStore((state) => state.status);
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") return <SessionLoading />;
  if (status === "authed") return <Navigate to="/feed" replace />;

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
        onSuccess: () => void navigate({ to: "/feed" }),
        onError: (cause) => {
          console.error("[auth] вход не удался:", cause);
          setError(cause instanceof Error ? cause.message : t("auth.error"));
        },
      },
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center px-4 py-3 lg:px-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft aria-hidden="true" />
              {t("app.name")}
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">{t("auth.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

        <Card className="mt-6 space-y-4 p-5">
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
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link to="/onboarding" className="font-semibold text-primary underline-offset-4 hover:underline">
            {t("auth.start")}
          </Link>
        </p>
      </main>
    </div>
  );
}
