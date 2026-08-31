import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  TEAM_MEMBER_LIMIT,
  TEAM_MEMBER_LIMIT_MESSAGE,
  countUsedTeamSeats,
  teamInvitationErrorMessage,
  teamMutationErrorMessage,
} from "../src/lib/team-management.ts";

const migrationPath = new URL(
  "../supabase/migrations/20260831180000_enforce_five_user_team_limit.sql",
  import.meta.url,
);

const member = (active) => ({ is_active: active });

describe("limite comercial de usuários", () => {
  test("conta usuários ativos e convites pendentes como vagas", () => {
    assert.equal(TEAM_MEMBER_LIMIT, 5);
    assert.equal(countUsedTeamSeats([member(true), member(true), member(false)], 2), 4);
  });

  test("traduz a rejeição segura do banco", () => {
    assert.equal(
      teamMutationErrorMessage({ message: "ORGANIZATION_MEMBER_LIMIT_REACHED" }),
      TEAM_MEMBER_LIMIT_MESSAGE,
    );
    assert.equal(
      teamInvitationErrorMessage({ details: "ORGANIZATION_MEMBER_LIMIT_REACHED" }),
      TEAM_MEMBER_LIMIT_MESSAGE,
    );
  });

  test("banco protege toda ativação e reserva convites sem corrida", async () => {
    const migration = await readFile(migrationPath, "utf8");
    const acceptFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.accept_invitation"),
    );

    assert.match(migration, /BEFORE INSERT OR UPDATE OF is_active, organization_id/);
    assert.match(migration, /BEFORE INSERT OR UPDATE OF organization_id, status, expires_at/);
    assert.match(migration, /reserved_seats >= 5/);
    assert.match(migration, /status = 'pending'[\s\S]*expires_at > now\(\)/);
    assert.match(migration, /pg_advisory_xact_lock/g);
    assert.match(migration, /ORGANIZATION_MEMBER_LIMIT_REACHED/g);
    assert.match(acceptFunction, /pg_advisory_xact_lock[\s\S]*FOR UPDATE/);
    assert.match(
      acceptFunction,
      /SET status = 'accepted'[\s\S]*INSERT INTO public\.organization_members/,
    );
  });

  test("interface mostra o consumo e bloqueia convite e reativação", async () => {
    const [page, invitation] = await Promise.all([
      readFile(new URL("../src/routes/_authenticated/equipe.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/routes/convite.$token.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(page, /usedSeats.*TEAM_MEMBER_LIMIT/);
    assert.match(page, /vagas usadas/);
    assert.match(page, /teamLimitReached/);
    assert.match(page, /!member\.is_active && teamLimitReached/);
    assert.match(invitation, /ORGANIZATION_MEMBER_LIMIT_REACHED/);
  });
});
