import assert from "node:assert/strict";
import test from "node:test";
import { inquiryValues, inquiryError } from "../src/lib/real-estate-inquiries.ts";
const form = {
  name: " Ana Silva ",
  phone: "(27) 99999-1234",
  purpose: "locacao",
  kind: "visita",
  preferred_day: "2026-10-20",
  preferred_period: "tarde",
  message: " Informações ",
  consent: true,
  website: "",
};
test("pedido normaliza dados de contato e exige autorização sem aceitar identificadores da empresa", () => {
  const body = inquiryValues(form);
  assert.equal(body.phone, "5527999991234");
  assert.equal(body.name, "Ana Silva");
  assert.equal(body.message, "Informações");
  for (const invalid of [
    { consent: false },
    { phone: "123" },
    { name: "a" },
    { purpose: "invalid" },
    { kind: "invalid" },
    { message: "x".repeat(501) },
    { preferred_day: "20/10/2026" },
  ])
    assert.throws(() => inquiryValues({ ...form, ...invalid }), /INQUIRY_INVALID/);
});
test("falhas de conflito, limite e disponibilidade orientam sem exibir detalhes técnicos", () => {
  for (const message of [
    "INQUIRY_CONFLICT",
    "INQUIRY_LIMIT",
    "INQUIRY_UNAVAILABLE",
    "INQUIRY_LINK_REQUIRED",
    "INQUIRY_INVALID",
  ])
    assert(inquiryError({ message }));
  assert.equal(inquiryError({ message: "sql sensitive detail" }), null);
});
