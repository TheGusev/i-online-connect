import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { toast } from "sonner";

import { request } from "@/api/client";
import { CITY_OPTIONS, cityCode, normCity } from "@/lib/cityCode";
import { useCurrentCity } from "./useCurrentCity";

interface Place {
  id: string;
  city: string;
  regionId: string;
  regionalCenter: string;
}

const pillBase =
  "inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-ink";

export function CityPill({ onOther }: { onOther: () => void }) {
  const client = useQueryClient();
  const { city } = useCurrentCity();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = useMutation({
    mutationFn: async (name: string) => {
      const found = await request<{ items: Place[] }>("/geo/places", { query: { q: name } });
      const place = found.items.find((item) => normCity(item.city) === normCity(name));
      if (!place) throw new Error(`Город «${name}» не найден в справочнике`);
      return request<{ status: "resolved"; place: Place; demoReady: boolean }>("/geo/me", {
        method: "PUT",
        body: { placeId: place.id },
      });
    },
    onSuccess: async (result) => {
      setOpen(false);
      toast.success(`Город: ${result.place.city}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["geo", "me"] }),
        client.invalidateQueries({ queryKey: ["spaces"] }),
        client.invalidateQueries({ queryKey: ["profile"] }),
        client.invalidateQueries({ queryKey: ["presence"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Не удалось сменить город"),
  });

  return (
    <div ref={rootRef} className="relative mb-1 flex flex-wrap items-center gap-2" data-no-swipe>
      <p className={pillBase}>
        <MapPin className="size-3.5" aria-hidden="true" />
        РЯДОМ
      </p>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={choose.isPending}
        onClick={() => setOpen((value) => !value)}
        className={`${pillBase} border border-primary/30 transition active:scale-95 disabled:opacity-60`}
      >
        {choose.isPending ? "…" : city ? cityCode(city) : "ГОРОД"}
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="Выбор города"
          className="absolute left-0 top-full z-30 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-lg"
        >
          {CITY_OPTIONS.map((option) => {
            const active = city !== null && normCity(city) === normCity(option.name);
            return (
              <li key={option.name} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={choose.isPending}
                  onClick={() => (active ? setOpen(false) : choose.mutate(option.name))}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-60"
                >
                  <span className="w-10 font-semibold tabular-nums">{option.code}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{option.name}</span>
                  {active ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
          <li role="presentation">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOther();
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-secondary"
            >
              Другой город…
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
