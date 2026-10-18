export type VoiceCriteria = {
  search: string;
  type: string;
  purpose: string;
  maxPrice: number | null;
};
export const normalizeVoice = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const words: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};
export function spokenPrice(value: string): number | null {
  const text = normalizeVoice(value)
    .replace(/\b(reais|real|euros|dollars|pesos)\b/g, "")
    .replace(/r\$/g, "")
    .trim();
  let number: number;
  if (/^\d[\d.,]*\s*(mil|million|milhao|milhoes)?$/.test(text)) {
    const match = text.match(/^([\d.,]+)\s*(.*)$/)!;
    let digits = match[1];
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(digits)) digits = digits.replace(/\./g, "");
    if (!/^\d+([.,]\d{1,2})?$/.test(digits)) return null;
    number =
      Number(digits.replace(",", ".")) * (match[2] === "mil" ? 1000 : match[2] ? 1_000_000 : 1);
  } else {
    let total = 0,
      group = 0;
    const tokens = text.split(/\s+/).filter((w) => w !== "e");
    if (!tokens.length) return null;
    for (const word of tokens) {
      if (word === "mil") {
        total += (group || 1) * 1000;
        group = 0;
      } else if (word === "milhao" || word === "milhoes") {
        total += (group || 1) * 1_000_000;
        group = 0;
      } else if (word in words) group += words[word];
      else return null;
    }
    number = total + group;
  }
  return Number.isFinite(number) && number > 0 && number < 1e12
    ? Math.round(number * 100) / 100
    : null;
}
export function parseVoiceCriteria(
  text: string,
  mode: "property" | "contact" = "property",
): VoiceCriteria {
  const result: VoiceCriteria = { search: "", type: "", purpose: "", maxPrice: null };
  let query = normalizeVoice(text)
    .slice(0, 300)
    .replace(/[!?;:]/g, " ")
    .replace(/\.$/, "")
    .trim();
  query = query.replace(
    /^(por favor\s+)?(procurar|procure|buscar|busque|encontrar|encontre|quero|preciso de|search for|find|buscar a)\s+/,
    "",
  );
  if (mode === "contact") {
    result.search = text
      .trim()
      .slice(0, 300)
      .replace(
        /^(por favor\s+)?(procurar|procure|buscar|busque|encontrar|encontre|quero|preciso de|search for|find)\s+/i,
        "",
      )
      .replace(
        /^(o |a |um |uma )?(cliente|clientes|interessado|interessada|customer|client|contato)\s+/i,
        "",
      )
      .trim()
      .slice(0, 100);
    return result;
  }
  const types: [string, RegExp][] = [
    ["apartamento", /\b(apartamentos?|apartments?|pisos?)\b/],
    ["casa", /\b(casas?|houses?)\b/],
    ["terreno", /\b(terrenos?|land)\b/],
    ["comercial", /\b(salas? comerciais?|sala comercial|comercial|commercial)\b/],
    ["rural", /\b(rural|rurais|sitios?|fazendas?)\b/],
  ];
  for (const [type, re] of types)
    if (re.test(query)) {
      result.type = type;
      query = query.replace(re, "");
      break;
    }
  const rent = /\b(alugar|aluguel|locacao|locar|rent|rental|alquiler|alquilar)\b/;
  const sale = /\b(comprar|compra|venda|vender|buy|sale|venta)\b/;
  result.purpose =
    rent.test(query) !== sale.test(query) ? (rent.test(query) ? "locacao" : "venda") : "";
  query = query.replace(rent, "").replace(sale, "");
  const budget = query.match(/\b(?:ate|maximo de|up to|hasta)\s+(.+)$/);
  if (budget) {
    const price = spokenPrice(budget[1].replace(/\s+(?:por mes|mensais|per month|al mes)$/, ""));
    if (price !== null) {
      result.maxPrice = price;
      query = query.slice(0, budget.index);
    }
  }
  result.search = query
    .replace(/\b(para|de|o|a|um|uma|for|the)\b/g, " ")
    .replace(/^\s*(no|na|nos|nas|em|in|en)\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return result;
}

export type SpeechResultEvent = {
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
};
export type SpeechEngine = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export type SpeechConstructor = new () => SpeechEngine;
export function speechConstructor(): SpeechConstructor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
/** Uma sessão explícita, sem persistência do áudio e sem reinício automático. */
export function startVoiceSession(
  Engine: SpeechConstructor,
  lang: string,
  callbacks: { text: (s: string) => void; error: (code: string) => void; end: () => void },
  timeout = 30_000,
) {
  const engine = new Engine();
  let active = true;
  engine.lang = lang;
  engine.continuous = false;
  engine.interimResults = false;
  engine.maxAlternatives = 1;
  const finish = () => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    engine.onresult = null;
    engine.onerror = null;
    engine.onend = null;
    callbacks.end();
  };
  const cancel = () => {
    finish();
    try {
      engine.abort();
    } catch {
      /* Já encerrado pelo navegador. */
    }
  };
  engine.onresult = (event) => {
    if (!active) return;
    const value = Array.from(event.results)
      .filter((r) => r.isFinal)
      .map((r) => r[0]?.transcript || "")
      .join(" ")
      .trim();
    if (value) callbacks.text(value.slice(0, 300));
  };
  engine.onerror = (e) => {
    if (active) callbacks.error(e.error);
    cancel();
  };
  engine.onend = finish;
  const timer = setTimeout(cancel, timeout);
  try {
    engine.start();
  } catch {
    callbacks.error("start");
    cancel();
  }
  return {
    cancel,
    stop: () => {
      if (active) {
        try {
          engine.stop();
        } catch {
          cancel();
        }
      }
    },
  };
}
