import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
import { mobileClientName } from "@/lib/real-estate-mobile";
import { speechConstructor, startVoiceSession } from "@/lib/real-estate-voice";
import { Button } from "@/components/ui/button";
export function DirectClientVoice({
  onSearch,
  mode = "client",
}: {
  onSearch: (name: string) => void;
  mode?: "client" | "workspace" | "property";
}) {
  const { t } = useTranslation(undefined, { i18n });
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(false);
  const session = useRef<ReturnType<typeof startVoiceSession> | null>(null);
  const search = useRef(onSearch);
  search.current = onSearch;
  useEffect(() => {
    const cancel = () => session.current?.cancel();
    const visibility = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", cancel);
    return () => {
      cancel();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", cancel);
    };
  }, []);
  function start() {
    const Engine = speechConstructor();
    setError(false);
    if (!Engine) {
      setError(true);
      return;
    }
    setListening(true);
    let received = false;
    session.current = startVoiceSession(
      Engine,
      LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)],
      {
        text: (text) => {
          if (received) return;
          const name = mode === "client" ? mobileClientName(text) : text.trim();
          if (name.length < 2) {
            setError(true);
            return;
          }
          received = true;
          search.current(name);
          session.current?.cancel();
        },
        error: () => setError(true),
        end: () => {
          setListening(false);
          if (!received) setError(true);
        },
      },
    );
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="h-auto min-h-16 w-full gap-3 whitespace-normal rounded-2xl py-4 text-lg"
        onClick={listening ? () => session.current?.stop() : start}
      >
        {listening ? (
          <Square className="size-6" aria-hidden />
        ) : (
          <Mic className="size-6" aria-hidden />
        )}
        {t(
          `realEstateDemo.mobile.${listening ? "listening" : mode === "workspace" ? "voiceWorkspace" : mode === "property" ? "voiceProperty" : "voice"}`,
        )}
      </Button>
      <p className="text-sm leading-5 text-muted-foreground">
        {t(
          `realEstateDemo.mobile.${mode === "workspace" ? "voiceWorkspaceHint" : mode === "property" ? "voicePropertyHint" : "voiceHint"}`,
        )}
      </p>
      <p role="status" className="text-sm">
        {error ? t("realEstateDemo.mobile.voiceError") : ""}
      </p>
    </div>
  );
}
