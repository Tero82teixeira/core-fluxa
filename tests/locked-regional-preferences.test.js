import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const settingsPath = new URL("../src/routes/_authenticated/configuracoes.tsx", import.meta.url);

describe("preferências regionais protegidas", () => {
  test("exibe os padrões regionais somente para leitura", async () => {
    const settings = await readFile(settingsPath, "utf8");

    assert.match(settings, /padrões protegidos da FLUXA/);
    for (const label of ["Fuso horário", "Idioma", "Formato de data", "Moeda"]) {
      assert.match(settings, new RegExp(`label="${label}"[\\s\\S]{0,100}readOnly`));
    }
    assert.match(settings, /label="Moeda padrão"[\s\S]{0,100}readOnly/);
  });

  test("não envia os padrões protegidos ao salvar outras configurações", async () => {
    const settings = await readFile(settingsPath, "utf8");

    assert.match(
      settings,
      /LOCKED_REGIONAL_KEYS = \["timezone", "locale", "date_format", "currency"\]/,
    );
    assert.match(settings, /for \(const key of LOCKED_REGIONAL_KEYS\) delete payload\[key\]/);
  });

  test("mantém expediente e início da semana configuráveis por papel autorizado", async () => {
    const settings = await readFile(settingsPath, "utf8");

    for (const label of [
      "Primeiro dia da semana (0–6)",
      "Início do expediente",
      "Fim do expediente",
    ]) {
      const start = settings.indexOf(`label="${label}"`);
      assert.notEqual(start, -1);
      const field = settings.slice(start, start + 240);
      assert.match(field, /disabled=\{!canEdit\}/);
      assert.match(field, /onChange=/);
      assert.doesNotMatch(field, /readOnly/);
    }
  });
});
