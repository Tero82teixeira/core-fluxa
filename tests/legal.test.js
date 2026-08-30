import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import { buildLegalAcceptanceMetadata, LEGAL_DOCUMENT_VERSION } from "../src/lib/legal.ts";

describe("registro de aceite jurídico", () => {
  test("mantém uma única versão para termos e privacidade", () => {
    assert.equal(LEGAL_DOCUMENT_VERSION, "2026-08-30");
    assert.deepEqual(buildLegalAcceptanceMetadata("company_signup"), {
      legal_accepted: true,
      legal_terms_version: "2026-08-30",
      legal_privacy_version: "2026-08-30",
      legal_acceptance_source: "company_signup",
    });
  });

  test("distingue cadastro de empresa e cadastro por convite", () => {
    assert.equal(buildLegalAcceptanceMetadata("invitation").legal_acceptance_source, "invitation");
  });

  test("exige aceite nos dois cadastros e mantém o convite sem criar empresa", async () => {
    const [auth, companySignup, invitation, migration] = await Promise.all([
      readFile(new URL("../src/lib/auth.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/entrar.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/convite.$token.tsx", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260830120000_legal_documents_acceptance.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    assert.match(companySignup, /!legalAccepted/);
    assert.match(companySignup, /Termos de Uso/);
    assert.match(auth, /buildLegalAcceptanceMetadata\("company_signup"\)/);
    assert.match(invitation, /buildLegalAcceptanceMetadata\("invitation"\)/);
    assert.doesNotMatch(invitation, /bootstrap_organization/);
    assert.match(migration, /accepted_at timestamp with time zone NOT NULL DEFAULT now\(\)/);
    assert.match(
      migration,
      /REVOKE ALL ON public\.legal_acceptances FROM PUBLIC, anon, authenticated/,
    );
  });
});
