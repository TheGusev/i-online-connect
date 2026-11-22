import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  NotificationBannerContent,
  toParts,
} from "./components/NotificationBannerContent";

interface GtaToastOptions {
  actorActivity?: unknown;
  kind?: string | undefined;
  id?: string | number | undefined;
  description?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  action?: { label: string; onClick: () => void } | undefined;
}

function GtaBanner({
  toastId,
  parts,
  avatarUrl,
  onOpen,
  actorActivity,
  kind,
}: {
  toastId: string | number;
  parts: ReturnType<typeof toParts>;
  avatarUrl: string | null;
  onOpen: (() => void) | undefined;
  actorActivity: unknown;
  kind: string | undefined;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const out = window.setTimeout(() => setLeaving(true), 4300);
    const gone = window.setTimeout(() => toast.dismiss(toastId), 4750);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(gone);
    };
  }, [toastId]);

  return (
    <button
      type="button"
      className="gta-toast urgent-tile"
      data-leaving={leaving ? "true" : "false"}
      onClick={() => {
        onOpen?.();
        setLeaving(true);
        window.setTimeout(() => toast.dismiss(toastId), 380);
      }}
    >
      <NotificationBannerContent
        parts={parts}
        avatarUrl={avatarUrl}
        actorActivity={actorActivity}
        kind={kind}
      />
    </button>
  );
}

const seen = new Map<string | number, number>();
let activeId: string | number | undefined;

/** Баннер «миссия выполнена»: один на экране, повтор того же уведомления не показываем. */
export function gtaToast(title: string, options: GtaToastOptions = {}) {
  const key = options.id ?? title;
  const now = Date.now();
  const last = seen.get(key);
  if (last !== undefined && now - last < 30_000) return key;
  seen.set(key, now);
  for (const [stored, at] of seen) if (now - at > 60_000) seen.delete(stored);

  if (activeId !== undefined) toast.dismiss(activeId);
  const id = options.id ?? `gta-${now}`;
  activeId = id;

  const parts = toParts(title, options.description);
  return toast.custom(
    (toastId) => (
      <GtaBanner
        toastId={toastId}
        parts={parts}
        avatarUrl={options.avatarUrl ?? null}
        onOpen={options.action?.onClick}
        actorActivity={options.actorActivity}
        kind={options.kind}
      />
    ),
    {
      id,
      duration: 6000,
      unstyled: true,
      className: "ya-gta-toast-shell",
    },
  );
}
