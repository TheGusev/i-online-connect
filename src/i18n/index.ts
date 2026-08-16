import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";

export const defaultLanguage = "ru";
export const supportedLanguages = ["ru", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

/**
 * Инициализирует i18next. Вызывается явно из src/router.tsx, а не как
 * side-effect импорта: side-effect может попасть в ленивый чанк, и тогда
 * страницы показывают ключи вместо текста.
 */
export function initI18n() {
  if (i18n.isInitialized) return i18n;

  void i18n.use(initReactI18next).init({
    resources: {
      ru: { translation: ru },
      en: { translation: en },
    },
    lng: defaultLanguage,
    // Синхронная инициализация: иначе первый рендер (и пререндеренный
    // SPA-шелл) показывает ключи вместо текста.
    initImmediate: false,
    fallbackLng: defaultLanguage,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return i18n;
}

export default i18n;
