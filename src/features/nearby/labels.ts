import {
  Building2,
  Car,
  Handshake,
  HeartHandshake,
  Heart,
  Route as RouteIcon,
  Siren,
  Tag,
  Wrench,
} from "lucide-react";

import type { NeedCategory } from "@/api";

export interface CategoryMeta {
  id: NeedCategory;
  label: string;
  hint: string;
  icon: typeof Tag;
  /** Для «Досуга», «Помощи» и «Знакомств» цена не имеет смысла. */
  priceApplies: boolean;
}

export const categories: CategoryMeta[] = [
  {
    id: "dating",
    label: "Знакомства",
    hint: "Живое общение и встречи в своём городе",
    icon: Heart,
    priceApplies: false,
  },
  {
    id: "service",
    label: "Услуги",
    hint: "Мастер, репетитор, ремонт, уборка",
    icon: Wrench,
    priceApplies: true,
  },
  {
    id: "realty",
    label: "Жильё",
    hint: "Снять, сдать, найти соседа по квартире",
    icon: Building2,
    priceApplies: true,
  },
  {
    id: "transport",
    label: "Транспорт",
    hint: "Авто, велосипед, самокат: продать или взять",
    icon: Car,
    priceApplies: true,
  },
  {
    id: "sale",
    label: "Покупка/продажа",
    hint: "Отдать, продать или купить вещь рядом",
    icon: Tag,
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
    label: "Попутчики",
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
  {
    id: "urgent",
    label: "Срочно",
    hint: "Нужно решить сегодня — время важнее всего",
    icon: Siren,
    priceApplies: true,
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
