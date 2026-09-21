import { Link, useLocation } from "@tanstack/react-router";
import { BarChart3, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  ANALYTICS_CONSENT_EVENT,
  captureProductEvent,
  getAnalyticsConsent,
  isProductAnalyticsConfigured,
  identifyProductUser,
  normalizeAnalyticsPath,
  resetProductAnalytics,
  setAnalyticsConsent,
} from "@/lib/product-analytics";

export function ProductAnalytics() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { user } = useAuth();
  const configured = isProductAnalyticsConfigured();
  const identifiedUserId = useRef<string | null>(null);
  const [consent, setConsent] = useState<ReturnType<typeof getAnalyticsConsent> | "loading">(
    "loading",
  );

  useEffect(() => {
    const updateConsent = () => setConsent(getAnalyticsConsent());
    updateConsent();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, updateConsent);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, updateConsent);
  }, []);

  useEffect(() => {
    if (!configured || consent !== "accepted") return;
    captureProductEvent("page_viewed", { page: normalizeAnalyticsPath(pathname) });
  }, [configured, consent, pathname]);

  useEffect(() => {
    if (!configured || consent !== "accepted") return;
    if (!user?.id) {
      if (identifiedUserId.current) resetProductAnalytics();
      identifiedUserId.current = null;
      return;
    }
    if (identifiedUserId.current && identifiedUserId.current !== user.id) {
      resetProductAnalytics();
    }
    identifyProductUser(user.id);
    identifiedUserId.current = user.id;
  }, [configured, consent, user?.id]);

  if (!configured || consent === "loading" || consent) return null;

  return (
    <aside
      aria-label="Preferências de análise"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
          <BarChart3 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Ajude a melhorar a FLUXA</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Podemos coletar métricas de uso sem gravar sua tela nem enviar dados de clientes,
            documentos ou campos preenchidos. Veja a nossa{" "}
            <Link to="/politica-de-privacidade" className="font-medium text-primary underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setAnalyticsConsent("rejected")}>
            <ShieldCheck aria-hidden /> Somente necessárias
          </Button>
          <Button type="button" onClick={() => setAnalyticsConsent("accepted")}>
            Aceitar métricas
          </Button>
        </div>
      </div>
    </aside>
  );
}
