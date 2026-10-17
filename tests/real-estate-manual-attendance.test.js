import assert from "node:assert/strict";
import test from "node:test";
import {
  validateManualAttendance,
  validClosure,
} from "../src/lib/real-estate-manual-attendance.ts";
import { emptyPreferences } from "../src/lib/real-estate-preferences.ts";
import {
  buildDemoInquiries,
  addManualDemoInquiry,
  closeDemoInquiry,
  reopenDemoInquiry,
  attachDemoInquiry,
  planDemoReturn,
} from "../src/lib/real-estate-demo-inquiries.ts";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";
const now = Date.parse("2026-10-16T12:00:00Z");
const input = {
  name: " Cliente manual ",
  phone: "27 99999-6666",
  origin: "telefone",
  responsible_user_id: "demo",
  next_contact_at: "2026-10-20T12:00:00Z",
  internal_note: " Recebido por telefone. ",
  preferences: emptyPreferences("locacao"),
};
test("cadastro manual valida contato, retorno e preferências em conjunto", () => {
  const v = validateManualAttendance(input, now);
  assert.equal(v.name, "Cliente manual");
  assert.equal(v.phone, "5527999996666");
  assert.equal(v.internal_note, "Recebido por telefone.");
  for (const patch of [
    { name: "x" },
    { phone: "000" },
    { origin: "vitrine" },
    { next_contact_at: "2026-10-15T12:00:00Z" },
    { next_contact_at: "invalid" },
    { preferences: { ...input.preferences, bedrooms: -1 } },
  ])
    assert.throws(() => validateManualAttendance({ ...input, ...patch }, now));
  assert(!validClosure("", ""));
  assert(!validClosure("outro", ""));
  assert(validClosure("desistiu", ""));
  assert(validClosure("outro", "Motivo informado."));
});
test("demo manual evita duplicidade e conserva histórico ao encerrar e reabrir", () => {
  const original = buildDemoInquiries();
  const result = addManualDemoInquiry(original, input, now);
  assert.equal(original.length, 1);
  assert.equal(result.rows.length, 2);
  const row = result.rows.find((r) => r.id === result.id);
  assert.equal(row.listingId, "");
  assert(row.assigned);
  assert.equal(row.origin, "telefone");
  const duplicate = addManualDemoInquiry(
    result.rows,
    { ...input, name: "Não substituir", phone: "5527999996666" },
    now,
  );
  assert(duplicate.duplicate);
  assert.equal(duplicate.rows, result.rows);
  assert.throws(() => closeDemoInquiry(result.rows, row.id, "outro", ""), /INVALID/);
  const closed = closeDemoInquiry(result.rows, row.id, "sem_imovel", "Busca encerrada.");
  assert.equal(closed[1].closed, true);
  assert.equal(closed[1].nextContactAt, undefined);
  assert(closed[1].contacts.at(-1).note.includes("Sem imóvel adequado"));
  assert(row.nextContactAt);
  assert.throws(() => planDemoReturn(closed, row.id, "2026-10-22T12:00:00Z"), /INVALID/);
  const reopened = reopenDemoInquiry(closed, row.id);
  assert.equal(reopened[1].closed, false);
  assert.equal(reopened[1].nextContactAt, undefined);
  assert.equal(reopened[1].contacts.length, 2);
  assert.throws(
    () => attachDemoInquiry(reopened, row.id, { id: "IMOV-004", purpose: "venda" }),
    /INVALID/,
  );
  assert.equal(
    attachDemoInquiry(reopened, row.id, { id: "IMOV-002", purpose: "locacao" })[1].listingId,
    "IMOV-002",
  );
  for (const lang of [en, es])
    assert.deepEqual(
      Object.keys(lang.realEstateDemo.manual).sort(),
      Object.keys(pt.realEstateDemo.manual).sort(),
    );
});
