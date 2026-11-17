import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ds";

interface GtaToastOptions {
  id?: string | number | undefined;
  description?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  action?: { label: string; onClick: () => void } | undefined;
}

interface Parts {
  kicker: string;
  headline: string;
  detail: string | null;
  stars: number;
}

/** Разбираем готовый заголовок на тип, имя и текст — без повторов в баннере. */
function toParts(title: string, description: string | null | undefined): Parts {
  const message = /^Новое сообщение от (.+)$/.exec(title);
  if (message) {
    return { kicker: "Новое сообщение", headline: message[1] ?? title, detail: description ?? null, stars: 1 };
  }
  const match = /^Совпадение! Вы понравились друг другу с (.+)$/.exec(title);
  if (match) {
    return { kicker: "Совпадение!", headline: match[1] ?? title, detail: description ?? "Откройте профиль и начните разговор", stars: 3 };
  }
  const joined = /^(.+) вступил\(а\) в «(.+)»$/.exec(title);
  if (joined) {
    return { kicker: "Новый участник", headline: joined[1] ?? title, detail: `в «${joined[2] ?? ""}»`, stars: 2 };
  }
  const request = /^Заявка в «(.+)» от (.+)$/.exec(title);
  if (request) {
    return { kicker: "Заявка в сообщество", headline: request[2] ?? title, detail: `«${request[1] ?? ""}»`, stars: 2 };
  }
  const invite = /^(.+) приглашает вас в сообщество «(.+)»$/.exec(title);
  if (invite) {
    return { kicker: "Приглашение", headline: invite[1] ?? title, detail: `в «${invite[2] ?? ""}»`, stars: 2 };
  }
  if (/сообществ|встреч|эфир/i.test(title)) {
    return { kicker: "В сообществе", headline: title, detail: description ?? null, stars: 2 };
  }
  return { kicker: "Задание выполнено", headline: title, detail: description ?? null, stars: 1 };
}

function GtaBanner({
  toastId,
  parts,
  avatarUrl,
  onOpen,
}: {
  toastId: string | number;
  parts: Parts;
  avatarUrl: string | null;
  onOpen: (() => void) | undefined;
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
      <span className="gta-toast__avatar avatar-ring avatar-ring-sm">
        <Avatar name={parts.headline} src={avatarUrl} size="sm" />
      </span>
      <span className="gta-toast__body">
        <span className="gta-toast__head">
          <span className="gta-toast__kicker">{parts.kicker}</span>
          <span className="gta-toast__stars" aria-hidden="true">
            {Array.from({ length: parts.stars }, (_, index) => (
              <span key={index} style={{ animationDelay: `${280 + index * 140}ms` }}>
                ★
              </span>
            ))}
          </span>
        </span>
        <span className="gta-toast__title">{parts.headline}</span>
        {parts.detail ? <span className="gta-toast__desc">{parts.detail}</span> : null}
      </span>
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
      />
    ),
    { id, duration: 6000 },
  );
}
