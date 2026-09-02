import { Handshake, HeartHandshake, Route as RouteIcon, Tag, Wrench } from "lucide-react";

import type { NeedCategory } from "@/api";

export interface CategoryMeta {
  id: NeedCategory;
  label: string;
  hint: string;
  icon: typeof Tag;
  /** Для «Досуга» и «Помощи» цена не имеет смысла. */
  priceApplies: boolean;
}

export const categories: CategoryMeta[] = [
  {
    id: "sale",
    label: "Продажа",
    hint: "Отдать, продать или купить вещь рядом",
    icon: Tag,
    priceApplies: true,
  },
  {
    id: "service",
    label: "Услуга",
    hint: "Мастер, репетитор, ремонт, уборка",
    icon: Wrench,
    priceApplies: true,
  },
  {
    id: "leisure",
    label: "Досуг",
    hint: "Компания на прогулку, кино, спорт",
    icon: HeartHandshake,
    priceApplies: false,
  },
  {
    id: "travel",
    label: "Попутчик",
    hint: "Поездка в одну сторону, поделить дорогу",
    icon: RouteIcon,
    priceApplies: true,
  },
  {
    id: "help",
    label: "Помощь",
    hint: "Выручить по-соседски, без денег",
    icon: Handshake,
    priceApplies: false,
  },
];

export const categoryMap = new Map(categories.map((item) => [item.id, item]));

export function categoryLabel(id: NeedCategory): string {
  return categoryMap.get(id)?.label ?? id;
}

export function priceApplies(id: NeedCategory): boolean {
  return categoryMap.get(id)?.priceApplies ?? true;
}

/** Копейки → «1 500 ₽». null — «Договорная». */
export function formatPrice(priceMinor: number | null, currency = "RUB"): string {
  if (priceMinor === null) return "Договорная";
  const value = priceMinor / 100;
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}
