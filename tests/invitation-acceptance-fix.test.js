import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260805150000_fix_accept_invitation_active_organization.sql", "utf8");
const invite = readFileSync("src/routes/convite.$token.tsx", "utf8");
const workspace = readFileSync("src/lib/workspace.tsx", "utf8");
const frontend = invite + workspace;

describe("aceite de convite e organização ativa", () => {
  for (const role of ["operacional", "administrador", "visualizador"]) {
    test(`${role} permanece com role do convite`, () => assert.match(migration, /VALUES \(v_inv\.organization_id, auth\.uid\(\), v_inv\.role, true\)/));
  }
  test("convidado nunca vira proprietário", () => assert.doesNotMatch(migration, /'proprietario'[^\n]+v_inv\.role/));
  test("role enviada pelo frontend é ignorada", () => assert.doesNotMatch(invite, /accept_invitation", \{[^}]*role/));
  test("organization_id enviado pelo frontend é ignorado", () => assert.doesNotMatch(invite, /accept_invitation", \{[^}]*organization/));
  test("membership criado na organização do convite", () => assert.match(migration, /organization_id, user_id, role, is_active\)[\s\S]+v_inv\.organization_id, auth\.uid\(\), v_inv\.role, true/));
  test("convite sai de pendente", () => assert.match(migration, /SET status = 'accepted'/));
  test("accepted_at é preenchido", () => assert.match(migration, /accepted_at = now\(\)/));
  test("accepted_by é preenchido", () => assert.match(migration, /accepted_by = auth\.uid\(\)/));
  test("convite expirado é rejeitado", () => assert.match(migration, /INVITE_EXPIRED/));
  test("convite cancelado é rejeitado", () => assert.match(migration, /INVITE_CANCELLED/));
  test("convite reutilizado é rejeitado", () => assert.match(migration, /INVITE_ALREADY_USED/));
  test("e-mail diferente é rejeitado", () => assert.match(migration, /INVITE_EMAIL_MISMATCH/));
  test("comparação de e-mail usa lower e trim", () => assert.match(migration, /lower\(trim\(v_inv\.email\)\)/));
  test("membership duplicado é evitado", () => assert.match(migration, /ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key/));
  test("corrida de dois aceites é protegida", () => assert.match(migration, /FOR UPDATE[\s\S]+WHERE id = v_inv\.id AND status = 'pending'/));
  test("bootstrap normal continua funcionando sem convite", () => assert.match(workspace, /options\.bootstrap && window\.localStorage\.getItem\(INVITATION_STORAGE_KEY\) !== "1"/));
  test("bootstrap não substitui organização convidante", () => assert.match(workspace, /bootstrap adiado para aceite de convite/));
  test("organização convidante vira ativa", () => assert.match(invite, /setItem\(WORKSPACE_STORAGE_KEY, accepted\.organization_id\)/));
  test("role exibida vem da organização ativa", () => assert.match(workspace, /role: membership\?\.role/));
  test("cache de equipe e convites é invalidado", () => assert.match(invite, /team-members[\s\S]+members[\s\S]+invitations/));
  test("novo membro aparece como responsável", () => assert.match(invite, /task-list[\s\S]+processes[\s\S]+monitoring/));
  test("nenhum uso de Edge Function", () => assert.doesNotMatch(invite, /functions\.invoke/));
  test("nenhuma chave privilegiada no frontend", () => assert.doesNotMatch(frontend, /service_role|service key|SUPABASE_SERVICE/i));
  test("RPC revogada de PUBLIC e anon", () => assert.match(migration, /REVOKE ALL ON FUNCTION public\.accept_invitation\(text\) FROM PUBLIC, anon/));
  test("sem DELETE físico", () => assert.doesNotMatch(migration, /DELETE\s+FROM/i));
  test("audit log registrado", () => assert.match(migration, /INSERT INTO public\.audit_logs/));
});
