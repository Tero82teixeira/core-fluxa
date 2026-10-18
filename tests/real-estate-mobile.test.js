import assert from "node:assert/strict";
import test from "node:test";
import {
  mobileClientName,
  mobileContact,
  mobileDay,
  uniqueMobileClient,
} from "../src/lib/real-estate-mobile.ts";
import { buildMobileDemo } from "../src/lib/real-estate-mobile-demo.ts";
import {
  buildRealEstateDemo,
  applyRealEstateDemoAction,
} from "../src/lib/real-estate-public-demo.ts";
test("consulta direta mantém nome e contato seguro e não confunde cliente homônimo", async () => {
  assert.equal(mobileClientName("Cliente Carlos Almeida."), "Carlos Almeida");
  assert.equal(mobileClientName("Procurar cliente Márcia!"), "Márcia");
  assert.equal(mobileContact("(27) 99999-9999"), "5527999999999");
  for (const value of ["javascript:alert(1)", "(27) *****-9999", "123", null])
    assert.equal(mobileContact(value), null);
  const day = mobileDay(new Date(2026, 9, 18, 23, 59));
  assert.equal(new Date(day.start).getHours(), 0);
  assert.equal(new Date(day.end).getDate(), 19);
  const source = buildMobileDemo(buildRealEstateDemo());
  const ambiguous = await source.search("Carlos", 1);
  assert.equal(ambiguous.total, 2);
  assert.equal(uniqueMobileClient(ambiguous, 1), null);
  assert.equal(uniqueMobileClient({ ...ambiguous, items: ambiguous.items.slice(0, 1) }, 1), null);
  const unique = await source.search("Carlos Almeida", 1);
  assert.equal(unique.total, 1);
  assert.equal(uniqueMobileClient(unique, 1), unique.items[0].id);
  assert.equal(uniqueMobileClient(unique, 2), null);
  const ficha = await source.client(unique.items[0].id, 1);
  assert(ficha.items.some((x) => x.kind === "preference" && x.amount === 1800));
  assert(ficha.items.some((x) => x.kind === "interest" && x.amount === 1600));
  assert(!ficha.items.some((x) => x.kind === "contract"));
  assert.equal((await source.search("inexistente", 1)).total, 0);
});
test("demo usa vínculo explícito de proposta para mostrar contrato e acompanha alterações do cenário", async () => {
  let data = buildRealEstateDemo();
  let source = buildMobileDemo(data);
  const marina = (await source.search("Marina", 1)).items[0];
  assert(!(await source.client(marina.id, 1)).items.some((x) => x.kind === "contract"));
  data = applyRealEstateDemoAction(data, { type: "accept", id: "PROP-DEMO-001" });
  source = buildMobileDemo(data);
  assert(
    !(await source.client(marina.id, 1)).items.some((x) => x.kind === "contract"),
    "aceite sozinho não é contrato",
  );
  data = applyRealEstateDemoAction(data, { type: "contract", id: "PROP-DEMO-001" });
  source = buildMobileDemo(data);
  assert((await source.client(marina.id, 1)).items.some((x) => x.kind === "contract"));
});
