import { RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ds";
import { useAppVersion } from "@/hooks/useAppVersion";

/**
 * Неблокирующий баннер «Вышло обновление».
 *
 * Появляется, когда /version.json отдал новую версию сборки. Ничего не
 * перезагружает автоматически: пользователь сам решает, когда обновиться.
 */
export function UpdateBanner() {
  const { updateAvailable, dismiss } = useAppVersion();

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-3 pl-4 shadow-soft">
        <p className="flex-1 text-sm text-foreground">
          Вышло обновление — можно продолжить и обновить позже.
        </p>
        <Button size="sm" onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden="true" />
          Обновить
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Скрыть сообщение об обновлении"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
