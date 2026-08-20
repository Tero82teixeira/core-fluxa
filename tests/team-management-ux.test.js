import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  MEMBER_HAS_RESPONSIBILITIES_MESSAGE,
  eligibleTransferTargets,
  teamMutationErrorMessage,
} from "../src/lib/team-management.ts";

const page = readFileSync("src/routes/_authenticated/equipe.tsx", "utf8");
const hook = readFileSync("src/hooks/use-team.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260802230000_complete_team_permissions.sql",
  "utf8",
);

const member = (userId, active = true) => ({
  id: `membership-${userId}`,
  user_id: userId,
  role: "operacional",
  is_active: active,
  created_at: "2026-08-20T00:00:00Z",
  full_name: userId,
  email: `${userId}@example.com`,
  openTasks: 0,
  lateTasks: 0,
  openProcesses: 0,
  monitoringItems: 0,
});

describe("mensagens das mutações da equipe", () => {
  for (const field of ["message", "details", "hint", "code"]) {
    test(`identifica MEMBER_HAS_RESPONSIBILITIES em error.${field}`, () => {
      assert.equal(
        teamMutationErrorMessage({ [field]: "MEMBER_HAS_RESPONSIBILITIES" }),
        MEMBER_HAS_RESPONSIBILITIES_MESSAGE,
      );
    });
  }

  test("não exibe detalhes inesperados do backend", () => {
    assert.equal(
      teamMutationErrorMessage({ message: "internal table secret" }),
      "Não foi possível atualizar o membro. Tente novamente ou contate o suporte.",
    );
  });
});

describe("fluxo de transferência e status", () => {
  test("somente outro membro ativo pode ser destino", () => {
    assert.deepEqual(
      eligibleTransferTargets(
        [member("origem"), member("ativo"), member("inativo", false)],
        "origem",
      ).map((item) => item.user_id),
      ["ativo"],
    );
  });

  test("a tela oferece ação e confirmação de transferência", () => {
    assert.match(page, /hasOpenResponsibilities\(member\)[\s\S]+Transferir responsabilidades/);
    assert.match(page, /Confirmar transferência/);
    assert.match(page, /Membro de origem/);
  });

  test("a transferência usa os user ids de origem e destino na RPC existente", () => {
    assert.match(
      page,
      /transferResponsibilities\.mutateAsync\(\{[\s\S]+fromUserId: transferFrom\.user_id,[\s\S]+toUserId: transferToUserId/,
    );
    assert.match(
      hook,
      /rpc\("transfer_member_responsibilities", \{[\s\S]+_from: fromUserId,[\s\S]+_to: toUserId/,
    );
  });

  test("a transferência invalida a equipe e as cargas operacionais", () => {
    const transferHook = hook.slice(hook.indexOf("export function useTransferResponsibilities"));
    assert.match(transferHook, /invalidateTeam\(queryClient, organizationId\)/);
    for (const key of ["task-list", "processes", "monitoring"]) {
      assert.match(transferHook, new RegExp(`queryKey: \\\[\"${key}\"`));
    }
  });

  test("transferir não desativa automaticamente", () => {
    const transferAction = page.slice(
      page.indexOf("async function transfer()"),
      page.indexOf("async function invite"),
    );
    assert.doesNotMatch(transferAction, /setActive|useSetMemberActive/);
    assert.match(page, /A desativação\s+deverá ser confirmada separadamente/);
  });

  test("inativos permanecem na lista, podem ser filtrados e exibem Reativar", () => {
    assert.match(page, /status === "all" \|\| \(status === "active"\) === member\.is_active/);
    assert.match(page, /<option value="inactive">Inativos<\/option>/);
    assert.match(page, /member\.is_active \? "Desativar" : "Reativar"/);
  });

  test("reativação usa set_member_active com active true", () => {
    assert.match(page, /active: !member\.is_active/);
    assert.match(hook, /rpc\("set_member_active", \{ _member: memberId, _active: active \}\)/);
  });

  test("autoalteração e último proprietário continuam protegidos", () => {
    assert.match(page, /member\.user_id !== user\?\.id/);
    assert.match(migration, /CANNOT_CHANGE_OWN_ROLE/);
    assert.match(migration, /LAST_OWNER/);
    assert.match(migration, /MEMBER_HAS_RESPONSIBILITIES/);
  });
});
