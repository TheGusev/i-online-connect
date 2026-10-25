import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { authApi } from "@/api";
import { Button } from "@/components/ds";

export function SocialLoginButtons() {
  const config = useQuery({ queryKey: ["auth-config"], queryFn: authApi.getAuthConfig, retry: false });
  const providers = config.data?.providers;
  if (!providers?.yandex && !providers?.telegram) return null;
  return <div className="grid w-full gap-2">
    {providers.yandex && <Button variant="secondary" fullWidth className="min-h-11" onClick={() => window.location.assign(authApi.socialStartUrl("yandex"))}>
      <span aria-hidden="true" className="text-lg font-bold text-primary">Я</span>Войти через Яндекс
    </Button>}
    {providers.telegram && <Button variant="secondary" fullWidth className="min-h-11" onClick={() => window.location.assign(authApi.socialStartUrl("telegram"))}>
      <Send className="size-4" aria-hidden="true" />Войти через Telegram
    </Button>}
  </div>;
}