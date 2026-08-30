import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const onboarding = readFileSync("src/routes/_authenticated/onboarding.tsx", "utf8");
const clientForm = readFileSync("src/components/clients/client-form.tsx", "utf8");
const lookup = readFileSync("src/lib/cnpj-lookup.ts", "utf8");
const hook = readFileSync("src/hooks/use-cnpj-lookup.ts", "utf8");

test("configuração da empresa mascara e valida documento real", () => {
  assert.match(onboarding, /maskDocument\(company\.document\)/);
  assert.match(onboarding, /maskPhone\(company\.phone\)/);
  assert.match(onboarding, /maskPhone\(company\.whatsapp\)/);
  assert.match(onboarding, /documentLength === 11 && isValidCPF/);
  assert.match(onboarding, /documentLength === 14 && isValidCNPJ/);
  assert.match(onboarding, /phone: digits\(company\.phone\) \|\| null/);
  assert.match(onboarding, /whatsapp: digits\(company\.whatsapp\) \|\| null/);
});

test("CNPJ válido preenche razão social e nome fantasia nos dois cadastros", () => {
  for (const source of [onboarding, clientForm]) {
    assert.match(source, /useCnpjLookup\(\)/);
    assert.match(source, /digits\(document\)\.length === 14 && isValidCNPJ\(document\)/);
    assert.match(source, /found\.legalName/);
    assert.match(source, /found\.tradeName/);
  }
});

test("consulta externa é restrita a CNPJ válido e permite preenchimento manual na falha", () => {
  assert.match(lookup, /if \(!isValidCNPJ\(cnpj\)\) throw new CnpjLookupError\("invalid"\)/);
  assert.match(lookup, /https:\/\/brasilapi\.com\.br\/api\/cnpj\/v1/);
  assert.match(
    lookup,
    /Não foi possível consultar o CNPJ agora\. Continue o preenchimento manualmente\./,
  );
  assert.match(hook, /controller\.current\?\.abort\(\)/);
  assert.match(hook, /lastCnpj\.current === cnpj/);
  assert.match(hook, /8_000/);
});

test("situação cadastral é informativa e não bloqueia o formulário", () => {
  assert.match(lookup, /status: data\.descricao_situacao_cadastral/);
  assert.match(hook, /Situação cadastral:/);
  assert.doesNotMatch(onboarding, /status.*throw|throw.*status/);
  assert.doesNotMatch(clientForm, /status.*throw|throw.*status/);
});
