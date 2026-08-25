import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/routes/_authenticated/comunicacao.tsx", import.meta.url),
  "utf8",
);

test("explains when Contato realizado updates the client interaction", () => {
  assert.match(
    source,
    /Marque esta opção somente quando houve contato real com o cliente\./,
  );
  assert.match(
    source,
    /Observações internas não atualizam a data da última interação\./,
  );
  assert.match(source, /aria-describedby="contact-made-help"/);
});

test("confirms whether the client interaction date changed", () => {
  assert.match(
    source,
    /Contato registrado e última interação do cliente atualizada\./,
  );
  assert.match(
    source,
    /Observação registrada\. A data da última interação não foi alterada\./,
  );
  assert.match(source, /toast\.success\(contact\?/);
});
