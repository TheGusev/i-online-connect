import { PauseCircle } from "lucide-react";
import { toast } from "sonner";

import type { PrivacySettings } from "@/api";
import { Button, Card } from "@/components/ds";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/hooks";
import { PrivacySection } from "@/features/profile/components/PrivacySection";

/** Приватность в настройках: те же переключатели, что в профиле, плюс режим «Пауза». */
export function PrivacyPanel() {
  const { data: profile, isLoading } = useMyProfile();
  const updateProfile = useUpdateMyProfile();

  if (isLoading || !profile) {
    return <Card className="p-6 text-sm text-muted-foreground">Загружаем настройки…</Card>;
  }

  const privacy = profile.privacy;

  const patchPrivacy = (patch: Partial<PrivacySettings>) => {
    updateProfile.mutate({ privacy: { ...privacy, ...patch } });
  };

  const togglePause = () => {
    const nextVisible = !privacy.visibleInFeed;
    patchPrivacy({ visibleInFeed: nextVisible });
    if (nextVisible) {
      toast.success("Профиль снова в подборках", {
        description: "Тебя опять видят в дневных совпадениях.",
      });
    } else {
      toast("Твой профиль временно скрыт из ленты", {
        description: "Аккаунт и переписки на месте — вернуть видимость можно в один клик.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <PrivacySection privacy={privacy} onChange={patchPrivacy} />

      <Card className="border-warning/40 bg-warning-soft/50 p-6">
        <div className="flex items-start gap-3">
          <PauseCircle className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Пауза</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Это не удаление аккаунта. На паузе профиль исчезает из чужих подборок и поиска, но
              твои чаты, Spaces, фото и уровень доверия сохраняются. Включить обратно можно в любой
              момент — ничего заново заполнять не нужно.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={togglePause}
              disabled={updateProfile.isPending}
            >
              {privacy.visibleInFeed ? "Поставить профиль на паузу" : "Вернуться в ленту"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
