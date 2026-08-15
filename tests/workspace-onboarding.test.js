import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

import { organizationDisplayName } from "../src/lib/organization-name.ts";

const bootstrap = readFileSync(
  "supabase/migrations/20260815120000_defer_bootstrap_for_pending_invitation.sql",
  "utf8",
);
const acceptance = readFileSync(
  "supabase/migrations/20260806002115_eee745a4-5136-45c2-8e87-470c1d5bad12.sql",
  "utf8",
);

describe("cadastro e convite não duplicam workspaces", () => {
  test("novo proprietário sem convite recebe organização e membership próprios", () => {
    assert.match(bootstrap, /INSERT INTO public\.organizations \(legal_name, created_by\)/);
    assert.match(bootstrap, /VALUES \(v_org\.id, v_caller, 'proprietario', true\)/);
  });

  test("convidado operacional recebe membership apenas na organização convidante", () => {
    assert.match(acceptance, /VALUES \(v_inv\.organization_id, v_uid, v_inv\.role, true\)/);
    assert.doesNotMatch(acceptance, /INSERT INTO public\.organizations/);
  });

  test("bootstrap anterior ao aceite não cria workspace duplicado", () => {
    const guard = bootstrap.indexOf("BOOTSTRAP_INVITATION_PENDING");
    const createOrganization = bootstrap.indexOf("INSERT INTO public.organizations");
    assert.ok(guard > -1 && guard < createOrganization);
    assert.match(bootstrap, /i\.status = 'pending'[\s\S]*i\.expires_at > now\(\)/);
  });
});

describe("nome de workspace incompleto", () => {
  test("prioriza nome fantasia", () =>
    assert.equal(
      organizationDisplayName({ trade_name: " FLUXA ", legal_name: "Fluxa Ltda" }),
      "FLUXA",
    ));
  test("usa razão social quando nome fantasia está vazio", () =>
    assert.equal(
      organizationDisplayName({ trade_name: "  ", legal_name: " heloiza " }),
      "heloiza",
    ));
  test("usa Workspace somente quando os dois nomes estão ausentes", () =>
    assert.equal(organizationDisplayName({ trade_name: null, legal_name: " " }), "Workspace"));
});
