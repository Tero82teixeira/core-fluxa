import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cleanPasswordRecoveryUrl,
  readPasswordRecoveryCredentials,
} from "../src/lib/password-recovery.ts";

const helper = readFileSync("src/lib/password-recovery.ts", "utf8");
const route = readFileSync("src/routes/redefinir-senha.tsx", "utf8");
const login = readFileSync("src/routes/entrar.tsx", "utf8");

test("password recovery accepts PKCE and implicit Supabase links", () => {
  assert.match(helper, /searchParams\.get\("code"\)/);
  assert.match(helper, /hash\.get\("access_token"\)/);
  assert.match(helper, /hash\.get\("refresh_token"\)/);
  assert.match(route, /exchangeCodeForSession/);
  assert.match(route, /supabase\.auth\.setSession/);
  assert.deepEqual(
    readPasswordRecoveryCredentials("https://app.test/redefinir-senha?code=secure-code"),
    { kind: "pkce", code: "secure-code" },
  );
  assert.deepEqual(
    readPasswordRecoveryCredentials(
      "https://app.test/redefinir-senha#access_token=access&refresh_token=refresh&type=recovery",
    ),
    { kind: "implicit", accessToken: "access", refreshToken: "refresh" },
  );
});

test("password fields stay editable while the secure link is validated", () => {
  assert.match(route, /Você já pode digitar a nova senha/);
  assert.match(route, /disabled=\{saving\}/);
  assert.doesNotMatch(route, /disabled=\{!ready\}/);
  assert.match(route, /disabled=\{!ready \|\| checking \|\| saving\}/);
});

test("tokens are removed from the address after session creation", () => {
  assert.match(helper, /"access_token"/);
  assert.match(helper, /url\.hash/);
  assert.match(helper, /url\.pathname/);
  assert.match(route, /window\.history\.replaceState/);
  assert.match(route, /cleanPasswordRecoveryUrl/);
  assert.equal(
    cleanPasswordRecoveryUrl(
      "https://app.test/redefinir-senha?code=secret&keep=yes#access_token=secret",
    ),
    "/redefinir-senha?keep=yes",
  );
});

test("the reset request keeps using the current published origin", () => {
  assert.match(login, /redirectTo: `\$\{window\.location\.origin\}\/redefinir-senha`/);
});
