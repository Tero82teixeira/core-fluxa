import { digits, isValidCNPJ } from "@/lib/format";

const CNPJ_API = "https://brasilapi.com.br/api/cnpj/v1";

export type CnpjCompany = {
  cnpj: string;
  legalName: string;
  tradeName: string;
  status: string | null;
};

type BrasilApiCnpj = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
};

export class CnpjLookupError extends Error {
  constructor(public readonly code: "invalid" | "not_found" | "unavailable") {
    super(code);
    this.name = "CnpjLookupError";
  }
}

/** Consulta de conveniência. A indisponibilidade externa nunca impede o preenchimento manual. */
export async function lookupCnpj(value: string, signal?: AbortSignal): Promise<CnpjCompany> {
  const cnpj = digits(value);
  if (!isValidCNPJ(cnpj)) throw new CnpjLookupError("invalid");

  let response: Response;
  try {
    response = await fetch(`${CNPJ_API}/${cnpj}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new CnpjLookupError("unavailable");
  }

  if (response.status === 404) throw new CnpjLookupError("not_found");
  if (!response.ok) throw new CnpjLookupError("unavailable");

  const data = (await response.json()) as BrasilApiCnpj;
  const legalName = data.razao_social?.trim();
  if (!legalName) throw new CnpjLookupError("unavailable");

  return {
    cnpj,
    legalName: legalName.slice(0, 160),
    tradeName: (data.nome_fantasia?.trim() || legalName).slice(0, 160),
    status: data.descricao_situacao_cadastral?.trim() || null,
  };
}

export function cnpjLookupMessage(error: unknown) {
  if (error instanceof CnpjLookupError && error.code === "not_found") {
    return "CNPJ não encontrado. Confira o número ou preencha os dados manualmente.";
  }
  if (error instanceof CnpjLookupError && error.code === "invalid") {
    return "Informe um CNPJ válido antes de consultar.";
  }
  return "Não foi possível consultar o CNPJ agora. Continue o preenchimento manualmente.";
}
