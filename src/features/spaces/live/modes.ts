import { Clapperboard, GraduationCap, MessageCircle, Briefcase, Home, type LucideIcon } from "lucide-react";

import type { LiveCard } from "@/api/types";

export type LiveModeId = "talk" | "work" | "learn" | "family" | "cinema";

export interface LiveModeConfig {
  id: LiveModeId;
  title: string;
  hint: string;
  icon: LucideIcon;
  /** false — режим показан, но недоступен («скоро»). */
  available: boolean;
  /** Виды карточек режима в порядке показа в окне «Добавить на стол». */
  cardKinds: LiveCard["kind"][];
}

export const LIVE_MODES: LiveModeConfig[] = [
  { id: "talk", title: "Разговор", hint: "просто поговорить", icon: MessageCircle, available: true, cardKinds: ["photo", "link", "note", "question"] },
  { id: "work", title: "Работа", hint: "задачи и решения", icon: Briefcase, available: true, cardKinds: ["note", "question", "link", "photo"] },
  { id: "learn", title: "Обучение", hint: "вопросы и указка", icon: GraduationCap, available: true, cardKinds: ["question", "photo", "link", "note"] },
  { id: "family", title: "Семья", hint: "фото и истории", icon: Home, available: true, cardKinds: ["photo", "note", "link"] },
  { id: "cinema", title: "Кино", hint: "скоро", icon: Clapperboard, available: false, cardKinds: [] },
];

export const DEFAULT_LIVE_MODE: LiveModeId = "talk";

/** Конфиг режима; неизвестный id даёт «Разговор». */
export function liveMode(id: string | null | undefined): LiveModeConfig {
  return LIVE_MODES.find((m) => m.id === id) ?? LIVE_MODES[0]!;
}

/** Виды карточек для окна «Добавить на стол»: по режиму, без режима — все четыре. */
export function cardKindsForMode(id: string | null | undefined): LiveCard["kind"][] {
  if (id == null) return ["photo", "link", "note", "question"];
  const kinds = liveMode(id).cardKinds;
  return kinds.length > 0 ? kinds : ["photo", "link", "note", "question"];
}
