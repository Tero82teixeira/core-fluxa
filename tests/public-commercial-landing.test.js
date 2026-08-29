import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync("src/routes/index.tsx", "utf8");
const auth = readFileSync("src/routes/entrar.tsx", "utf8");
const root = readFileSync("src/routes/__root.tsx", "utf8");

test("rota principal apresenta a FLUXA em vez de redirecionar", () => {
  assert.doesNotMatch(landing, /throw redirect/);
  assert.match(landing, /component: CommercialLanding/);
  assert.match(landing, /Sua operação inteira/);
  assert.match(landing, /Gestão empresarial em um único fluxo/);
});

test("página comercial explica produto, público, funcionamento e segurança", () => {
  for (const section of ["recursos", "como-funciona", "para-quem", "seguranca"]) {
    assert.match(landing, new RegExp(`id="${section}"`));
  }
  for (const feature of [
    "Central de Comando",
    "Clientes",
    "Processos",
    "Documentos",
    "Tarefas",
    "Comunicação",
    "Financeiro",
    "Automações",
  ]) {
    assert.ok(landing.includes(`title: "${feature}"`), feature);
  }
  assert.match(landing, /Isolamento por empresa/);
  assert.match(landing, /Papéis e permissões/);
  assert.match(landing, /Auditoria/);
});

test("CTAs comerciais abrem diretamente o cadastro do teste", () => {
  assert.match(landing, /search=\{\{ mode: "signup" \}\}/);
  assert.match(landing, /14 dias grátis/);
  assert.match(landing, /Sem cartão/);
  assert.match(auth, /validateSearch/);
  assert.match(auth, /search\.mode === "signup"/);
  assert.match(auth, /useState<AuthMode>\(search\.mode \?\? "login"\)/);
});

test("metadados globais não expõem a marca da ferramenta de desenvolvimento", () => {
  assert.doesNotMatch(root, /Lovable App|Lovable Generated Project|@Lovable/);
  assert.match(root, /FLUXA — Gestão empresarial/);
});

test("landing é responsiva e não depende de depoimentos ou números inventados", () => {
  assert.match(landing, /sm:grid-cols-2/);
  assert.match(landing, /lg:grid-cols-4/);
  assert.doesNotMatch(landing, /depoimento|clientes satisfeitos|empresas atendidas/i);
});
