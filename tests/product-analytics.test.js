import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  normalizeAnalyticsPath,
  sanitizeAnalyticsProperties,
} from "../src/lib/product-analytics.ts";

describe("product analytics privacy", () => {
  test("normaliza identificadores dinâmicos antes de enviar a página", () => {
    assert.equal(
      normalizeAnalyticsPath("/clientes/550e8400-e29b-41d4-a716-446655440000"),
      "/clientes/:id",
    );
    assert.equal(normalizeAnalyticsPath("/processos/123"), "/processos/:id");
    assert.equal(normalizeAnalyticsPath("/"), "/");
  });

  test("remove propriedades que possam conter dados pessoais ou conteúdo livre", () => {
    assert.deepEqual(
      sanitizeAnalyticsProperties({
        page: "/clientes",
        email: "pessoa@example.com",
        client_name: "Cliente teste",
        document_number: "00000000000",
        role: "owner",
        completed: true,
        omitted: undefined,
      }),
      { page: "/clientes", role: "owner", completed: true },
    );
  });
});
