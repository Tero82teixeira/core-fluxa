import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260907120000_client_portal_process_details.sql",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/database/066_client_portal_process_details.sql",
  "utf8",
);
const management = readFileSync("src/components/clients/client-portal-panel.tsx", "utf8");
const hook = readFileSync("src/hooks/use-client-portal-content.ts", "utf8");
const portal = readFileSync("src/routes/meu-portal.tsx", "utf8");
const types = readFileSync("src/integrations/supabase/types.ts", "utf8");

describe("detalhes seguros dos processos no Meu Portal", () => {
  test("movimentações começam privadas e não formam uma API direta", () => {
    assert.match(migration, /is_shared boolean NOT NULL DEFAULT false/);
    assert.match(
      migration,
      /REVOKE ALL ON TABLE public\.client_portal_process_movement_shares[\s\S]*authenticated/,
    );
    assert.match(databaseTest, /process movements start private/);
    assert.match(databaseTest, /portal still has no direct process movement access/);
  });

  test("somente proprietário e administrador selecionam atualizações públicas", () => {
    for (const name of [
      "client_portal_process_timeline_management",
      "set_client_portal_process_movement_shared",
    ]) {
      const start = migration.indexOf(`FUNCTION public.${name}`);
      assert.notEqual(start, -1);
      assert.match(
        migration.slice(start, start + 3600),
        /ARRAY\['proprietario', 'administrador'\]/,
      );
    }
    assert.match(databaseTest, /a manager cannot manage client process history/);
    assert.match(databaseTest, /another client movement cannot be shared/);
  });

  test("projeção pública exige acesso ativo, processo e movimentação compartilhados", () => {
    const start = migration.indexOf("FUNCTION public.client_portal_process_timeline(");
    const body = migration.slice(start, start + 3000);
    assert.match(body, /access\.user_id = auth\.uid\(\)/);
    assert.match(body, /access\.is_active/);
    assert.match(body, /process_share\.is_shared/);
    assert.match(body, /movement_share\.is_shared/);
    assert.doesNotMatch(body.slice(0, body.indexOf(")\nLANGUAGE")), /actor|created_by/i);
  });

  test("documentos compartilhados podem ser agrupados pelo processo", () => {
    assert.match(migration, /document\.process_id/);
    assert.match(hook, /process_id: string \| null/);
    assert.match(portal, /document\.process_id === process\.process_id/);
    assert.match(portal, /Documentos deste processo/);
  });

  test("portal mostra progresso, etapas, prazo e histórico autorizado", () => {
    assert.match(portal, /Progresso do processo/);
    assert.match(portal, /PIPELINE_STAGES/);
    assert.match(portal, /Etapas do atendimento/);
    assert.match(portal, /Atualizações compartilhadas/);
    assert.match(portal, /useClientPortalProcessTimeline/);
    assert.match(portal, /process\.due_date/);
  });

  test("painel administrativo possui seleção explícita por atualização", () => {
    assert.match(management, /Escolher atualizações visíveis/);
    assert.match(management, /useClientPortalProcessTimelineManagement/);
    assert.match(management, /useSetClientPortalProcessMovementShared/);
    assert.match(management, /Somente as atualizações marcadas como visíveis/);
  });

  test("tipos incluem a tabela e os três novos contratos", () => {
    for (const required of [
      "client_portal_process_movement_shares",
      "client_portal_process_timeline",
      "client_portal_process_timeline_management",
      "set_client_portal_process_movement_shared",
    ]) {
      assert.match(types, new RegExp(required));
    }
  });
});
