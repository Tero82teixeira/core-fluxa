import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "./locales/en";
import { es } from "./locales/es";
import { pt } from "./locales/pt";
import { resolveLanguage, LANGUAGE_STORAGE_KEY, type AppLanguage } from "./language";

export { SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY, type AppLanguage } from "./language";

/**
 * Base de internacionalização da FLUXA.
 * - Inicia sempre em PT no servidor e na hidratação (evita divergência SSR).
 * - `syncClientLanguage()` aplica preferência salva ou idioma do navegador após montar.
 * - Novos módulos: adicione um namespace em locales/pt.ts; en/es são checados por tipo.
 */
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es } },
    lng: "pt",
    fallbackLng: "pt",
    interpolation: { escapeValue: false },
    returnObjects: true,
  });
}

export const LOCALE_BY_LANGUAGE: Record<AppLanguage, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
};

export function syncClientLanguage() {
  if (typeof window === "undefined") return;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const lang = resolveLanguage(stored, window.navigator.languages ?? [window.navigator.language]);
  if (lang !== i18n.language) void i18n.changeLanguage(lang);
  document.documentElement.lang = LOCALE_BY_LANGUAGE[lang];
}

export function setAppLanguage(lang: AppLanguage) {
  void i18n.changeLanguage(lang);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* armazenamento indisponível: idioma vale só nesta sessão */
  }
  document.documentElement.lang = LOCALE_BY_LANGUAGE[lang];
}

export default i18n;
