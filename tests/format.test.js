import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  civilDateKey,
  formatDateOnly,
  isValidCNPJ,
  isValidCPF,
  maskCNPJ,
  maskCPF,
  maskDocument,
  maskPhone,
} from "../src/lib/format.ts";

describe("civilDateKey", () => {
  test("considera a virada do dia no fuso de São Paulo", () => {
    assert.equal(civilDateKey(new Date("2026-09-07T01:30:00Z")), "2026-09-06");
    assert.equal(civilDateKey(new Date("2026-09-07T03:30:00Z")), "2026-09-07");
  });
});

describe("documentos e contatos brasileiros", () => {
  test("formata CPF, CNPJ e telefone durante a digitação", () => {
    assert.equal(maskCPF("52998224725"), "529.982.247-25");
    assert.equal(maskCNPJ("00000000000191"), "00.000.000/0001-91");
    assert.equal(maskDocument("52998224725"), "529.982.247-25");
    assert.equal(maskDocument("00000000000191"), "00.000.000/0001-91");
    assert.equal(maskPhone("28999410465"), "(28) 99941-0465");
  });

  test("valida os dígitos verificadores e rejeita sequências", () => {
    assert.equal(isValidCPF("529.982.247-25"), true);
    assert.equal(isValidCPF("529.982.247-24"), false);
    assert.equal(isValidCPF("000.000.000-00"), false);
    assert.equal(isValidCNPJ("00.000.000/0001-91"), true);
    assert.equal(isValidCNPJ("00.000.000/0001-90"), false);
    assert.equal(isValidCNPJ("11.111.111/1111-11"), false);
  });
});

describe("formatDateOnly", () => {
  test("formata YYYY-MM-DD sem conversão de fuso", () => {
    assert.equal(formatDateOnly("2026-08-18"), "18/08/2026");
  });

  test("preserva a data civil de ISO com offset UTC", () => {
    assert.equal(formatDateOnly("2026-08-18T00:00:00+00:00"), "18/08/2026");
  });

  test("preserva a data civil de ISO com sufixo Z", () => {
    assert.equal(formatDateOnly("2026-08-18T00:00:00Z"), "18/08/2026");
  });

  test("retorna travessão para valor nulo", () => {
    assert.equal(formatDateOnly(null), "—");
  });
});
