import { EyeOff, MapPin, MessageSquareLock } from "lucide-react";

import type { PrivacySettings } from "@/api";
import { Card, Select } from "@/components/ds";

const locationOptions = [
  { value: "nobody", label: "Никто — только город" },
  { value: "matches", label: "Только совпадения" },
  { value: "everyone", label: "Все участники" },
];

const messageOptions = [
  { value: "everyone", label: "Кто угодно" },
  { value: "verified", label: "Только подтверждённые" },
  { value: "matches", label: "Только мои совпадения" },
];

/** Настройки приватности: геолокация, видимость в ленте, кто пишет первым. */
export function PrivacySection({
  privacy,
  onChange,
}: {
  privacy: PrivacySettings;
  onChange: (patch: Partial<PrivacySettings>) => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Кто видит точную геолокацию</p>
            <p className="mb-4 mt-1 text-sm leading-relaxed text-muted-foreground">
              Город виден всегда, точка на карте — по твоему выбору.
            </p>
            <Select
              label="Доступ к геолокации"
              value={privacy.exactLocation}
              options={locationOptions}
              onChange={(event) =>
                onChange({ exactLocation: event.target.value as PrivacySettings["exactLocation"] })
              }
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <EyeOff className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Видимость профиля в ленте</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Можно временно скрыться: профиль не попадёт в чужие подборки, переписки сохранятся.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={privacy.visibleInFeed}
            aria-label="Видимость профиля в ленте"
            onClick={() => onChange({ visibleInFeed: !privacy.visibleInFeed })}
            className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
              privacy.visibleInFeed ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-1 size-5 rounded-full bg-card shadow-soft transition-all ${
                privacy.visibleInFeed ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {privacy.visibleInFeed ? "Профиль показывается в подборках" : "Профиль временно скрыт"}
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <MessageSquareLock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Кто может написать первым</p>
            <p className="mb-4 mt-1 text-sm leading-relaxed text-muted-foreground">
              Ограничение помогает получать меньше случайных сообщений.
            </p>
            <Select
              label="Первое сообщение"
              value={privacy.whoCanMessage}
              options={messageOptions}
              onChange={(event) =>
                onChange({ whoCanMessage: event.target.value as PrivacySettings["whoCanMessage"] })
              }
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
