import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  interestSchema,
  visitSchema,
  localVisitDate,
  toLocalVisitDate,
  activityError,
} from "../src/lib/real-estate-activity.ts";
const id = "00000000-0000-0000-0000-000000000001";
describe("Interessados e visitas", () => {
  it("valida cliente, finalidade e notas sem aceitar vínculos vazios", () => {
    const base = {
      property_id: id,
      client_id: id,
      purpose: "venda",
      status: "novo",
      responsible_user_id: "",
      notes: " Teste ",
    };
    assert.equal(interestSchema.parse(base).notes, "Teste");
    assert.equal(interestSchema.parse(base).responsible_user_id, null);
    for (const patch of [{ client_id: "" }, { purpose: "outro" }, { notes: "x".repeat(4001) }])
      assert.equal(interestSchema.safeParse({ ...base, ...patch }).success, false);
  });
  it("mantém horário local ao converter para UTC e rejeita datas inválidas", () => {
    const value = "2026-10-10T14:30";
    assert.equal(toLocalVisitDate(localVisitDate(value)), value);
    for (const value of [
      "",
      "2026-02-30T14:30",
      "2026-13-01T14:30",
      "2026-10-10T25:00",
      "2026-10-10",
    ])
      assert.throws(() => localVisitDate(value));
  });
  it("exige duração limitada, responsável e resultado ao finalizar", () => {
    const base = {
      property_id: id,
      interest_id: id,
      responsible_user_id: id,
      starts_at: "2026-10-10T14:00:00.000Z",
      ends_at: "2026-10-10T15:00:00.000Z",
      status: "agendada",
      notes: "",
      outcome: "",
    };
    assert.equal(visitSchema.safeParse(base).success, true);
    for (const patch of [
      { responsible_user_id: "" },
      { ends_at: base.starts_at },
      { ends_at: "2026-10-10T20:00:00.000Z" },
      { status: "cancelada" },
      { status: "realizada" },
      { status: "nao_compareceu" },
    ])
      assert.equal(visitSchema.safeParse({ ...base, ...patch }).success, false);
    assert.equal(
      visitSchema.safeParse({ ...base, status: "cancelada", outcome: "Cliente solicitou" }).success,
      true,
    );
  });
  it("explica conflitos e impede mensagens técnicas ou dados de terceiros na interface", () => {
    assert.match(activityError({ message: "REAL_ESTATE_VISIT_OVERLAP" }), /responsável/);
    assert.match(activityError({ message: "REAL_ESTATE_CONFLICT" }), /Atualize/);
    assert.match(activityError({ code: "23505" }), /já tem interesse/);
    assert.equal(activityError({ message: "senha privada" }).includes("senha privada"), false);
  });
});
