import assert from "node:assert/strict";
import test from "node:test";
import { followupState, followupError } from "../src/lib/real-estate-followups.ts";
import {
  buildDemoInquiries,
  planDemoReturn,
  logDemoContact,
} from "../src/lib/real-estate-demo-inquiries.ts";
test("retornos distinguem horários vencidos, hoje e próximos dias no fuso local", () => {
  const now = new Date(2026, 9, 17, 12, 0);
  assert.equal(followupState(null, now), "none");
  assert.equal(followupState("invalid", now), "none");
  assert.equal(followupState(new Date(2026, 9, 17, 11).toISOString(), now), "overdue");
  assert.equal(followupState(new Date(2026, 9, 17, 13).toISOString(), now), "today");
  assert.equal(followupState(new Date(2026, 9, 18, 9).toISOString(), now), "future");
});
test("conversa e próximo retorno da demonstração ficam apenas no cenário editado", () => {
  const original = buildDemoInquiries();
  let rows = planDemoReturn(original, original[0].id, "2026-10-22T13:00:00Z");
  assert.equal(original[0].nextContactAt, "2026-10-15T12:00:00Z");
  rows = logDemoContact(rows, rows[0].id, "Enviar condições de pagamento.", "");
  assert.equal(rows[0].nextContactAt, "");
  assert.equal(rows[0].contacts[0].note, "Enviar condições de pagamento.");
  assert.equal(original[0].contacts, undefined);
  assert.throws(() => logDemoContact(rows, rows[0].id, "", ""), /DEMO_INVALID/);
  assert.throws(() => planDemoReturn(rows, rows[0].id, "2026-10-15T10:00:00Z"), /DEMO_INVALID/);
  assert(followupError({ message: "FOLLOWUP_FUTURE_REQUIRED" }));
});
