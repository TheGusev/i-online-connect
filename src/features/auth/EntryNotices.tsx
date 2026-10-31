import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { authApi, settingsApi } from "@/api";
import { Button, Card } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";
import { dismissNotice, noticeDismissed, noticeKey } from "./first-entry";

export function EntryNotices({ recovery = false }: { recovery?: boolean }) {
  const user = useSessionStore(state => state.user);
  const [hidden, setHidden] = useState(true);
  const kind = recovery ? "recovery" : "verification";
  const methods = useQuery({ queryKey: ["auth-identities"], queryFn: authApi.getIdentities, enabled: recovery && Boolean(user) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: settingsApi.getSettings, enabled: recovery && Boolean(user) });
  useEffect(() => {
    if (!user) return;
    try { setHidden(noticeDismissed(localStorage, user.id, kind) || (!recovery && localStorage.getItem(noticeKey(user.id, "verification-pending")) !== "pending")); }
    catch { setHidden(true); }
  }, [user?.id, kind, recovery]);
  if (!user || hidden || (recovery && (!methods.data || !settings.data || settings.data.account.emailVerified || methods.data.linked.some(provider => provider === "yandex" || provider === "telegram")))) return null;
  const close = () => {
    setHidden(true);
    try { dismissNotice(localStorage, user.id, kind); localStorage.removeItem(noticeKey(user.id, "verification-pending")); } catch { /* storage unavailable */ }
  };
  return <Card className="my-4 flex items-start gap-3 p-4">
    <div className="min-w-0 flex-1 space-y-3">
      <p className="text-sm">{recovery ? "Подтвердите почту или войдите через Яндекс/Telegram, чтобы не потерять аккаунт" : "Пройди видео-проверку: без неё тебе смогут писать не все"}</p>
      <Button asChild variant="secondary" size="sm"><Link to={recovery ? "/settings" : "/verification"} onClick={recovery ? undefined : close}>{recovery ? "Способы связи" : "Пройти видео-проверку"}</Link></Button>
    </div>
    <Button variant="ghost" size="icon" aria-label="Закрыть подсказку" onClick={close}><X className="size-4" /></Button>
  </Card>;
}