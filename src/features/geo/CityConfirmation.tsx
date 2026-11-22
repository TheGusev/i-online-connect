import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/api/client";
import { BottomSheet, Button, Input } from "@/components/ds";
import { useSessionStore } from "@/store/useSessionStore";

interface Place {
  id: string;
  city: string;
  regionId: string;
  regionalCenter: string;
}
interface Geography {
  status: "resolved" | "needs_city";
  profileCity: string;
  place: Place | null;
  message: string | null;
  suggestion: string | null;
}
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось выполнить запрос";

export function CityConfirmation() {
  const status = useSessionStore(state => state.status);
  const userId = useSessionStore(state => state.user?.id);
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Place | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setOpen(false);
    setQuery("");
    setSelected(null);
    setNotice("");
  }, [userId]);

  const geography = useQuery({
    queryKey: ["geo", "me", userId],
    queryFn: ({ signal }) => request<Geography>("/geo/me", { signal }),
    enabled: status === "authed" && Boolean(userId),
    retry: false,
  });

  const places = useQuery({
    queryKey: ["geo", "places", userId, debounced],
    queryFn: ({ signal }) => request<{ items: Place[]; directoryOnly: boolean }>(
      "/geo/places", { query: { q: debounced }, signal },
    ),
    enabled: status === "authed" && open && debounced.length >= 2,
    retry: false,
    staleTime: 30000,
  });

  const save = useMutation({
    mutationFn: (placeId: string) =>
      request<{ status: "resolved"; place: Place; demoReady: boolean }>(
        "/geo/me", { method: "PUT", body: { placeId } },
      ),
    onSuccess: async result => {
      if (useSessionStore.getState().user?.id !== userId) return;
      setOpen(false);
      setSelected(null);
      setNotice(result.demoReady
        ? "Город подтверждён"
        : "Город сохранён. Демо-сообщества пока недоступны.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["geo", "me"] }),
        client.invalidateQueries({ queryKey: ["spaces"] }),
        client.invalidateQueries({ queryKey: ["profile"] }),
      ]);
    },
  });

  if (status !== "authed") return null;
  const current = geography.data;
  const searching = query.trim() !== debounced || places.isFetching;
  const changeCity = () => {
    setQuery("");
    setSelected(null);
    setNotice("");
    save.reset();
    setOpen(true);
  };

  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-4" data-no-swipe>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {current?.status === "resolved"
              ? `Ваш город: ${current.place?.city ?? current.profileCity}`
              : "Уточните город для сообществ рядом"}
          </p>
          {geography.isPending ? <p role="status">Проверяем город…</p> : null}
          {current?.status === "needs_city" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Выберите населённый пункт из справочника. Мы не меняем город без вашего согласия.
            </p>
          ) : null}
          {geography.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorText(geography.error)}
            </p>
          ) : null}
          {notice ? <p role="status" className="mt-1 text-sm">{notice}</p> : null}
        </div>
        <Button size="sm" variant="secondary" onClick={changeCity}>
          {current?.status === "resolved" ? "Изменить город" : "Выбрать город"}
        </Button>
        {geography.isError ? (
          <Button size="sm" variant="ghost" onClick={() => void geography.refetch()}>
            Повторить проверку города
          </Button>
        ) : null}
      </div>

      <BottomSheet
        open={open}
        onClose={() => { if (!save.isPending) setOpen(false); }}
        title="Подтвердите ваш город"
      >
        <div className="space-y-4">
          <Input
            label="Поиск населённого пункта"
            hint="Введите минимум 2 символа"
            maxLength={120}
            value={query}
            disabled={save.isPending}
            onChange={event => {
              setQuery(event.target.value);
              setSelected(null);
              save.reset();
            }}
          />
          {query.trim().length >= 2 && searching ? <p role="status">Ищем города…</p> : null}
          {places.isError && query.trim() === debounced ? (
            <p role="alert">{errorText(places.error)}</p>
          ) : null}
          {!searching && debounced.length >= 2 && places.data?.items.length === 0 ? (
            <p>Населённый пункт не найден. Уточните название.</p>
          ) : null}

          <ul className="space-y-2">
            {!searching ? places.data?.items.map(place => (
              <li key={place.id}>
                <Button
                  fullWidth
                  variant={selected?.id === place.id ? "primary" : "secondary"}
                  disabled={save.isPending}
                  aria-pressed={selected?.id === place.id}
                  onClick={() => setSelected(place)}
                >
                  {place.city} — региональный центр: {place.regionalCenter}
                </Button>
              </li>
            )) : null}
          </ul>

          {selected ? <p>Выбрано: {selected.city}</p> : null}
          {save.isError ? <p role="alert">{errorText(save.error)}</p> : null}
          <Button
            fullWidth
            disabled={!selected || save.isPending}
            onClick={() => { if (selected) save.mutate(selected.id); }}
          >
            {save.isPending ? "Сохраняем город…" : "Подтвердить город"}
          </Button>
        </div>
      </BottomSheet>
    </section>
  );
}
