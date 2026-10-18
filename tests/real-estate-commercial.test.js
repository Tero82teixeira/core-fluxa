import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_METRICS,
  COMMERCIAL_REASONS,
  filterCommercialRows,
  summarizeCommercialRows,
  validCommercialDates,
} from "../src/lib/real-estate-commercial.ts";
import {
  buildCommercialDemoInquiries,
  demoCommercialRows,
  COMMERCIAL_DEMO_NOW,
} from "../src/lib/real-estate-demo-commercial.ts";
import {
  actDemoInquiry,
  closeDemoInquiry,
  addManualDemoInquiry,
} from "../src/lib/real-estate-demo-inquiries.ts";
import { emptyPreferences } from "../src/lib/real-estate-preferences.ts";
const filters = {
  date_from: "2026-09-17",
  date_to: "2026-10-16",
  timezone: "America/Sao_Paulo",
  responsible: "",
};
test("painel da demo usa os mesmos atendimentos e os atalhos respeitam cada indicador", () => {
  const rows = buildCommercialDemoInquiries(),
    source = demoCommercialRows(rows),
    data = summarizeCommercialRows(source, filters, COMMERCIAL_DEMO_NOW);
  assert.equal(data.totals.received, 5);
  assert.equal(data.totals.waiting, 2);
  assert.equal(data.totals.active, 3);
  assert.equal(data.totals.overdue, 1);
  assert.equal(data.totals.unassigned, 2);
  assert.equal(data.totals.won, 1);
  assert.equal(data.totals.closed, 2);
  for (const metric of COMMERCIAL_METRICS)
    assert.equal(
      filterCommercialRows(source, { ...filters, metric }, COMMERCIAL_DEMO_NOW).length,
      data.totals[metric],
    );
  for (const c of data.channels)
    for (const reason of COMMERCIAL_REASONS)
      assert.equal(
        filterCommercialRows(
          source,
          { ...filters, origin: c.origin, metric: "closed", closure_reason: reason },
          COMMERCIAL_DEMO_NOW,
        ).length,
        c[reason],
      );
  const assigned = actDemoInquiry(rows, "PEDIDO-DEMO-001", "assign");
  assert.equal(
    summarizeCommercialRows(demoCommercialRows(assigned), filters, COMMERCIAL_DEMO_NOW).totals
      .unassigned,
    1,
  );
  const closed = closeDemoInquiry(assigned, "PEDIDO-DEMO-001", "sem_imovel", "Sem opção adequada.");
  assert.equal(
    summarizeCommercialRows(demoCommercialRows(closed), filters, COMMERCIAL_DEMO_NOW).totals
      .overdue,
    0,
  );
  const added = addManualDemoInquiry(rows, {
    name: "Contato Exemplo",
    phone: "27999998888",
    origin: "whatsapp",
    responsible_user_id: "demo",
    next_contact_at: null,
    internal_note: "",
    preferences: emptyPreferences("locacao"),
  });
  assert.equal(
    summarizeCommercialRows(demoCommercialRows(added.rows), filters, COMMERCIAL_DEMO_NOW).totals
      .received,
    6,
  );
  assert.equal(source.length, 5, "os exemplos originais não foram alterados");
});
test("período inclui o dia final no fuso indicado e limita o intervalo a 366 dias", () => {
  assert(validCommercialDates("2024-01-01", "2024-12-31"));
  assert(!validCommercialDates("2024-01-01", "2025-01-01"));
  assert(!validCommercialDates("2026-02-30", "2026-03-01"));
  assert(!validCommercialDates("2026-10-02", "2026-10-01"));
  const base = demoCommercialRows(buildCommercialDemoInquiries())[0];
  const rows = [
    { ...base, id: "before", created_at: "2026-10-01T02:59:00Z" },
    { ...base, id: "start", created_at: "2026-10-01T03:00:00Z" },
    { ...base, id: "end", created_at: "2026-10-03T02:59:00Z" },
    { ...base, id: "after", created_at: "2026-10-03T03:00:00Z" },
  ];
  const f = { ...filters, date_from: "2026-10-01", date_to: "2026-10-02" };
  assert.deepEqual(
    filterCommercialRows(rows, f).map((r) => r.id),
    ["start", "end"],
  );
  assert.deepEqual(
    filterCommercialRows(rows, { ...f, timezone: "UTC" }).map((r) => r.id),
    ["before", "start"],
  );
  assert.equal(filterCommercialRows(rows, { ...f, responsible: "demo" }).length, 0);
  assert.throws(() => filterCommercialRows(rows, { ...f, timezone: "invalid/zone" }));
});
