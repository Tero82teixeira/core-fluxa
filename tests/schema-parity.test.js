import assert from "node:assert/strict";
import test from "node:test";
import { schemasAreEqual } from "../scripts/check-supabase-schema-parity.mjs";

const schema = ({
  column = "string",
  table = true,
  rpc = true,
  arg = "string",
  returns = "boolean",
  extras = "",
} = {}) => `
export type Database = {
  __InternalSupabase: { PostgrestVersion: ${extras ? '"old"' : '"new"'} }
  public: {
    Tables: { ${table ? `audit_logs: { Row: { id: number; action: ${column} }; Insert: { action: ${column}; id?: number }; Update: { action?: ${column}; id?: number }; Relationships: [] }` : ""} }
    Views: {}
    Functions: { ${rpc ? `write_audit: { Args: { message: ${arg}; code?: number }; Returns: ${returns} }` : ""} }
    Enums: { status: "open" | "closed" }
    CompositeTypes: { address: { street: string; zip: number } }
    Constants: { ignored: ${extras ? "1" : "2"} }
  }
  ${extras}
}
`;

test("accepts formatting differences", () => {
  assert.equal(schemasAreEqual(schema(), schema().replaceAll(";", ";\n")), true);
});

test("accepts property order differences", () => {
  const reordered = schema()
    .replace("id: number; action: string", "action: string\n id: number")
    .replace("message: string; code?: number", "code?: number; message: string");
  assert.equal(schemasAreEqual(schema(), reordered), true);
});

test("ignores __InternalSupabase differences", () => {
  const changed = schema().replace('PostgrestVersion: "new"', 'PostgrestVersion: "old"');
  assert.equal(schemasAreEqual(schema(), changed), true);
});

test("ignores an additional graphql_public schema", () => {
  const changed = schema().replace(/}\s*$/, "graphql_public: { Tables: { generated: never } }\n}");
  assert.equal(schemasAreEqual(schema(), changed), true);
});

test("ignores Constants differences", () => {
  const changed = schema().replace("ignored: 2", "ignored: 999");
  assert.equal(schemasAreEqual(schema(), changed), true);
});

test("rejects a changed column type", () => {
  assert.equal(schemasAreEqual(schema(), schema({ column: "number" })), false);
});

test("rejects a removed table", () => {
  assert.equal(schemasAreEqual(schema(), schema({ table: false })), false);
});

test("rejects a removed RPC", () => {
  assert.equal(schemasAreEqual(schema(), schema({ rpc: false })), false);
});

test("rejects a changed RPC argument", () => {
  assert.equal(schemasAreEqual(schema(), schema({ arg: "number" })), false);
});

test("rejects a changed RPC return", () => {
  assert.equal(schemasAreEqual(schema(), schema({ returns: "string" })), false);
});
