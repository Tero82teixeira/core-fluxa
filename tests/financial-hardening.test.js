import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260818210000_harden_financial_integrity.sql",
  "utf8",
);

test("financial transaction update rejects amounts below active payments", () => {
  assert.match(migration, /reversed_at IS NULL/);
  assert.match(migration, /new_amount < paid_total/);
  assert.match(migration, /RAISE EXCEPTION 'AMOUNT_BELOW_PAID_TOTAL'/);
  assert.match(migration, /FOR UPDATE/);
});

test("recurrence link trigger and hardened RPC are reinstalled", () => {
  for (const error of [
    "INVALID_CATEGORY_ORGANIZATION", "INVALID_ACCOUNT_ORGANIZATION",
    "INVALID_CLIENT_ORGANIZATION", "INVALID_PROCESS_ORGANIZATION",
    "INVALID_END_DATE", "INVALID_NEXT_RUN_DATE",
  ]) assert.match(migration, new RegExp(error));
  assert.match(migration, /CREATE TRIGGER financial_validate_recurrence_links/);
  assert.match(migration, /recurrence_frequency NOT IN/);
  assert.match(migration, /recurrence_interval IS NULL OR recurrence_interval <= 0/);
});

test("all financial tables revoke every direct write privilege", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE/);
  for (const table of ["financial_categories", "financial_accounts", "financial_transactions", "financial_transaction_payments", "financial_recurrences", "financial_account_movements"]) {
    assert.match(migration, new RegExp(`public\\.${table}`));
  }
  assert.match(migration, /FROM authenticated, anon/);
});
