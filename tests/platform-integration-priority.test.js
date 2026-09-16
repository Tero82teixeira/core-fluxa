import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  comparePlatformIntegrationPriority,
  integrationIncidentAgeLabel,
  platformIntegrationPriority,
} from "../src/lib/platform-integration-priority.ts";

const now = new Date("2026-10-15T12:00:00.000Z");

function incident(overrides = {}) {
  return {
    failed_at: "2026-10-15T11:50:00.000Z",
    attempts: 1,
    status: "open",
    is_active_failure: true,
    assigned_to: null,
    ...overrides,
  };
}

describe("prioridade dos incidentes da plataforma", () => {
  test("prioriza falhas antigas ou repetidas sem inflar ocorrências recentes", () => {
    assert.equal(platformIntegrationPriority(incident(), now), "normal");
    assert.equal(
      platformIntegrationPriority(incident({ failed_at: "2026-10-15T11:20:00.000Z" }), now),
      "high",
    );
    assert.equal(
      platformIntegrationPriority(incident({ failed_at: "2026-10-15T07:00:00.000Z" }), now),
      "critical",
    );
    assert.equal(platformIntegrationPriority(incident({ attempts: 3 }), now), "critical");
  });

  test("histórico encerrado fica separado e tempo é apresentado de forma legível", () => {
    assert.equal(
      platformIntegrationPriority(incident({ status: "resolved", is_active_failure: false }), now),
      "recovered",
    );
    assert.equal(integrationIncidentAgeLabel("2026-10-15T11:40:00.000Z", now), "há 20 min");
    assert.equal(integrationIncidentAgeLabel("2026-10-15T09:10:00.000Z", now), "há 2 h");
    assert.equal(integrationIncidentAgeLabel("2026-10-13T10:00:00.000Z", now), "há 2 dia(s)");
  });

  test("ordena prioridade, falta de responsável e maior espera", () => {
    const rows = [
      incident({ failed_at: "2026-10-15T11:20:00.000Z", assigned_to: "user-1" }),
      incident({ attempts: 3, failed_at: "2026-10-15T11:55:00.000Z" }),
      incident({ failed_at: "2026-10-15T11:10:00.000Z" }),
    ].sort((left, right) => comparePlatformIntegrationPriority(left, right, now));

    assert.equal(rows[0].attempts, 3);
    assert.equal(rows[1].assigned_to, null);
    assert.equal(rows[2].assigned_to, "user-1");
  });

  test("painel mostra indicadores, busca e filtro de prioridade", async () => {
    const route = await readFile(
      new URL("../src/routes/_authenticated/administracao-plataforma.tsx", import.meta.url),
      "utf8",
    );

    assert.match(route, /Críticas/);
    assert.match(route, /Prioridade alta/);
    assert.match(route, /Sem responsável/);
    assert.match(route, /Buscar empresa, integração ou diagnóstico/);
    assert.match(route, /Filtrar prioridade dos incidentes/);
    assert.match(route, /integrationIncidentAgeLabel/);
    assert.match(route, /comparePlatformIntegrationPriority/);
  });
});
