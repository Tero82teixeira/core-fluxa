import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { followUpDue, whatsappUrl } from "../src/lib/commercial-follow-up.ts";
import { buildMyDay } from "../src/lib/my-day.ts";

const migration = readFileSync(
  "supabase/migrations/20261004120000_commercial_follow_up.sql",
  "utf8",
);
const platformRoute = readFileSync(
  "src/routes/_authenticated/administracao-plataforma.tsx",
  "utf8",
);
const commercialPanel = readFileSync("src/components/reports/business-panels.tsx", "utf8");

test("normaliza WhatsApp e reconhece retorno vencido", () => {
  assert.equal(whatsappUrl("(27) 99999-8888"), "https://wa.me/5527999998888");
  assert.equal(whatsappUrl("+55 27 99999-8888"), "https://wa.me/5527999998888");
  assert.equal(followUpDue("2026-09-12T11:59:00Z", new Date("2026-09-12T12:00:00Z")), true);
  assert.equal(followUpDue(null), false);
});

test("Meu Dia reúne retorno do tenant e acompanhamento da plataforma sem misturar os dados", () => {
  const result = buildMyDay({
    tasks: [],
    communications: [],
    portalItems: [],
    userId: "user-1",
    canReviewDocuments: false,
    now: new Date("2026-09-12T12:00:00Z"),
    opportunities: [
      {
        id: "opportunity-1",
        title: "Contrato mensal",
        stage: "qualification",
        owner_id: "user-1",
        next_action_at: "2026-09-12T15:00:00Z",
        contact_status: "following",
      },
    ],
    platformTrials: [
      {
        organization_id: "trial-1",
        legal_name: "Empresa Teste",
        trade_name: null,
        effective_status: "trial",
        follow_up_status: "interested",
        next_contact_at: "2026-09-11T15:00:00Z",
      },
    ],
  });
  assert.equal(result.summary.commercial, 1);
  assert.equal(result.summary.platformTrials, 1);
  assert.deepEqual(
    result.items.map((item) => item.kind),
    ["platform_trial", "commercial"],
  );
});

test("acompanhamentos usam tabelas e RPCs separados e aparecem nos dois painéis", () => {
  assert.match(migration, /CREATE TABLE public\.platform_trial_follow_ups/);
  assert.match(migration, /CREATE TABLE public\.commercial_opportunity_contact_history/);
  assert.match(migration, /PLATFORM_ADMIN_REQUIRED/);
  assert.match(migration, /public\.is_org_member\(_organization_id\)/);
  assert.match(platformRoute, /CommercialFollowUpDialog/);
  assert.match(platformRoute, /Abrir WhatsApp|organization_whatsapp/);
  assert.match(commercialPanel, /CommercialFollowUpDialog/);
  assert.match(commercialPanel, /contact_status/);
});
