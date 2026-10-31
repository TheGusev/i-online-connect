import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/api";
import { Button } from "@/components/ds";
import { ContactConfirm } from "@/features/settings/components/ContactConfirm";

export function VerifiedContactStep() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: settingsApi.getSettings });
  const account = settings.data?.account;
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Подтвердите почту или привяжите Яндекс ID / Telegram.</p>
    {account?.email && !account.emailVerified && <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">Подтвердите почту</p><ContactConfirm channel="email" value={account.email} /></div>}
    {account?.emailVerified && <p className="text-sm text-primary">Почта подтверждена — можно повторить действие.</p>}
    <Button asChild variant="secondary" fullWidth><Link to="/settings">Способы связи</Link></Button>
  </div>;
}