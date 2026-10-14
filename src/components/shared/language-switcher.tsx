import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES, setAppLanguage, type AppLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

/** Seletor de idioma acessível (select nativo: teclado e leitores de tela). */
export function LanguageSwitcher({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? "pt") as AppLanguage;
  return (
    <label
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium",
        tone === "dark"
          ? "border-white/15 bg-white/5 text-slate-200"
          : "border-border bg-background text-foreground",
        className,
      )}
    >
      <Globe className="size-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="sr-only">{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        value={current}
        onChange={(event) => setAppLanguage(event.target.value as AppLanguage)}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none [&>option]:text-foreground"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang} className="bg-background">
            {lang.toUpperCase()} · {t(`language.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
