import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authApi } from "@/api";
import type { OAuthProvider } from "@/api/endpoints/auth";
import { Button, Card, Modal } from "@/components/ds";

export function LoginMethods() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ["auth-config"], queryFn: authApi.getAuthConfig, retry: false });
  const methods = useQuery({ queryKey: ["auth-identities"], queryFn: authApi.getIdentities });
  const [remove, setRemove] = useState<OAuthProvider | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("oauth");
    if (!result) return;
    if (result === "linked") toast.success("Способ входа привязан");
    else toast.error(result === "identity_taken" ? "Этот способ входа уже привязан к другому аккаунту" : result === "account_unavailable" ? "Аккаунт недоступен" : "Не удалось привязать способ входа. Попробуйте снова");
    url.searchParams.delete("oauth"); window.history.replaceState(window.history.state, "", url);
  }, []);
  async function link(provider: OAuthProvider) {
    setPending(true); setError(null);
    try { const { url } = await authApi.startIdentityLink(provider); window.location.assign(url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось начать привязку"); setPending(false); }
  }
  async function unlink() {
    if (!remove) return;
    setPending(true); setError(null);
    try { await authApi.unlinkIdentity(remove); await queryClient.invalidateQueries({ queryKey: ["auth-identities"] }); setRemove(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отвязать"); }
    finally { setPending(false); }
  }
  return <>
    <Card className="p-5">
      <h2 className="font-semibold">Способы входа</h2>
      {methods.isError && <p className="mt-3 text-sm text-destructive">Не удалось загрузить способы входа</p>}
      {methods.isPending ? <p className="mt-3 text-sm text-muted-foreground">Загрузка…</p> : <div className="mt-3 divide-y divide-border">
        {[{ name: "Телефон", enabled: methods.data?.phone }, { name: "Почта и пароль", enabled: methods.data?.email }].map(item => <div key={item.name} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{item.name}</span><span className="text-muted-foreground">{item.enabled ? "Подключён" : "Не подключён"}</span></div>)}
        {(["yandex", "telegram"] as const).map(provider => {
          const linked = methods.data?.linked.includes(provider);
          const enabled = config.data?.providers?.[provider];
          const hasAlternative = methods.data?.email || methods.data?.phone || methods.data?.linked.some(value => value !== provider);
          return <div key={provider} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="text-sm font-medium">{provider === "yandex" ? "Яндекс ID" : "Telegram"}</p><p className="text-xs text-muted-foreground">{linked ? "Привязан" : enabled ? "Не привязан" : "Недоступен"}</p></div>
            {linked ? <Button variant="ghost" size="sm" className="min-h-11" disabled={pending || !hasAlternative} title={!hasAlternative ? "Это последний способ входа" : undefined} onClick={() => { setError(null); setRemove(provider); }}>Отвязать</Button> : enabled && <Button variant="secondary" size="sm" className="min-h-11" disabled={pending || !methods.data} onClick={() => void link(provider)}>Привязать</Button>}
          </div>;
        })}
      </div>}
      {error && !remove && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
    <Modal open={Boolean(remove)} onClose={() => { if (!pending) setRemove(null); }} title="Отвязать способ входа?" footer={<><Button variant="ghost" disabled={pending} onClick={() => setRemove(null)}>Отмена</Button><Button disabled={pending} onClick={() => void unlink()}>Отвязать</Button></>}>
      <p className="text-sm text-muted-foreground">{remove === "yandex" ? "Яндекс ID" : "Telegram"}</p>{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Modal>
  </>;
}