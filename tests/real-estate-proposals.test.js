import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proposalToday,
  proposalDate,
  proposalValues,
  proposalError,
} from "../src/lib/real-estate-proposals.ts";
const base = {
  interest_id: "00000000-0000-0000-0000-000000000040",
  action: "aberta",
  amount: "240000,00",
  terms: " Entrada e financiamento ",
  valid_until: "2100-01-01",
  party: "interessado",
  note: "",
};
describe("Propostas imobiliárias", () => {
  it("normaliza reais sem aceitar valor vazio, negativo, arredondamento ou milhar ambíguo", () => {
    assert.equal(proposalValues(base).amount, 240000);
    assert.equal(proposalValues(base).terms, "Entrada e financiamento");
    for (const amount of ["", "0", "-1", "1.234,56", "12,345", "1e3", "NaN"])
      assert.throws(() => proposalValues({ ...base, amount }));
  });
  it("valida calendário e exige motivo ao encerrar", () => {
    for (const valid_until of ["2030-02-30", "2000-01-01", "abc"])
      assert.throws(() => proposalValues({ ...base, valid_until }));
    for (const action of ["aceita", "recusada", "cancelada"])
      assert.throws(() => proposalValues({ ...base, action }));
    assert.equal(
      proposalValues({
        ...base,
        action: "cancelada",
        valid_until: "2000-01-01",
        note: "Desistência",
      }).note,
      "Desistência",
    );
    assert.throws(() => proposalValues({ ...base, terms: "x".repeat(4001) }));
  });
  it("usa o dia de Brasília independente do fuso do dispositivo", () => {
    assert.equal(proposalToday(new Date("2026-10-10T01:00:00Z")), "2026-10-09");
    assert.equal(proposalDate("2026-10-09"), "09/10/2026");
  });
  it("não mostra detalhes SQL ou dados privados nos erros", () => {
    assert.match(proposalError({ message: "PROPOSAL_CONFLICT" }), /atualize/);
    assert.doesNotMatch(proposalError({ message: "secret user record" }), /secret/);
  });
});
