import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n, { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  parseVoiceCriteria,
  speechConstructor,
  startVoiceSession,
  type VoiceCriteria,
} from "@/lib/real-estate-voice";
export function VoiceSearch({
  mode = "property",
  onApply,
}: {
  mode?: "property" | "contact";
  onApply: (criteria: VoiceCriteria) => void;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (key: string) => t(`realEstateDemo.voice.${key}`);
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [criteria, setCriteria] = useState<VoiceCriteria | null>(null),
    [listening, setListening] = useState(false),
    [error, setError] = useState("");
  const session = useRef<ReturnType<typeof startVoiceSession> | null>(null);
  const cancel = () => {
    session.current?.cancel();
    session.current = null;
  };
  useEffect(() => {
    const hide = () => {
      if (document.hidden) session.current?.cancel();
    };
    const leave = () => session.current?.cancel();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      session.current?.cancel();
    };
  }, []);
  const close = () => {
    cancel();
    setOpen(false);
  };
  function listen() {
    cancel();
    setError("");
    setCriteria(null);
    const Engine = speechConstructor();
    if (!Engine) {
      setError(l("unsupported"));
      return;
    }
    setListening(true);
    session.current = startVoiceSession(
      Engine,
      LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)],
      {
        text: setText,
        error: (code) =>
          setError(
            l(
              code === "not-allowed" || code === "service-not-allowed"
                ? "denied"
                : code === "no-speech"
                  ? "noSpeech"
                  : "failed",
            ),
          ),
        end: () => setListening(false),
      },
    );
  }
  const canApply =
    criteria &&
    (mode === "contact"
      ? Boolean(criteria.search)
      : Boolean(criteria.search || criteria.type || criteria.purpose || criteria.maxPrice)) &&
    !(criteria.maxPrice && !criteria.purpose);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setText("");
          setCriteria(null);
          setError("");
          setOpen(true);
        }}
      >
        <Mic className="size-4" aria-hidden />
        {l("open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent className="demo-mobile-dialog max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{l("title")}</DialogTitle>
            <DialogDescription>{l("privacy")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {l(mode === "contact" ? "contactExample" : "example")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={listening} onClick={listen}>
              <Mic className="size-4" aria-hidden />
              {l("start")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!listening}
              onClick={() => session.current?.stop()}
            >
              <Square className="size-4" aria-hidden />
              {l("stop")}
            </Button>
          </div>
          {listening && <p role="status">{l("listening")}</p>}
          {error && (
            <p role="alert" className="text-sm">
              {error}
            </p>
          )}
          <Label htmlFor="voice-transcript">{l("transcript")}</Label>
          <Input
            id="voice-transcript"
            maxLength={300}
            value={text}
            disabled={listening}
            onChange={(e) => {
              setText(e.target.value);
              setCriteria(null);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={listening || !text.trim()}
            onClick={() => {
              cancel();
              setCriteria(parseVoiceCriteria(text, mode));
            }}
          >
            {l("review")}
          </Button>
          {criteria && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-sm">{l("reviewHint")}</p>
              <Label className="block">
                {l("search")}
                <Input
                  className="mt-1"
                  maxLength={100}
                  value={criteria.search}
                  onChange={(e) => setCriteria({ ...criteria, search: e.target.value })}
                />
              </Label>
              {mode === "property" && (
                <>
                  <Label className="block">
                    {l("type")}
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
                      value={criteria.type}
                      onChange={(e) => setCriteria({ ...criteria, type: e.target.value })}
                    >
                      <option value="">{l("any")}</option>
                      {["casa", "apartamento", "terreno", "comercial", "rural", "outro"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {t(`realEstateDemo.preferences.${v}`)}
                          </option>
                        ),
                      )}
                    </select>
                  </Label>
                  <Label className="block">
                    {l("purpose")}
                    <select
                      className="mt-1 min-h-11 w-full rounded-md border bg-background px-3"
                      value={criteria.purpose}
                      onChange={(e) => setCriteria({ ...criteria, purpose: e.target.value })}
                    >
                      <option value="">{l("any")}</option>
                      <option value="venda">{t("realEstateDemo.preferences.sale")}</option>
                      <option value="locacao">{t("realEstateDemo.preferences.rent")}</option>
                    </select>
                  </Label>
                  <Label className="block">
                    {l("budget")}
                    <Input
                      className="mt-1"
                      type="number"
                      min="0.01"
                      max="999999999999"
                      step="0.01"
                      value={criteria.maxPrice ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setCriteria({
                          ...criteria,
                          maxPrice:
                            e.target.value && Number.isFinite(n) && n > 0 && n < 1e12 ? n : null,
                        });
                      }}
                    />
                  </Label>
                  {criteria.maxPrice && !criteria.purpose ? (
                    <p role="status" className="text-sm">
                      {l("choosePurpose")}
                    </p>
                  ) : null}
                </>
              )}
              <Button
                type="button"
                disabled={!canApply}
                onClick={() => {
                  if (canApply && criteria) {
                    onApply(criteria);
                    close();
                  }
                }}
              >
                {l("apply")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
