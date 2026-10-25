import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Listing } from "@/api";
import { listingsApi } from "@/api";
import { BottomSheet, Button, Chip, Input } from "@/components/ds";
import { useAuthGate } from "@/features/auth/phone/AuthSheet";
import { HOLD_OPTIONS } from "../urgent";
import { clockLeft, dropEnd, moneyInput, urgentError } from "../urgent-ui";
import { formatPrice } from "../labels";
import { ListingCountdown } from "./ListingCountdown";

function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
export function UrgentPrice({ listing, compact = false }: { listing: Listing; compact?: boolean }) {
  const now = useNow();
  const stop = dropEnd(listing);
  return <div className={compact ? "space-y-1 text-[11px]" : "space-y-2 text-sm"}>
    <p className={compact ? "text-lg font-black text-primary" : "text-3xl font-black text-primary"}>{formatPrice(listing.currentPriceMinor ?? listing.priceMinor, listing.currency)}</p>
    <p className="text-primary">−{listing.discountFromStartPct ?? 0}% от старта</p>
    <div className="text-muted-foreground">
      <p>{listing.nextDropAt ? `Следующее снижение через ${now === null ? "—:—" : clockLeft(listing.nextDropAt, now)}` : "Цена больше не снижается"}</p>
      <p>Цена перестанет падать в {new Date(stop).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
      {listing.floorHintPct != null && <p>Не ниже {listing.floorHintPct}% от старта</p>}
      {listing.watchersCount !== undefined && <p>Следят: {listing.watchersCount}</p>}
      {listing.reservation?.active && <p className="text-primary">{listing.reservation.mine ? "Ваша бронь" : "Забронировано"}, ещё {now === null ? "—:—" : clockLeft(listing.reservation.expiresAt, now)}</p>}
    </div>
  </div>;
}

export function UrgentDeal({ listing }: { listing: Listing }) {
  const gate = useAuthGate();
  const queryClient = useQueryClient();
  const now = useNow();
  const [panel, setPanel] = useState<"reserve" | "bid" | "phone" | null>(null);
  const [arrive, setArrive] = useState<15 | 30 | 60>(30);
  const [bid, setBid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<{ priceMinor: number; expiresAt: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["listings"] });
  const run = (action: () => Promise<unknown>, success: string, close = false) => gate.guard(async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); toast.success(success); if (close) setPanel(null); await refresh(); }
    catch (cause) {
      setError(urgentError(cause));
      if ((cause as { code?: string }).code === "PHONE_REQUIRED") setPanel("phone");
      await refresh();
    } finally { setBusy(false); }
  });
  const reservation = listing.reservation;
  const own = listing.activeReservation;
  const held = reservation?.active || (fixed && now !== null && new Date(fixed.expiresAt).getTime() > now);
  const mine = reservation?.mine || Boolean(fixed);
  const active = listing.state === "active" && (now === null || new Date(listing.expiresAt).getTime() > now);
  const openBid = () => gate.guard(() => { setBid(listing.myBid ? String(listing.myBid.maxPriceMinor / 100) : ""); setError(null); setPanel("bid"); });
  return <section data-no-swipe className="space-y-3 border-t border-border pt-4">
    {listing.isMine ? <>
      <dl className="space-y-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt>Нижняя цена</dt><dd>{formatPrice(listing.priceFloorMinor ?? null)}</dd></div>
        <div><dt className="inline">Поставили «Мою цену»: </dt><dd className="inline">{listing.bidsCount ?? 0}, максимум {listing.highestBidMinor == null ? "—" : formatPrice(listing.highestBidMinor)}</dd></div>
      </dl>
      {own && <div className="space-y-1 text-sm"><p>Бронь: {own.buyerName}</p><p>{formatPrice(own.priceMinor)} · ещё {now === null ? "—:—" : clockLeft(own.expiresAt, now)}</p></div>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!active || !own || busy} onClick={() => run(() => listingsApi.completeUrgentListing(listing.id, "sold"), "Продажа завершена")}>Продано</Button>
        <Button variant="secondary" disabled={busy || !own || now === null || new Date(own.expiresAt).getTime() > now} onClick={() => run(() => listingsApi.reportListingNoShow(listing.id), "Неявка отмечена")}>Не пришёл</Button>
        <Button variant="ghost" disabled={!own || busy} onClick={() => run(() => listingsApi.cancelListingReservation(listing.id), "Бронь снята")}>Снять бронь</Button>
      </div>
    </> : !active ? <p className="text-sm text-muted-foreground">{listing.outcome === "sold" ? "Продано" : "Объявление завершено"}</p> : held ? <div className="space-y-2">
      <p className="text-sm font-semibold">{mine ? "Ваша бронь" : "Забронировано"}, ещё {now === null ? "—:—" : clockLeft(reservation?.expiresAt ?? fixed?.expiresAt, now)}</p>
      {mine && <><p className="text-sm text-primary">Цена фиксирована: {formatPrice(reservation?.priceMinor ?? fixed?.priceMinor ?? null)}</p><Button variant="secondary" disabled={busy} onClick={() => run(async () => { await listingsApi.cancelListingReservation(listing.id); setFixed(null); }, "Бронь отменена")}>Отменить</Button></>}
    </div> : <>
      {listing.myBid && <p className="text-sm">Моя цена: {formatPrice(listing.myBid.maxPriceMinor)}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button disabled={busy || listing.isSeed} onClick={() => gate.guard(() => { setError(null); setPanel("reserve"); })}>Беру за {formatPrice(listing.currentPriceMinor ?? listing.priceMinor)}</Button>
        <Button variant="secondary" disabled={busy || listing.isSeed} onClick={openBid}>{listing.myBid ? "Изменить мою цену" : "Моя цена"}</Button>
        {listing.myBid && <Button variant="ghost" disabled={busy} onClick={() => run(() => listingsApi.setListingBid(listing.id, null), "Моя цена отменена")}>Отменить мою цену</Button>}
        <Button variant="ghost" disabled={busy || listing.isSeed} aria-pressed={listing.iWatch === true} onClick={() => run(() => listingsApi.watchListing(listing.id, !listing.iWatch), listing.iWatch ? "Больше не следите за лотом" : "Вы следите за лотом")}>{listing.iWatch ? "Не следить" : "Следить"}</Button>
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <BottomSheet open={panel === "reserve"} onClose={() => setPanel(null)} title="Беру" description="Цена фиксируется" layerClassName="z-[60]">
      <p className="text-xl font-bold text-primary">{formatPrice(listing.currentPriceMinor ?? listing.priceMinor)}</p>
      <p>Приеду через</p><div className="flex flex-wrap gap-2">{HOLD_OPTIONS.map(option => <Chip key={option} selected={arrive === option} onClick={() => setArrive(option)}>{option} мин</Chip>)}</div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button fullWidth loading={busy} disabled={!active || Boolean(reservation?.active)} onClick={() => run(async () => { const result = await listingsApi.reserveListing(listing.id, arrive); setFixed(result); }, "Цена зафиксирована, лот забронирован", true)}>Подтвердить бронь</Button>
    </BottomSheet>
    <BottomSheet open={panel === "bid"} onClose={() => setPanel(null)} title="Моя цена" layerClassName="z-[60]">
      <Input label="Моя цена, ₽" value={bid} inputMode="decimal" onChange={e => setBid(e.target.value)} hint="Если цена дойдёт до этой суммы, лот забронируется за вами на 30 минут" />
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button fullWidth loading={busy} disabled={moneyInput(bid) === null} onClick={() => run(() => listingsApi.setListingBid(listing.id, moneyInput(bid)), "Моя цена сохранена", true)}>Сохранить</Button>
    </BottomSheet>
    <BottomSheet open={panel === "phone"} onClose={() => setPanel(null)} title="Подтвердите телефон" layerClassName="z-[60]" description="Для бронирования и своей цены нужен подтверждённый телефон в настройках аккаунта." />
    {gate.sheet}
  </section>;
}