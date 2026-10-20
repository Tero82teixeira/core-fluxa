import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildConsultingSummary,
  consultingSummaryDocument,
} from "../src/lib/consulting-summary.ts";
import { createConsultingSummaryPdf } from "../src/lib/consulting-summary-pdf.ts";
import i18next from "i18next";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";

const input = {
  company: "Assessoria São João",
  client: "Empresa A",
  code: "PRJ-001",
  stage: "Em execução",
  title: "Melhorar processos",
  description: "Escopo combinado\nSegunda linha",
  owner_name: "Ana",
  due_date: "2026-11-30",
  return_on: "2026-10-20",
  today: "2026-10-20",
  notes: "NOTA_INTERNA_SECRETA",
  value: 99000,
  document: "CPF_INTERNO",
  deliveries: [
    { title: "Sem prazo", status: "pendente", due_date: null, assignee_name: null },
    {
      title: "Recebida",
      status: "recebido",
      due_date: "2026-10-21",
      assignee_name: "Ana",
      description: "CRITÉRIO_INTERNO",
    },
    { title: "Validando", status: "em_analise", due_date: "2026-10-20", assignee_name: null },
    { title: "Concluída", status: "aprovado", due_date: "2026-10-01", assignee_name: "Ana" },
    { title: "Corrigir", status: "rejeitado", due_date: "2026-10-19", assignee_name: "Ana" },
  ],
};
test("resumo permite apenas campos do cliente, preserva fontes e ordena pendências sem falso aceite", () => {
  const before = structuredClone(input),
    summary = buildConsultingSummary(input);
  assert.deepEqual(input, before);
  assert.deepEqual(
    summary.pending.map((x) => x.title),
    ["Corrigir", "Validando", "Recebida", "Sem prazo"],
  );
  assert.deepEqual(
    summary.done.map((x) => x.title),
    ["Concluída"],
  );
  assert.deepEqual(summary.progress, { total: 5, done: 1, pending: 4, overdue: 1, percent: 20 });
  assert.equal(summary.returnOn, "2026-10-20");
  assert.doesNotMatch(
    JSON.stringify(summary),
    /NOTA_INTERNA_SECRETA|CPF_INTERNO|99000|CRITÉRIO_INTERNO/,
  );
});
test("documento diferencia exemplo de atendimento real nos três idiomas e trata campos ausentes", async () => {
  for (const [lng, translation] of Object.entries({ pt, en, es })) {
    const instance = i18next.createInstance();
    await instance.init({
      lng,
      resources: { [lng]: { translation } },
      interpolation: { escapeValue: false },
    });
    const summary = buildConsultingSummary({
      ...input,
      title: null,
      description: null,
      owner_name: null,
      due_date: null,
      return_on: null,
      deliveries: [],
    });
    const actual = consultingSummaryDocument(summary, instance.t.bind(instance), (d) => d);
    assert.equal(actual.notice, translation.consultingSummary.snapshot);
    assert(
      actual.sections[0].lines.some((line) => line.includes(translation.consultingProject.empty)),
    );
    assert(actual.sections[1].lines.includes(translation.consultingSummary.noPending));
    assert(actual.sections[2].lines.includes(translation.consultingSummary.noDone));
    assert.doesNotMatch(JSON.stringify(actual), /consultingSummary\.|consultingProject\./);
    const demo = consultingSummaryDocument(
      { ...summary, demo: true },
      instance.t.bind(instance),
      (d) => d,
    );
    assert.equal(demo.notice, translation.consultingSummary.demo);
    assert.notEqual(demo.notice, actual.notice);
  }
});
test("PDF real inclui fonte Unicode, múltiplas páginas e todo o texto longo sem modificar o documento", async () => {
  const instance = i18next.createInstance();
  await instance.init({
    lng: "pt",
    resources: { pt: { translation: pt } },
    interpolation: { escapeValue: false },
  });
  const summary = buildConsultingSummary({
    ...input,
    description: "Diagnóstico, ação e revisão. ".repeat(140),
    deliveries: Array.from({ length: 60 }, (_, i) => ({
      ...input.deliveries[1],
      title: `Entrega ${i + 1}: análise ${"X".repeat(160)}`,
    })),
  });
  const content = consultingSummaryDocument(summary, instance.t.bind(instance), (d) => d),
    before = structuredClone(content);
  const font = readFileSync("src/assets/DejaVuSans.ttf").toString("base64");
  const pdf = createConsultingSummaryPdf(content, font);
  assert(pdf.getNumberOfPages() > 3);
  const buffer = Buffer.from(pdf.output("arraybuffer"));
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pdf.getFont().fontName, "Fluxa");
  assert.deepEqual(content, before);
});
