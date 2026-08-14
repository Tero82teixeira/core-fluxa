import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { permissionsForRole, resolveSessionMembership } from "../src/lib/access-control.ts";

const owner = {
  id: "membership-owner",
  organization_id: "org-1",
  user_id: "ronaldo",
  role: "proprietario",
  is_active: true,
};
const operational = {
  id: "membership-operational",
  organization_id: "org-1",
  user_id: "heloiza",
  role: "operacional",
  is_active: true,
};

describe("identidade e membership ativa", () => {
  test("proprietário vê o role salvo em sua própria membership", () => {
    assert.equal(resolveSessionMembership([owner, operational], "ronaldo", "org-1")?.role, "proprietario");
  });

  test("operacional vê o role salvo em sua própria membership", () => {
    assert.equal(resolveSessionMembership([owner, operational], "heloiza", "org-1")?.role, "operacional");
  });

  test("troca owner → operational não reaproveita a membership anterior", () => {
    assert.equal(resolveSessionMembership([owner], "heloiza", "org-1"), null);
    assert.equal(resolveSessionMembership([owner, operational], "heloiza", "org-1"), operational);
  });

  test("permissões mudam junto com o role da membership", () => {
    assert.equal(permissionsForRole(owner.role).canManageTeam, true);
    assert.equal(permissionsForRole(operational.role).canManageTeam, false);
    assert.equal(permissionsForRole(operational.role).canInviteMembers, false);
  });

  test("UI não recebe fallback owner quando existe membership operacional", () => {
    const membership = resolveSessionMembership([operational], "heloiza", "org-1");
    assert.equal(membership?.role, "operacional");
    assert.equal(permissionsForRole(membership?.role ?? null).role, "operacional");
  });
});
