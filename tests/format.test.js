import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDateOnly } from "../src/lib/format.ts";

describe("formatDateOnly", () => {
  test("formata YYYY-MM-DD sem conversão de fuso", () => {
    assert.equal(formatDateOnly("2026-08-18"), "18/08/2026");
  });

  test("preserva a data civil de ISO com offset UTC", () => {
    assert.equal(formatDateOnly("2026-08-18T00:00:00+00:00"), "18/08/2026");
  });

  test("preserva a data civil de ISO com sufixo Z", () => {
    assert.equal(formatDateOnly("2026-08-18T00:00:00Z"), "18/08/2026");
  });

  test("retorna travessão para valor nulo", () => {
    assert.equal(formatDateOnly(null), "—");
  });
});
