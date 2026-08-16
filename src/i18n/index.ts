import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import ru from "./locales/ru.json";

export const defaultLanguage = "ru";
export const supportedLanguages = ["ru", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

if (!i18n.isInitialized) {
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
}

export default i18n;
