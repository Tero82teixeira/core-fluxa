import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync("supabase/config.toml", "utf8");
const auth = readFileSync("src/lib/auth.tsx", "utf8");
const login = readFileSync("src/routes/entrar.tsx", "utf8");
const invitation = readFileSync("src/routes/convite.$token.tsx", "utf8");
const bootstrap = readFileSync(
  "supabase/migrations/20260815120000_defer_bootstrap_for_pending_invitation.sql",
  "utf8",
);

test("desenvolvimento local exige confirmação do e-mail", () => {
  assert.match(config, /\[auth\.email\][\s\S]*enable_signup = true/);
  assert.match(config, /\[auth\.email\][\s\S]*enable_confirmations = true/);
  assert.match(auth, /needsEmailConfirmation: !data\.session/);
});

test("login comum não oferece criação de empresa", () => {
  assert.doesNotMatch(login, /Ainda não possui uma conta\?/);
  assert.match(login, /mode === "signup" && \(/);
  assert.match(login, /Este cadastro cria uma nova empresa\./);
  assert.match(login, /use o link enviado pelo administrador/);
});

test("empresa e teste aguardam a confirmação", () => {
  assert.match(login, /empresa e os 14 dias de teste serão liberados somente depois da confirmação\./);
  assert.match(login, /Reenviar e-mail de confirmação/);
});

test("cadastro pelo convite retorna ao mesmo convite após confirmar o e-mail", () => {
  assert.match(
    invitation,
    /emailRedirectTo: `\$\{window\.location\.origin\}\/convite\/\$\{token\}`/,
  );
  assert.match(invitation, /Criar conta e aceitar/);
});

test("convite pendente continua impedindo empresa própria", () => {
  assert.match(bootstrap, /i\.status = 'pending'[\s\S]*i\.expires_at > now\(\)/);
  assert.match(bootstrap, /BOOTSTRAP_INVITATION_PENDING/);
});
