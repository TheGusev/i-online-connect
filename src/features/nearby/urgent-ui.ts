import type { Listing } from "@/api/types";
import { DROP_WINDOW, STEPS, priceAt, validateSell, type UrgentType } from "./urgent";

export const urgentLabels: Record<UrgentType, string> = {
  sell: "Продам срочно", buy: "Куплю срочно", help: "Нужна помощь", ride: "Попутчик", giveaway: "Отдам сегодня",
};
export function moneyInput(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number >= 0 && number <= 10_000_000 ? Math.round(number * 100) : null;
}
export function sellFormError(start: number | null, floor: number | null, photos: number, previousStart?: number | null) {
  if (start === null || floor === null) return "Укажите стартовую и нижнюю цены";
  const code = validateSell({ start, floor });
  if (code) return urgentError({ code });
  if (previousStart != null && start > previousStart) return urgentError({ code: "START_ABOVE_PREVIOUS" });
  if (photos < 2) return "Для продажи добавьте минимум 2 фото";
  return null;
}
export function urgentError(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  const messages: Record<string, string> = {
    FLOOR_ABOVE_START: "Нижняя цена не может быть выше стартовой",
    START_TOO_HIGH: "Стартовая цена — не выше 1,5 от нижней",
    FLOOR_TOO_LOW: "Нижняя цена — минимум 100 ₽",
    DUPLICATE_RECENT: "Такой лот уже размещали за последние 24 часа. Попробуйте позже",
    START_ABOVE_PREVIOUS: "Старт не может быть выше старта прошлого лота",
    PHONE_REQUIRED: "Подтвердите способ связи в настройках аккаунта",
    CONTACT_NOT_VERIFIED: "Подтвердите способ связи для срочной сделки",
    URGENT_SELL_NOT_AVAILABLE: "Срочные продажи пока недоступны в вашем городе",
    URGENT_ACTIVE_LIMIT: "Достигнут лимит активных срочных объявлений. Завершите одно из них",
    BID_ABOVE_CURRENT: "Цена уже ниже: нажмите «Беру»",
    ALREADY_RESERVED: "Лот уже забронирован. Обновляем данные",
    RESERVATION_BANNED: "Бронирование недоступно после неявок у двух продавцов",
  };
  return messages[value?.code ?? ""] ?? value?.message ?? "Не удалось выполнить действие. Попробуйте ещё раз";
}
export function dropEnd(listing: Pick<Listing, "createdAt" | "expiresAt">) {
  const start = new Date(listing.createdAt).getTime();
  return new Date(start + (new Date(listing.expiresAt).getTime() - start) * DROP_WINDOW).toISOString();
}
export function priceSteps(start: number, floor: number, minutes: number) {
  const count = STEPS[minutes] ?? 1;
  return Array.from({ length: count }, (_, i) => {
    const at = Math.ceil(minutes * 60_000 * DROP_WINDOW / count * (i + 1));
    return { afterMinutes: Math.ceil(at / 60_000), ...priceAt({ start, floor, createdAt: 0, expiresAt: minutes * 60_000, steps: count }, at) };
  });
}
export function unreservedUrgent<T extends Pick<Listing, "state" | "expiresAt" | "reservation">>(items: readonly T[], now = Date.now()) {
  return items.filter(item => item.state === "active" && new Date(item.expiresAt).getTime() > now && !item.reservation?.active)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
}
export function urgentListings<T extends Pick<Listing, "category" | "state" | "expiresAt" | "reservation">>(items: readonly T[], now = Date.now()) {
  return unreservedUrgent(items.filter(item => item.category === "urgent"), now);
}
export function clockLeft(at: string | null | undefined, now: number) {
  const seconds = Math.max(0, Math.ceil(((at ? new Date(at).getTime() : now) - now) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}