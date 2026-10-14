export const SUPPORTED_LANGUAGES = ["pt", "en", "es"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "fluxa.language";

function normalize(value: string | null | undefined): AppLanguage | null {
  const base = value?.toLowerCase().split("-")[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base ?? "") ? (base as AppLanguage) : null;
}

/** Preferência salva > idioma do navegador > português. */
export function resolveLanguage(
  stored: string | null | undefined,
  browserLanguages: readonly string[] = [],
): AppLanguage {
  const saved = normalize(stored);
  if (saved) return saved;
  for (const candidate of browserLanguages) {
    const match = normalize(candidate);
    if (match) return match;
  }
  return "pt";
}
