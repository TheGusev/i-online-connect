import { Camera, Check, MapPin, Pencil, Settings, Share2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";

import type { MyProfile } from "@/api";
import { Avatar, Button, Card, TrustBadge } from "@/components/ds";
import { badgeLevel } from "@/features/chat/trust";

/** Компактная визитка владельца профиля: вместо крупной фото-карусели. */
export function BusinessCard({
  profile,
  onEdit,
  onShare,
  onUpload,
  onDelete,
  uploadDisabled,
  busy,
}: {
  profile: MyProfile;
  onEdit: () => void;
  onShare: () => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  uploadDisabled: boolean;
  busy: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const photos = profile.media.filter((item) => item.kind === "photo");
  const primary = photos.find((item) => item.isPrimary) ?? photos[0];
  const verified = profile.verification === "verified";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={profile.name} src={primary?.url ?? null} size="lg" verified={verified} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-lg font-bold">{profile.name}</h1>
            {verified ? <TrustBadge level={badgeLevel(profile.trustLevel)} /> : null}
          </div>
          {profile.bio ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{profile.bio}</p>
          ) : (
            <button type="button" onClick={onEdit} className="text-sm font-semibold text-primary">
              Расскажите, чем занимаетесь
            </button>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {profile.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {profile.city}
              </span>
            ) : null}
            {verified ? (
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                <Check className="size-3.5" aria-hidden="true" />
                Подтверждён
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil aria-hidden="true" />
          Редактировать
        </Button>
        <Button variant="secondary" size="sm" onClick={onShare}>
          <Share2 aria-hidden="true" />
          Поделиться
        </Button>
        <Button variant="secondary" size="icon" asChild>
          <Link to="/settings" aria-label="Настройки">
            <Settings aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <ul data-no-swipe className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((photo) => (
          <li key={photo.id} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
            <img src={photo.url} alt="" className="size-full object-cover" />
            <button
              type="button"
              aria-label="Удалить фото"
              disabled={busy}
              onClick={() => onDelete(photo.id)}
              className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-background/80 text-foreground"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
        {!uploadDisabled ? (
          <li className="shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="grid size-16 place-items-center rounded-xl border border-dashed border-border text-primary"
              aria-label="Добавить фото"
            >
              <Camera className="size-5" aria-hidden="true" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.target.value = "";
              }}
            />
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
