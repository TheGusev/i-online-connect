import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { authApi } from "@/api";
import { Button } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { needsFirstEntry } from "@/features/auth/first-entry";

export const Route = createFileRoute("/oauth-callback")({
  head: () => ({ meta: [{ title: "Завершение входа — Я Онлайн" }, { name: "description", content: "Безопасное завершение входа через Яндекс ID или Telegram в Я Онлайн." },
    { property: "og:title", content: "Завершение входа — Я Онлайн" }, { property: "og:description", content: "Возвращение в свой аккаунт Я Онлайн." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: OAuthCallback,
});
// Shares the one-use redemption during React effect remounts; no credentials in URLs/storage.
let redemption: { key: string; promise: ReturnType<typeof authApi.completeOAuth> } | undefined;
function OAuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href), provider = url.searchParams.get("provider"), state = url.searchParams.get("state"), reason = url.searchParams.get("oauth");
    if (reason || (provider !== "yandex" && provider !== "telegram") || !state) {
      setError(reason === "account_unavailable" ? "Аккаунт удалён или заблокирован" : "Вход не завершён. Попробуйте снова"); return;
    }
    const key = `${provider}:${state}`;
    if (redemption?.key !== key) redemption = { key, promise: authApi.completeOAuth(provider, state) };
    let active = true;
    redemption.promise.then(result => {
      if (!active) return;
      window.history.replaceState(window.history.state, "", url.pathname);
      useSessionStore.getState().setSession(result);
      if (result.isNew) { useOnboardingStore.getState().reset(); useOnboardingStore.getState().patchDraft({ name: result.user.name }); }
      void navigate({ to: needsFirstEntry(result.user) ? "/onboarding" : "/chat", replace: true });
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось завершить вход"); });
    return () => { active = false; };
  }, [navigate]);
  return <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground"><div className="max-w-sm space-y-4 text-center">
    <h1 className="text-xl font-bold">{error ? "Не удалось войти" : "Завершаем вход…"}</h1>
    {error ? <><p className="text-sm text-muted-foreground">{error}</p><Button asChild className="min-h-11"><Link to="/auth">Вернуться ко входу</Link></Button></> : <span className="mx-auto block size-8 animate-spin rounded-full border-2 border-border border-t-primary" />}
  </div></main>;
}