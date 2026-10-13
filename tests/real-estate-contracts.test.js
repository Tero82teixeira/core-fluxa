import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contractValues, contractError } from "../src/lib/real-estate-contracts.ts";
const base = {
  reference: " CT-001 ",
  amount: "1500,00",
  terms: " Aluguel mensal ",
  starts_on: "2026-10-13",
  ends_on: "2100-01-01",
  note: " Contrato conferido ",
};
describe("Contratos imobiliários", () => {
  it("normaliza os campos e preserva centavos", () => {
    assert.equal(contractValues(base, "criado", "locacao").amount, 1500);
    assert.equal(contractValues(base, "criado", "locacao").reference, "CT-001");
    assert.equal(contractValues(base, "criado", "locacao").terms, "Aluguel mensal");
  });
  it("não aceita datas impossíveis, ausência de término da locação ou motivo vazio", () => {
    for (const patch of [
      { ends_on: "" },
      { starts_on: "2026-02-30" },
      { ends_on: "2026-01-01" },
      { note: " " },
      { amount: "1500,123" },
      { reference: "" },
      { reference: "x".repeat(61) },
    ])
      assert.throws(() => contractValues({ ...base, ...patch }, "criado", "locacao"));
    assert.equal(contractValues({ ...base, ends_on: "" }, "criado", "venda").ends_on, null);
  });
  it("renova somente locação, mantendo início e ampliando o prazo", () => {
    const previous = { ...base, starts_on: "2026-10-13", ends_on: "2099-01-01" };
    assert.equal(contractValues(base, "renovado", "locacao", previous).ends_on, "2100-01-01");
    assert.throws(() => contractValues(base, "renovado", "venda", previous));
    assert.throws(() =>
      contractValues({ ...base, ends_on: previous.ends_on }, "renovado", "locacao", previous),
    );
    assert.throws(() =>
      contractValues({ ...base, starts_on: "2026-10-14" }, "renovado", "locacao", previous),
    );
  });
  it("apresenta conflitos e não expõe mensagens privadas", () => {
    assert.match(contractError({ message: "CONTRACT_CONFLICT" }), /Atualize/);
    assert.match(contractError({ message: "CONTRACT_ACTIVE_PROPOSAL" }), /contrato/);
    assert.doesNotMatch(contractError({ message: "private secret" }), /private|secret/);
  });
});
