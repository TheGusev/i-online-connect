import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, mediaApi, profileApi } from "@/api";
import { Avatar, Button, Input } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";
import { noticeDismissed, noticeKey, validEntryAge } from "./first-entry";

export function ShortEntry() {
  const user = useSessionStore(state => state.user);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [age, setAge] = useState("");
  const [city, setCity] = useState(user?.city ?? "");
  const [adult, setAdult] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function save() {
    if (!user || busy) return;
    if (name.trim().length < 2 || !city.trim() || !validEntryAge(age) || !adult) {
      setError("Укажите имя, возраст от 18 до 100, город и подтвердите 18+"); return;
    }
    setBusy(true); setError(null);
    try {
      // Upload first: if it fails the required step remains open for a retry or skip.
      if (photo) await mediaApi.uploadMedia(photo, photo.name);
      const profile = await profileApi.updateMyProfile({ name: name.trim(), age: Number(age), city: city.trim(), adultConfirmed: true });
      try { if (!noticeDismissed(localStorage, user.id, "verification")) localStorage.setItem(noticeKey(user.id, "verification-pending"), "pending"); } catch { /* storage may be unavailable */ }
      cache.setQueryData(["my-profile"], profile);
      useSessionStore.getState().setUser(await authApi.getCurrentUser());
      await navigate({ to: "/chat", replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить профиль"); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-10 text-foreground" data-no-swipe>
    <h1 className="text-3xl font-extrabold">Расскажи о себе</h1>
    <label className="flex cursor-pointer items-center gap-4">
      <Avatar name={name || "?"} src={preview ?? user?.avatarUrl} size="lg" />
      <span className="text-sm text-primary">Фото по желанию</span>
      <input aria-label="Фото по желанию" type="file" accept="image/*" className="sr-only" onChange={event => setPhoto(event.target.files?.[0] ?? null)} />
    </label>
    <Input label="Имя" autoComplete="given-name" maxLength={80} value={name} onChange={event => setName(event.target.value)} />
    <Input label="Возраст" inputMode="numeric" value={age} onChange={event => setAge(event.target.value)} />
    <Input label="Город" autoComplete="address-level2" maxLength={120} value={city} onChange={event => setCity(event.target.value)} />
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={adult} onChange={event => setAdult(event.target.checked)} className="size-5 accent-primary" />Мне есть 18 лет</label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button fullWidth loading={busy} onClick={() => void save()}>Сохранить</Button>
  </main>;
}