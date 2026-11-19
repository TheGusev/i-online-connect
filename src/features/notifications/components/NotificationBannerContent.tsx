import { readActivityStars } from "../activity-view";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ds";

interface Parts {
  kicker: string;
  headline: string;
  detail: string | null;
}

/** Разбираем готовый заголовок на тип, имя и текст — без повторов в баннере. */
export function toParts(title: string, description: string | null | undefined): Parts {
  const message = /^Новое сообщение от (.+)$/.exec(title);
  if (message) {
    return { kicker: "Новое сообщение", headline: message[1] ?? title, detail: description ?? null };
  }
  const match = /^Совпадение! Вы понравились друг другу с (.+)$/.exec(title);
  if (match) {
    return { kicker: "Совпадение!", headline: match[1] ?? title, detail: description ?? "Откройте профиль и начните разговор" };
  }
  const joined = /^(.+) вступил\(а\) в «(.+)»$/.exec(title);
  if (joined) {
    return { kicker: "Новый участник", headline: joined[1] ?? title, detail: `в «${joined[2] ?? ""}»` };
  }
  const request = /^Заявка в «(.+)» от (.+)$/.exec(title);
  if (request) {
    return { kicker: "Заявка в сообщество", headline: request[2] ?? title, detail: `«${request[1] ?? ""}»` };
  }
  const invite = /^(.+) приглашает вас в сообщество «(.+)»$/.exec(title);
  if (invite) {
    return { kicker: "Приглашение", headline: invite[1] ?? title, detail: `в «${invite[2] ?? ""}»` };
  }
  if (/сообществ|встреч|эфир/i.test(title)) {
    return { kicker: "В сообществе", headline: title, detail: description ?? null };
  }
  return { kicker: "Задание выполнено", headline: title, detail: description ?? null };
}

export function NotificationBannerContent({
  parts,
  avatarUrl,
  visual,
  actorActivity,
  kind,
}: {
  parts: Parts;
  avatarUrl: string | null;
  visual?: ReactNode;
  actorActivity?: unknown;
  kind?: string | undefined;
}) {
  const activityStars = readActivityStars(actorActivity);

  return (
    <>
      <span className="gta-toast__avatar avatar-ring avatar-ring-sm">
        {visual ?? <Avatar name={parts.headline} src={avatarUrl} size="sm" />}
      </span>
      <span className="gta-toast__body" data-kind={kind ?? "generic"}>
        <span className="gta-toast__head">
          <span className="gta-toast__kicker">{parts.kicker}</span>
          <span
            className="gta-toast__stars"
            role="img"
            aria-label={
              activityStars === null
                ? "Нет данных об активности автора"
                : `Активность автора: ${activityStars} из 5 за последний час на момент события`
            }
          >
            {Array.from({ length: 5 }, (_, index) => {
              const filled = activityStars !== null && index < activityStars;
              return (
                <span
                  key={index}
                  aria-hidden="true"
                  className={filled ? "gta-toast__star--filled" : "gta-toast__star--empty"}
                  style={{ animationDelay: `${280 + index * 140}ms` }}
                >
                  {filled ? "★" : "☆"}
                </span>
              );
            })}
          </span>
        </span>
        <span className="gta-toast__title">{parts.headline}</span>
        {parts.detail ? <span className="gta-toast__desc">{parts.detail}</span> : null}
      </span>
    </>
  );
}
