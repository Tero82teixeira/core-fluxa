import { useCallback, useEffect, useRef, useState } from "react";

import { cnpjLookupMessage, lookupCnpj, type CnpjCompany } from "@/lib/cnpj-lookup";
import { digits, isValidCNPJ } from "@/lib/format";

export function useCnpjLookup() {
  const controller = useRef<AbortController | null>(null);
  const lastCnpj = useRef("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    lastCnpj.current = "";
    setLoading(false);
    setMessage(null);
  }, []);

  const search = useCallback(async (value: string): Promise<CnpjCompany | null> => {
    const cnpj = digits(value);
    if (!isValidCNPJ(cnpj)) return null;
    if (lastCnpj.current === cnpj) return null;

    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    lastCnpj.current = cnpj;
    setLoading(true);
    setMessage(null);
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 8_000);

    try {
      const company = await lookupCnpj(cnpj, request.signal);
      setMessage(
        company.status
          ? `Dados encontrados. Situação cadastral: ${company.status}.`
          : "Dados da empresa encontrados.",
      );
      return company;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && !timedOut) return null;
      lastCnpj.current = "";
      setMessage(cnpjLookupMessage(error));
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (controller.current === request) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, []);

  return { loading, message, search, reset };
}
