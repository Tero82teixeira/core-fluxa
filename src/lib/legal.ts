export const LEGAL_DOCUMENT_VERSION = "2026-09-21";
export const LEGAL_LAST_UPDATED_LABEL = "21 de setembro de 2026";

export type LegalAcceptanceSource = "company_signup" | "invitation";

export function buildLegalAcceptanceMetadata(source: LegalAcceptanceSource) {
  return {
    legal_accepted: true,
    legal_terms_version: LEGAL_DOCUMENT_VERSION,
    legal_privacy_version: LEGAL_DOCUMENT_VERSION,
    legal_acceptance_source: source,
  } as const;
}
