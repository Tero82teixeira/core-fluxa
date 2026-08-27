import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  filterProductUpdates,
  isProductUpdateNew,
  PRODUCT_UPDATES,
  sortProductUpdates,
} from "../src/lib/product-updates.ts";

const route = readFileSync("src/routes/_authenticated/novidades.tsx", "utf8");
const navigation = readFileSync("src/lib/navigation.ts", "utf8");
const productUpdates = readFileSync("src/lib/product-updates.ts", "utf8");

describe("dados e filtros das novidades", () => {
  test("oferece uma lista inicial completa", () => assert.ok(PRODUCT_UPDATES.length >= 10));
  test("ordena da data mais recente para a mais antiga", () => {
    const sorted = sortProductUpdates();
    assert.deepEqual(
      sorted.map((item) => item.date),
      sorted
        .map((item) => item.date)
        .toSorted()
        .reverse(),
    );
  });
  test("busca por título", () =>
    assert.equal(filterProductUpdates({ query: "Financeiro completo" })[0].id, "financeiro"));
  test("busca por palavra-chave", () =>
    assert.ok(
      filterProductUpdates({ query: "follow-up" }).some((item) => item.id === "comunicacao"),
    ));
  test("busca ignora acentos e caixa", () =>
    assert.ok(
      filterProductUpdates({ query: "AUTOMACOES" }).some((item) => item.id === "automacoes"),
    ));
  test("filtra por tipo", () =>
    assert.ok(filterProductUpdates({ type: "fix" }).every((item) => item.type === "fix")));
  test("filtra por módulo", () =>
    assert.ok(
      filterProductUpdates({ module: "monitoramento" }).every(
        (item) => item.module === "monitoramento",
      ),
    ));
  test("filtra pelo período com data de referência", () => {
    const result = filterProductUpdates({
      period: "7",
      referenceDate: new Date("2026-08-10T12:00:00Z"),
    });
    assert.ok(result.length > 0);
    assert.ok(result.every((item) => item.date >= "2026-08-03"));
  });
  test("identifica destaques", () =>
    assert.ok(PRODUCT_UPDATES.filter((item) => item.featured).length >= 1));
  test("badge Novo aceita data de referência", () =>
    assert.equal(isProductUpdateNew(PRODUCT_UPDATES[0], new Date("2026-08-10T12:00:00Z")), true));
  test("badge Novo expira", () =>
    assert.equal(isProductUpdateNew(PRODUCT_UPDATES[0], new Date("2026-09-11T12:00:00")), false));
});

describe("interface das novidades", () => {
  test("abre detalhe com descrição e mudanças", () => {
    assert.match(route, /setSelected\(update\)/);
    assert.match(route, /O que mudou/);
    assert.match(route, /update\.description/);
  });
  test("navega internamente para o módulo", () => {
    assert.match(route, /useNavigate/);
    assert.match(route, /navigate\(\{ to: update\.relatedRoute/);
    assert.doesNotMatch(route, /window\.open|target=["']_blank/);
  });
  test("mostra o estado vazio solicitado", () => {
    assert.match(route, /Nenhuma novidade encontrada\./);
    assert.match(route, /Tente ajustar os filtros ou buscar outro termo\./);
  });
  test("Novidades não tem indicador em breve", () =>
    assert.match(navigation, /to: "\/novidades"[\s\S]{0,160}ready: true/));
  test("não cria dependência de backend", () =>
    assert.doesNotMatch(
      route + productUpdates,
      /supabase|\.rpc\(|functions\.invoke|service_role|edge function|from\(["']product_updates/i,
    ));
});
