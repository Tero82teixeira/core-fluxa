import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const settings = readFileSync("src/routes/_authenticated/configuracoes.tsx", "utf8");
const subscription = readFileSync("src/routes/_authenticated/assinatura.tsx", "utf8");
const help = readFileSync("src/routes/_authenticated/ajuda.tsx", "utf8");
const updates = readFileSync("src/routes/_authenticated/novidades.tsx", "utf8");

describe("experiência premium das telas de sistema", () => {
  test("configurações mantém ações e estados visíveis no novo cabeçalho", () => {
    assert.match(settings, /max-w-\[1600px\]/);
    assert.match(settings, /Administração central/);
    assert.match(settings, /to-teal-950/);
    assert.match(settings, /\{visibleTabs\.length\} áreas configuráveis/);
    assert.match(settings, /Alterações pendentes/);
    assert.match(settings, /Salvar alterações/);
    assert.match(settings, /TabsList className="[^"]*rounded-2xl/);
  });

  test("assinatura destaca plano, status e processamento seguro", () => {
    assert.match(subscription, /max-w-\[1400px\]/);
    assert.match(subscription, /Plano e faturamento/);
    assert.match(subscription, /to-emerald-950/);
    assert.match(subscription, /\{FLUXA_PLAN_NAME\}/);
    assert.match(subscription, /FLUXA_MONTHLY_PRICE/);
    assert.match(subscription, /\{displayStatus\}/);
    assert.match(subscription, /Pagamentos processados pela Kiwify/);
  });

  test("ajuda preserva busca, suporte e leitura com acabamento responsivo", () => {
    assert.match(help, /max-w-\[1600px\]/);
    assert.match(help, /Central de conhecimento/);
    assert.match(help, /to-cyan-950/);
    assert.match(help, /Solicitar suporte/);
    assert.match(help, /aria-label="Como podemos ajudar\?"/);
    assert.match(help, /rounded-xl border border-border\/70 bg-card/);
  });

  test("novidades reúne resumo, filtros e histórico no novo visual", () => {
    assert.match(updates, /max-w-\[1600px\]/);
    assert.match(updates, /Evolução contínua/);
    assert.match(updates, /to-fuchsia-950/);
    assert.match(updates, /\{updates\.length\}/);
    assert.match(updates, /aria-label="Buscar novidades"/);
    assert.match(updates, /Histórico de versões/);
    assert.match(updates, /rounded-2xl border-border\/70 shadow-soft/);
  });
});
