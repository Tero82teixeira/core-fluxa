import assert from "node:assert/strict";
import test from "node:test";
import {
  collectSettlementExport,
  realEstateFinancialSummary,
  settlementCsv,
} from "../src/lib/real-estate-finance.ts";

const totals = { commission_received: 10, owner_pending: 90, owner_paid: 0 };
const row = (n = 1, patch = {}) => ({
  id: `demonstrativo-${n}`,
  property_code: "IMOV-002",
  contract_reference: "CT-TESTE-001",
  owner_name: "João",
  reference: "2026-10",
  display_status: "atrasado",
  status: "recebido",
  gross: 1600,
  commission_type: "percentual",
  commission_value: 10,
  commission_amount: 160,
  owner_amount: 1440,
  due_on: "2026-10-20",
  occurred_on: "2026-10-16",
  note: "Recebimento confirmado",
  version: 2,
  ...patch,
});

test("bruto inclui comissão e repasses pendentes e pagos uma única vez", () => {
  assert.deepEqual(
    realEstateFinancialSummary({ commission_received: 160, owner_pending: 1000, owner_paid: 440 }),
    {
      gross_received: 1600,
      commission_received: 160,
      owner_pending: 1000,
      owner_paid: 440,
    },
  );
  assert.equal(
    realEstateFinancialSummary({ commission_received: 0.1, owner_pending: 0.2, owner_paid: 0.03 })
      .gross_received,
    0.33,
  );
  assert.equal(
    realEstateFinancialSummary({ commission_received: 0, owner_pending: 0, owner_paid: 0 })
      .gross_received,
    0,
  );
});

test("exportação reúne 45 demonstrativos de três páginas em ordem, sem truncar na primeira", async () => {
  const source = Array.from({ length: 45 }, (_, n) => row(n));
  const calls = [],
    progress = [];
  const exported = await collectSettlementExport(
    async (page) => {
      calls.push(page);
      return { items: source.slice((page - 1) * 20, page * 20), total: source.length, totals };
    },
    undefined,
    (loaded, total) => progress.push([loaded, total]),
  );
  assert.deepEqual(exported, source);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.deepEqual(progress, [
    [20, 45],
    [40, 45],
    [45, 45],
  ]);
});

test("lista vazia não requisita páginas extras e limite não entrega arquivo parcial", async () => {
  let calls = 0;
  assert.deepEqual(
    await collectSettlementExport(async () => {
      calls++;
      return { items: [], total: 0, totals };
    }),
    [],
  );
  assert.equal(calls, 1);
  await assert.rejects(
    collectSettlementExport(async () => ({ items: [row()], total: 10_001, totals })),
    /10.000/,
  );
});

test("mudança de total, páginas incompletas e IDs repetidos interrompem a exportação", async () => {
  const first = Array.from({ length: 20 }, (_, n) => row(n));
  for (const second of [
    { items: [row(20)], total: 21, totals },
    { items: [row(20)], total: 22, totals },
    { items: [row(0), row(21)], total: 22, totals },
  ])
    await assert.rejects(
      collectSettlementExport(async (page) =>
        page === 1 ? { items: first, total: 22, totals } : second,
      ),
      /mudaram/,
    );
  await assert.rejects(
    collectSettlementExport(async () => ({ items: [], total: 1, totals })),
    /mudaram/,
  );
});

test("falha de uma página e cancelamento não devolvem registros parciais", async () => {
  const first = Array.from({ length: 20 }, (_, n) => row(n));
  await assert.rejects(
    collectSettlementExport(async (page) => {
      if (page === 2) throw new Error("Falha de rede");
      return { items: first, total: 21, totals };
    }),
    /Falha de rede/,
  );
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    collectSettlementExport(async () => {
      calls++;
      controller.abort();
      return { items: first, total: 21, totals };
    }, controller.signal),
    /EXPORT_ABORTED/,
  );
  assert.equal(calls, 1);
});

test("CSV inclui valores brasileiros, data da última operação, situação e identidade do demonstrativo", () => {
  const csv = settlementCsv([row()]);
  assert(csv.startsWith('\uFEFF"ID do demonstrativo";"Imóvel";"Contrato";"Proprietário";'));
  assert(
    csv.includes(
      '"demonstrativo-1";"IMOV-002";"CT-TESTE-001";"João";"2026-10";"Repasse em atraso";"1600,00";',
    ),
  );
  assert(
    csv.includes(
      '"10,00";"160,00";"1440,00";"20/10/2026";"16/10/2026";"Recebimento confirmado";"2"',
    ),
  );
  assert.equal(csv.split("\r\n").length, 2);
  const emptyDate = settlementCsv([
    row(2, { occurred_on: null, owner_name: null, status: "previsto", display_status: "previsto" }),
  ]);
  assert(emptyDate.includes('"Previsto"'));
  assert(emptyDate.includes('"20/10/2026";"";'));
});

test("CSV mantém aspas, separadores e quebras de linha dentro das células e neutraliza fórmulas", () => {
  const csv = settlementCsv([
    row(1, {
      owner_name: '=HYPERLINK("https://example.test")',
      note: 'Texto; com "aspas"\r\ne outra linha',
    }),
  ]);
  assert(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
  assert(csv.includes('"Texto; com ""aspas""\r\ne outra linha"'));
  for (const text of ["+SUM(1,2)", "-1+1", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1"])
    assert(settlementCsv([row(1, { owner_name: text })]).includes(`"'${text}"`));
});
