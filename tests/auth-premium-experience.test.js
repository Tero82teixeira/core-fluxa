import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auth = readFileSync("src/routes/entrar.tsx", "utf8");

test("entrada e cadastro seguem a identidade premium da página pública", () => {
  assert.match(auth, /function AuthSidePanel/);
  assert.match(auth, /bg-slate-950/);
  assert.match(auth, /14 dias grátis · sem cartão/);
  assert.match(auth, /Fluxo conectado/);
  assert.match(auth, /Organizações isoladas, permissões por papel e ações protegidas/);
});

test("prévia de autenticação explica o fluxo sem indicadores fictícios", () => {
  for (const moduleName of ["Clientes", "Processos", "Tarefas", "Documentos"]) {
    assert.match(auth, new RegExp(`label: "${moduleName}"`));
  }
  assert.doesNotMatch(auth, /PREVIEW_CARDS|"128"|"06"|"23"|"09"/);
});

test("formulário orienta senha, carregamento, erros e confirmação", () => {
  assert.match(auth, /Mínimo de 6 caracteres/);
  assert.match(auth, /role="alert"/);
  assert.match(auth, /aria-busy=\{loading\}/);
  assert.match(auth, /Criando conta…/);
  assert.match(auth, /Abra a mensagem enviada pela FLUXA/);
});

test("experiência móvel mantém marca e formulário sem o painel extenso", () => {
  assert.match(auth, /hidden min-h-0[\s\S]*lg:flex/);
  assert.match(auth, /lg:hidden/);
  assert.match(auth, /<AuthBrand compact \/>/);
});
