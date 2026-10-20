import assert from "node:assert/strict";
import test from "node:test";
import i18next from "i18next";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";
import {
  CONSULTING_TEMPLATE_IDS,
  consultingTemplate,
  applyConsultingTemplate,
  consultingDraftDeliveriesValid,
  consultingDraftDeliveries,
  createProjectWithSuggestedDeliveries,
} from "../src/lib/consulting-templates.ts";
import { consultingProjectValid } from "../src/lib/consulting-project.ts";
import {
  buildConsultingDemo,
  buildConsultingDemoData,
  createConsultingDemoTemplateProject,
} from "../src/lib/consulting-demo.ts";

async function translator(lang = "pt") {
  const i = i18next.createInstance();
  await i.init({
    lng: lang,
    resources: { pt: { translation: pt }, en: { translation: en }, es: { translation: es } },
    interpolation: { escapeValue: false },
  });
  return i.t.bind(i);
}
test("três modelos completos e distintos nos três idiomas usam a etapa existente e nenhum preço ou data", async () => {
  for (const lang of ["pt", "en", "es"]) {
    const t = await translator(lang),
      models = CONSULTING_TEMPLATE_IDS.map((id) => consultingTemplate(id, t));
    assert.equal(new Set(models.map((m) => m.title)).size, 3);
    for (const model of models) {
      assert.equal(model.stage, "novo");
      assert.equal(model.deliveries.length, 4);
      assert(consultingDraftDeliveriesValid(model.deliveries));
      assert(consultingProjectValid({ ...model, owner_name: "", due_date: "" }));
      assert.deepEqual(Object.keys(model).sort(), ["deliveries", "description", "stage", "title"]);
      assert.doesNotMatch(JSON.stringify(model), /consultingTemplates\./);
    }
  }
  assert.throws(() => consultingTemplate("invalid", () => ""));
});
test("aplicar modelo preserva cliente, responsável, prazo, serviço, prioridade e valor sem mutar rascunho ou catálogo", async () => {
  const template = consultingTemplate("diagnosis", await translator());
  const current = {
    client_id: "c1",
    title: "Anterior",
    description: "Escopo",
    stage: "montagem",
    owner_name: "Ana",
    due_date: "2026-11-20",
    value: "4500",
    service_type_id: "s1",
    priority: "alta",
  };
  const before = structuredClone({ template, current }),
    next = applyConsultingTemplate(current, template);
  assert.equal(next.form.client_id, "c1");
  assert.equal(next.form.owner_name, "Ana");
  assert.equal(next.form.due_date, "2026-11-20");
  assert.equal(next.form.value, "4500");
  assert.equal(next.form.service_type_id, "s1");
  assert.equal(next.form.priority, "alta");
  assert.equal(next.form.stage, "novo");
  assert.equal(next.form.title, template.title);
  assert.equal(next.form.description, template.description);
  next.deliveries[0] = "Personalizada";
  assert.deepEqual({ template, current }, before);
});
test("entregas editáveis validam tamanho, duplicação e quantidade; lista vazia permite projeto manual", () => {
  assert(consultingDraftDeliveriesValid([]));
  assert.deepEqual(consultingDraftDeliveries(["  Coletar dados  ", "Analisar gargalos"]), [
    "Coletar dados",
    "Analisar gargalos",
  ]);
  for (const titles of [
    [""],
    ["ab"],
    ["x".repeat(161)],
    ["Analisar dados", " analisar   DADOS "],
    Array.from({ length: 21 }, (_, i) => `Entrega ${i}`),
  ])
    assert(!consultingDraftDeliveriesValid(titles));
  assert.throws(() => consultingDraftDeliveries(["a"]));
});
test("falha ao criar não tenta entregas; falha separada das entregas preserva projeto confirmado sem recriação", async () => {
  let created = 0,
    seeded = 0;
  const create = async () => {
    created++;
    return { id: "p1", code: "PRJ-1" };
  };
  const titles = ["Plano de ação"];
  let result = await createProjectWithSuggestedDeliveries(
    create,
    async (id, list) => {
      assert.equal(id, "p1");
      assert.deepEqual(list, titles);
      seeded++;
      list[0] = "changed";
    },
    titles,
  );
  assert(result.deliveriesConfirmed);
  assert.deepEqual(titles, ["Plano de ação"]);
  assert.equal(created, 1);
  assert.equal(seeded, 1);
  result = await createProjectWithSuggestedDeliveries(
    create,
    async () => {
      seeded++;
      throw new Error("network response lost");
    },
    titles,
  );
  assert(!result.deliveriesConfirmed);
  assert.equal(result.created.id, "p1");
  assert.equal(created, 2);
  assert.equal(seeded, 2);
  await assert.rejects(
    () =>
      createProjectWithSuggestedDeliveries(
        async () => {
          throw new Error("no permission");
        },
        async () => {
          seeded++;
        },
        titles,
      ),
    /no permission/,
  );
  assert.equal(seeded, 2);
  await createProjectWithSuggestedDeliveries(create, async () => {
    seeded++;
  }, []);
  assert.equal(seeded, 2);
});
test("demo cria modelo revisado com cliente correto, entregas planejadas e nenhum plano, proposta ou cobrança", async () => {
  const data = buildConsultingDemoData(),
    state = buildConsultingDemo(),
    before = structuredClone({ data, state });
  const model = consultingTemplate("action", await translator()),
    profile = {
      title: "Plano personalizado",
      description: model.description,
      owner_name: "Ana",
      due_date: "2026-12-20",
    };
  const titles = [...model.deliveries.slice(0, 3), "Avaliação personalizada"];
  const next = createConsultingDemoTemplateProject(
    data,
    state,
    "template-one",
    "r2",
    profile,
    titles,
  );
  assert.equal(next.data.cases[0].recordId, "r2");
  assert.equal(next.data.cases[0].stage, 0);
  assert.equal(next.state.projectProfiles["template-one"].title, profile.title);
  const deliveries = next.state.deliveries.filter((d) => d.projectId === "template-one");
  assert.equal(deliveries.length, 4);
  assert(
    deliveries.every(
      (d) => !d.done && d.status === "pendente" && d.due_date === "" && d.assignee_name === "",
    ),
  );
  assert.equal(deliveries.at(-1).title, "Avaliação personalizada");
  assert.deepEqual(next.state.monthlyPlans, state.monthlyPlans);
  assert.deepEqual(next.state.proposals, state.proposals);
  assert.deepEqual(next.data.finance, data.finance);
  assert.deepEqual(next.data.tasks, data.tasks);
  assert.deepEqual({ data, state }, before);
  const again = createConsultingDemoTemplateProject(
    next.data,
    next.state,
    "template-one",
    "r2",
    profile,
    titles,
  );
  assert.equal(again.data, next.data);
  assert.equal(again.state, next.state);
  assert.throws(() =>
    createConsultingDemoTemplateProject(data, state, "template-two", "missing", profile, titles),
  );
  assert.throws(() =>
    createConsultingDemoTemplateProject(data, state, "template-two", "r1", profile, [""]),
  );
});
