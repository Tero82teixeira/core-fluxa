import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildRealEstateDemo,
  applyRealEstateDemoAction,
  realEstateDemoSummary,
  realEstateDemoMatches,
} from "../src/lib/real-estate-public-demo.ts";
import { settlementCsv } from "../src/lib/real-estate-finance.ts";
import { pt } from "../src/i18n/locales/pt.ts";
import { en } from "../src/i18n/locales/en.ts";
import { es } from "../src/i18n/locales/es.ts";

test("exemplos começam com propostas, vencimento e repasse pendentes e totais conciliados", () => {
  const data = buildRealEstateDemo();
  assert.deepEqual(realEstateDemoSummary(data), {
    proposals: 2,
    contracts: 1,
    late: 1,
    gross_received: 3200,
    commission_received: 320,
    owner_pending: 1440,
    owner_paid: 1440,
  });
  for (const proposal of data.proposals)
    assert(data.properties.some((p) => p.id === proposal.property));
  for (const contract of data.contracts)
    assert(data.proposals.some((p) => p.id === contract.proposal && p.status === "aceita"));
  for (const row of data.settlements) {
    assert(data.contracts.some((c) => c.id === row.contract_id && c.property === row.property_id));
    assert.equal(row.commission_amount + row.owner_amount, row.gross);
  }
});

test("jornada completa atualiza indicadores sem alterar o cenário original e não duplica ações", () => {
  const original = buildRealEstateDemo();
  let data = original;
  const act = (type, id) => {
    data = applyRealEstateDemoAction(data, { type, id });
  };
  act("accept", "PROP-DEMO-001");
  assert.equal(realEstateDemoSummary(data).proposals, 1);
  act("contract", "PROP-DEMO-001");
  assert.equal(data.contracts.length, 2);
  act("contract", "PROP-DEMO-001");
  assert.equal(data.contracts.length, 2);
  act("settlement", "CT-DEMO-001");
  assert.equal(data.settlements.length, 3);
  act("settlement", "CT-DEMO-001");
  assert.equal(data.settlements.length, 3);
  const statement = data.settlements.find((s) => s.contract_id === "CT-DEMO-001");
  assert.equal(statement.status, "previsto");
  assert.equal(statement.commission_amount, 210);
  assert.equal(realEstateDemoSummary(data).gross_received, 3200);
  act("receive", statement.id);
  act("receive", statement.id);
  assert.equal(data.settlements.find((s) => s.id === statement.id).version, 2);
  assert.equal(realEstateDemoSummary(data).gross_received, 5300);
  assert.equal(realEstateDemoSummary(data).owner_pending, 3330);
  act("pay", statement.id);
  act("pay", statement.id);
  assert.equal(data.settlements.find((s) => s.id === statement.id).version, 3);
  assert.equal(realEstateDemoSummary(data).owner_paid, 3330);
  act("pay", "REP-DEMO-002");
  assert.equal(realEstateDemoSummary(data).late, 0);
  assert.equal(realEstateDemoSummary(data).owner_pending, 0);
  assert.equal(realEstateDemoSummary(data).owner_paid, 4770);
  assert.deepEqual(original, buildRealEstateDemo());
});

test("ações fora de ordem, proposta vencida e registros desconhecidos não avançam", () => {
  const data = buildRealEstateDemo();
  for (const action of [
    { type: "contract", id: "PROP-DEMO-001" },
    { type: "contract", id: "PROP-DEMO-003" },
    { type: "accept", id: "PROP-DEMO-003" },
    { type: "settlement", id: "inexistente" },
    { type: "receive", id: "REP-DEMO-001" },
    { type: "accept", id: "inexistente" },
    { type: "pay", id: "inexistente" },
  ])
    assert.equal(applyRealEstateDemoAction(data, action), data);
  let refused = applyRealEstateDemoAction(data, { type: "refuse", id: "PROP-DEMO-001" });
  assert.equal(
    applyRealEstateDemoAction(refused, { type: "contract", id: "PROP-DEMO-001" }),
    refused,
  );
  refused = applyRealEstateDemoAction(refused, { type: "refuse", id: "PROP-DEMO-003" });
  assert.equal(realEstateDemoSummary(refused).proposals, 0);
});

test("busca conecta imóvel, proprietário, interessado e contrato, inclusive sem acentos", () => {
  const data = buildRealEstateDemo();
  for (const query of ["imov-002", "CARLOS", "Lucas", "ct-demo-002", " praia "])
    assert(realEstateDemoMatches(data, "IMOV-002", query, "Apartamento perto da praia"));
  assert(realEstateDemoMatches(data, "IMOV-003", "julia"));
  assert.equal(realEstateDemoMatches(data, "IMOV-001", "CT-DEMO-002"), false);
  assert.equal(realEstateDemoMatches(data, "inexistente", ""), false);
});

test("demo e ações fictícias têm rótulos nas três línguas e exportam os exemplos", () => {
  const data = buildRealEstateDemo();
  for (const language of [pt, en, es]) {
    for (const module of ["overview", "catalog", "attendance", "commercial", "properties", "proposals", "contracts", "settlements"])
      assert(language.realEstateDemo.modules[module], `Rótulo ausente: realEstateDemo.modules.${module}`);
    for (const property of data.properties)
      assert(language.realEstateDemo.titles[property.titleKey]);
    for (const row of data.settlements) assert(language.realEstateDemo.status[row.display_status]);
    for (const action of ["accept", "refuse", "contract", "settlement", "receive", "pay"])
      assert(language.realEstateDemo.actions[action]);
    assert(language.realEstateDemo.scenario.includes("{{date}}"));
  }
  const csv = settlementCsv(data.settlements);
  assert(csv.includes('"CT-DEMO-002"'));
  assert(csv.includes('"1600,00"'));
  assert.equal(csv.split("\r\n").length, 3);
});

test("superfície pública usa somente exemplos em memória e preserva o cadastro real", () => {
  for (const path of [
    "src/lib/real-estate-public-demo.ts",
    "src/components/real-estate/real-estate-public-demo.tsx",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(
      source,
      /integrations\/supabase|useAuth|fetch\(|localStorage|sessionStorage/,
    );
  }
  const landing = readFileSync("src/routes/index.tsx", "utf8");
  assert.match(landing, /id="imobiliarias"/);
  assert.match(landing, /search=\{\{ area: "real_estate" \}\}/);
  const component = readFileSync("src/components/real-estate/real-estate-public-demo.tsx", "utf8");
  assert.match(component, /to="\/entrar" search=\{\{ mode: "signup" \}\}/);
});
