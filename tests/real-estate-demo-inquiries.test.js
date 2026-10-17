import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDemoInquiries,
  addDemoInquiry,
  actDemoInquiry,
} from "../src/lib/real-estate-demo-inquiries.ts";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";
test("demonstração conecta pedido a atendimento, horário e resultado sem persistir dados", () => {
  const initial = buildDemoInquiries();
  let rows = addDemoInquiry(initial, {
    listingId: "IMOV-002",
    name: "Cliente Exemplo",
    phone: "27999990001",
    kind: "visita",
    preference: "2026-10-22",
  });
  const id = rows[1].id;
  assert.equal(addDemoInquiry(rows, { ...rows[1] }), rows);
  assert.equal(initial.length, 1);
  assert.throws(() => actDemoInquiry(rows, id, "schedule", "2026-10-22T13:00:00Z"), /DEMO_INVALID/);
  rows = actDemoInquiry(rows, id, "assign");
  rows = actDemoInquiry(rows, id, "schedule", "2026-10-22T13:00:00Z");
  rows = actDemoInquiry(rows, id, "confirm");
  assert.equal(rows[1].confirmed, true);
  rows = actDemoInquiry(rows, id, "schedule", "2026-10-22T14:00:00Z");
  assert.equal(rows[1].confirmed, false);
  rows = actDemoInquiry(rows, rows[0].id, "assign");
  assert.throws(
    () => actDemoInquiry(rows, rows[0].id, "schedule", "2026-10-22T14:30:00Z"),
    /DEMO_OVERLAP/,
  );
  assert.throws(() => actDemoInquiry(rows, id, "realizada", ""), /DEMO_INVALID/);
  rows = actDemoInquiry(rows, id, "realizada", "Cliente quer receber proposta.");
  assert.equal(rows[1].stage, "realizada");
  assert.equal(rows[1].outcome, "Cliente quer receber proposta.");
  assert.equal(buildDemoInquiries()[0].stage, "novo");
});
test("atendimento demonstrativo tem rótulos nas três línguas", () => {
  for (const language of [pt, en, es]) {
    assert(language.realEstateDemo.modules.attendance);
    assert.deepEqual(
      Object.keys(language.realEstateDemo.attendance).sort(),
      Object.keys(pt.realEstateDemo.attendance).sort(),
    );
  }
});
