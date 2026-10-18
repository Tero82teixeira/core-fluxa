import assert from "node:assert/strict";
import test from "node:test";
import {
  parseVoiceCriteria,
  spokenPrice,
  startVoiceSession,
  speechConstructor,
} from "../src/lib/real-estate-voice.ts";
import {
  emptyBusinessProfile,
  profileValues,
  businessWhatsapp,
} from "../src/lib/real-estate-profile.ts";
test("fala gera filtros revisáveis de compra, locação e nome, inclusive valores por extenso", () => {
  assert.deepEqual(
    parseVoiceCriteria("Apartamentos para alugar no Centro até mil e seiscentos reais"),
    { type: "apartamento", purpose: "locacao", search: "centro", maxPrice: 1600 },
  );
  assert.deepEqual(parseVoiceCriteria("Procurar casa para comprar em Jardins até 650 mil"), {
    type: "casa",
    purpose: "venda",
    search: "jardins",
    maxPrice: 650000,
  });
  assert.deepEqual(parseVoiceCriteria("apartments for rent in Centro up to 1600"), {
    type: "apartamento",
    purpose: "locacao",
    search: "centro",
    maxPrice: 1600,
  });
  assert.equal(parseVoiceCriteria("Procurar cliente Márcia", "contact").search, "Márcia");
  assert.equal(
    parseVoiceCriteria("Buscar o cliente Carlos Prado", "contact").search,
    "Carlos Prado",
  );
  assert.equal(parseVoiceCriteria("casa para comprar ou alugar até 1600").purpose, "");
  assert.equal(parseVoiceCriteria("apartamento até preço a combinar").maxPrice, null);
  assert.equal(parseVoiceCriteria("x".repeat(400)).search.length, 100);
  for (const [text, value] of [
    ["1.600,50 reais", 1600.5],
    ["650000", 650000],
    ["mil e seiscentos", 1600],
    ["quinhentos mil", 500000],
    ["1,5 mil", 1500],
    ["", null],
    ["0", null],
    ["Infinity", null],
    ["-30", null],
    ["1e12", null],
    ["1000000000000", null],
    ["um milhão e dois", 1000002],
  ])
    assert.equal(spokenPrice(text), value, text);
});
class FakeSpeech {
  static last;
  constructor() {
    FakeSpeech.last = this;
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
}
test("sessão recebe apenas resultados finais e cancela callbacks após fechar", () => {
  const texts = [],
    errors = [];
  let ended = 0;
  const s = startVoiceSession(FakeSpeech, "pt-BR", {
    text: (v) => texts.push(v),
    error: (e) => errors.push(e),
    end: () => ended++,
  });
  const engine = FakeSpeech.last;
  assert.equal(engine.lang, "pt-BR");
  assert.equal(engine.continuous, false);
  engine.onresult({
    results: [
      { isFinal: false, 0: { transcript: "ignorar" } },
      { isFinal: true, 0: { transcript: "Centro" } },
    ],
  });
  const stale = engine.onresult;
  s.cancel();
  stale({ results: [{ isFinal: true, 0: { transcript: "não aplicar" } }] });
  assert.deepEqual(texts, ["Centro"]);
  assert.deepEqual(errors, []);
  assert.equal(ended, 1);
  assert.equal(engine.aborted, true);
  assert.equal(engine.onresult, null);
});
test("permissão negada, exceção inicial, fim e timeout liberam a sessão sem reinício", async () => {
  let error = "",
    ends = 0;
  const callbacks = { text: () => {}, error: (e) => (error = e), end: () => ends++ };
  startVoiceSession(FakeSpeech, "pt-BR", callbacks);
  FakeSpeech.last.onerror({ error: "not-allowed" });
  assert.equal(error, "not-allowed");
  assert.equal(ends, 1);
  class Broken extends FakeSpeech {
    start() {
      throw Error();
    }
  }
  startVoiceSession(Broken, "pt-BR", callbacks);
  assert.equal(error, "start");
  assert.equal(ends, 2);
  const s = startVoiceSession(FakeSpeech, "en-US", callbacks);
  s.stop();
  assert.equal(ends, 3);
  startVoiceSession(FakeSpeech, "pt-BR", callbacks, 5);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ends, 4);
  assert.equal(FakeSpeech.last.aborted, true);
  assert.equal(speechConstructor(), null);
});
test("perfil publica somente dados explícitos e WhatsApp mantém o destino comercial", () => {
  const p = {
    ...emptyBusinessProfile(),
    agent_name: " Corretor Exemplo ",
    agent_creci: " 123/ES ",
    logo_url: "https://signed.invalid",
    private_note: "não incluir",
  };
  const values = profileValues(p);
  assert.equal(values.agent_name, "Corretor Exemplo");
  assert(!("private_note" in values));
  assert(!("logo_url" in values));
  assert.throws(() => profileValues({ ...p, agent_name: "", agent_photo_path: "org/photo.webp" }));
  assert.throws(() => profileValues({ ...p, bio: "x".repeat(501) }));
  const link = new URL(
    businessWhatsapp("27 99999-9999", "https://example.com/imoveis/token?imoveis=abc"),
  );
  assert.equal(link.host, "wa.me");
  assert.equal(link.pathname, "/5527999999999");
  assert(link.searchParams.get("text").includes("?imoveis=abc"));
  assert.throws(() => businessWhatsapp("javascript:alert(1)", ""));
});
