import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  commissionBreakdown,
  settlementValues,
  canWriteSettlements,
  settlementError,
} from "../src/lib/real-estate-settlements.ts";
const form = {
  reference: " 2026-10 ",
  gross: "1500,00",
  commission_type: "percentual",
  commission_value: "10,00",
  due_on: "2026-10-20",
  occurred_on: "2026-10-13",
  note: " Teste ",
};
const option = { purpose: "locacao", starts_on: "2026-10-13", ends_on: "2028-10-13" };
describe("Comissões e repasses", () => {
  it("calcula percentual e valor fixo em centavos, com arredondamento consistente", () => {
    assert.deepEqual(commissionBreakdown(1500, "percentual", 10), { commission: 150, owner: 1350 });
    assert.deepEqual(commissionBreakdown(0.05, "percentual", 10), {
      commission: 0.01,
      owner: 0.04,
    });
    assert.deepEqual(commissionBreakdown(1500, "fixa", 200), { commission: 200, owner: 1300 });
    assert.deepEqual(commissionBreakdown(1500, "percentual", 0), { commission: 0, owner: 1500 });
    assert.deepEqual(commissionBreakdown(1500, "percentual", 100), { commission: 1500, owner: 0 });
    for (const [type, value] of [
      ["percentual", 101],
      ["fixa", 1501],
      ["fixa", -1],
    ])
      assert.throws(() => commissionBreakdown(1500, type, value));
  });
  it("valida campos, competência e calendário sem registrar operação futura", () => {
    assert.equal(settlementValues(form, "criado", "owner", option).reference, "2026-10");
    assert.equal(
      settlementValues({ ...form, commission_value: "0" }, "criado", "owner", option)
        .commission_value,
      0,
    );
    for (const patch of [
      { gross: "0" },
      { gross: "1.500,00" },
      { commission_value: "10,123" },
      { reference: "2026-09" },
      { reference: "2026-13" },
      { note: "" },
      { due_on: "2026-02-30" },
    ])
      assert.throws(() => settlementValues({ ...form, ...patch }, "criado", "owner", option));
    assert.throws(() =>
      settlementValues({ ...form, occurred_on: "2100-01-01" }, "recebido", "owner"),
    );
  });
  it("restringe escrita aos perfis financeiros e administrativos", () => {
    for (const role of ["superadmin", "proprietario", "administrador", "gestor", "financeiro"])
      assert.equal(canWriteSettlements(role), true);
    for (const role of ["operacional", "visualizador", "atendimento", "cliente_externo", null])
      assert.equal(canWriteSettlements(role), false);
  });
  it("explica duplicações e conflitos sem expor mensagens privadas", () => {
    assert.match(settlementError({ message: "SETTLEMENT_DUPLICATE" }), /Já existe/);
    assert.match(settlementError({ message: "SETTLEMENT_CONFLICT" }), /Atualize/);
    assert.doesNotMatch(settlementError({ message: "secret credential" }), /secret|credential/);
  });
});
