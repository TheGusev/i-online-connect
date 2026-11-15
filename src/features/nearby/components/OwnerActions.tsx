import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Listing } from "@/api";
import { listingsApi } from "@/api";
import { BottomSheet, Button, Input } from "@/components/ds";

import { priceApplies } from "../labels";
import { moneyInput } from "../urgent-ui";

export function OwnerActions({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState<"save" | "finish" | "delete" | null>(null);
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description ?? "");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const urgent = Boolean(listing.urgentType);
  const active = listing.state === "active";
  const showPrice = !urgent && priceApplies(listing.category);
  const hasReservation = Boolean(listing.reservation?.active || listing.activeReservation);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["listings"] });
  const fail = (cause: unknown) =>
    toast.error(cause instanceof Error ? cause.message : "Не удалось выполнить действие");

  const openEdit = () => {
    setTitle(listing.title);
    setDescription(listing.description ?? "");
    setPrice(listing.priceMinor != null ? String(listing.priceMinor / 100) : "");
    setError(null);
    setPanel(true);
  };

  const finishListing = async () => {
    if (urgent) await listingsApi.completeUrgentListing(listing.id, "cancelled");
    else await listingsApi.closeListing(listing.id);
  };

  const save = async () => {
    const patch: { title?: string; description?: string; priceMinor?: number | null } = {
      description: description.trim(),
    };
    if (!urgent) {
      if (title.trim().length < 3) {
        setError("Заголовок — минимум 3 символа");
        return;
      }
      patch.title = title.trim();
      if (showPrice) {
        const minor = price.trim() === "" ? null : moneyInput(price);
        if (price.trim() !== "" && minor === null) {
          setError("Проверьте цену");
          return;
        }
        patch.priceMinor = minor;
      }
    }
    setBusy("save");
    setError(null);
    try {
      await listingsApi.updateListing(listing.id, patch);
      toast.success("Изменения сохранены");
      setPanel(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    const warn = hasReservation ? "Активная бронь будет отменена. " : "";
    if (!window.confirm(`${warn}Завершить объявление? Оно перестанет показываться в ленте.`)) return;
    setBusy("finish");
    try {
      await finishListing();
      toast.success("Объявление завершено");
      await refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const warn = hasReservation ? "Активная бронь будет отменена. " : "";
    if (!window.confirm(`${warn}Удалить объявление? Это действие нельзя отменить.`)) return;
    setBusy("delete");
    try {
      if (active) await finishListing();
      await listingsApi.deleteListing(listing.id);
      toast.success("Объявление удалено");
      onClose();
      await refresh();
    } catch (cause) {
      fail(cause);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div
        className={`grid shrink-0 gap-2 border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${active ? "grid-cols-3" : "grid-cols-1"}`}
      >
        {active ? (
          <>
            <Button variant="secondary" disabled={busy !== null} onClick={openEdit}>
              <Pencil aria-hidden="true" />
              Изменить
            </Button>
            <Button variant="secondary" loading={busy === "finish"} disabled={busy !== null} onClick={finish}>
              <Check aria-hidden="true" />
              Завершить
            </Button>
          </>
        ) : null}
        <Button variant="ghost" loading={busy === "delete"} disabled={busy !== null} onClick={remove} className="text-destructive">
          <Trash2 aria-hidden="true" />
          Удалить
        </Button>
      </div>
      <BottomSheet open={panel} onClose={() => setPanel(false)} title="Редактировать" layerClassName="z-[60]">
        {!urgent ? (
          <Input label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} />
        ) : (
          <p className="text-sm text-muted-foreground">
            У срочных сделок заголовок, цена и фото после публикации не меняются.
          </p>
        )}
        {showPrice ? (
          <Input label="Цена, ₽" value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
        ) : null}
        <label className="block text-sm font-semibold">
          Описание
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={5}
            className="mt-1 w-full rounded-2xl border border-border bg-background p-3 text-sm font-normal text-foreground"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button fullWidth loading={busy === "save"} onClick={save}>
          Сохранить
        </Button>
      </BottomSheet>
    </>
  );
}
