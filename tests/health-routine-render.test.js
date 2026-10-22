import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Real pages and controls, with deterministic workspace/query boundaries; no live patient data.
globalThis.healthReact = React;
const root = resolve("src");
const baseURL = pathToFileURL(root).href;
const queryStub = `
 const query=(kind,args,enabled=true)=>{
   const s=globalThis.healthTest; s.calls.push({kind,args,enabled});
   return {data:s.data[kind]??[],isSuccess:true,isLoading:false,isError:false,refetch:()=>Promise.resolve(),...s.states[kind]};
 };
 const mutation=()=>({isPending:false,mutateAsync:()=>{throw Error('Unexpected mutation during render')}});
`;
const mocks = {
  "lib/workspace.tsx": "export function useWorkspace(){return globalThis.healthTest.workspace;}",
  "hooks/use-health-appointments.ts":
    queryStub +
    `
    export const useHealthAppointments=(org,date,enabled=true)=>query('appointments',[org,date],enabled);
    export const useHealthAppointmentsRange=(org,start,end,enabled=true)=>query('range',[org,start,end],enabled);
    export const useHealthAppointmentProfessionals=org=>query('professionals',[org]);
    export const useCreateHealthAppointment=mutation;
    export const useUpdateHealthAppointmentStatus=mutation;
    export const useUpdateHealthAppointmentReceptionStatus=mutation;
    export const useRescheduleHealthAppointment=mutation;
    export const useCompleteHealthAppointmentAndCreateBilling=mutation;
  `,
  "hooks/use-health-patients.ts":
    queryStub +
    `export const useHealthPatients=(org,search)=>query('patients',[org,search]);export const useCreateHealthPatient=mutation;`,
  "hooks/use-health-insurance.ts":
    queryStub +
    `
    export const useHealthAuthorizations=(org,search,enabled=true)=>query('authorizations',[org,search],enabled);
    export const useHealthInsurers=(org,search,enabled=true)=>query('insurers',[org,search],enabled);
    export const useCreateHealthAuthorization=mutation;export const useCreateHealthInsurer=mutation;
  `,
  "hooks/use-health-billing.ts":
    queryStub +
    `export const useHealthBillingItems=(org,search,enabled=true)=>query('billing',[org,search],enabled);`,
  "hooks/use-health-denials.ts":
    queryStub +
    `export const useHealthDenials=(org,search,enabled=true)=>query('denials',[org,search],enabled);`,
  "hooks/use-health-billing-batches.ts":
    queryStub +
    `export const useHealthBillingBatches=(org,search,enabled=true)=>query('batches',[org,search],enabled);`,
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@tanstack/react-router")
      return { url: "health-test:router", shortCircuit: true };
    let base;
    if (specifier.startsWith("@/")) base = resolve(root, specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith(baseURL))
      base = fileURLToPath(new URL(specifier, context.parentURL));
    if (base) {
      const file = [base, `${base}.ts`, `${base}.tsx`].find(
        (p) => existsSync(p) && /\.tsx?$/.test(p),
      );
      if (file) return next(pathToFileURL(file).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "health-test:router")
      return {
        format: "module",
        shortCircuit: true,
        source: `export const createFileRoute=()=>options=>({options,useSearch:()=>({date:"2026-10-21"})});export const Link=({to,search,...props})=>globalThis.healthReact.createElement('a',{...props,href:to});`,
      };
    if (url.startsWith(baseURL) && /\.tsx?$/.test(url)) {
      const path = fileURLToPath(url).slice(root.length + 1);
      const source =
        mocks[path] ??
        ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          fileName: path,
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return next(url, context);
  },
});

const allModules = [
  "health_patients",
  "health_appointments",
  "health_insurance",
  "health_authorizations",
  "health_billing",
  "health_denials",
];
function setup(role = "proprietario", modules = allModules) {
  globalThis.healthTest = {
    calls: [],
    data: {},
    states: {},
    workspace: {
      organizationId: "org-a",
      role,
      membership: {
        organizations: {
          organization_settings: { business_segment: "health", enabled_modules: modules },
        },
      },
    },
  };
  return globalThis.healthTest;
}
async function render(name) {
  const { Route } = await import(`../src/routes/_authenticated/${name}.tsx`);
  return renderToStaticMarkup(React.createElement(Route.options.component));
}
const appointment = {
  id: "a1",
  patient_profile_id: "p1",
  patient_name: "Paciente de exemplo",
  service_label: "Consulta administrativa",
  professional_name: "Profissional",
  starts_at: "2026-10-21T12:00:00Z",
  ends_at: "2026-10-21T13:00:00Z",
  appointment_date: "2026-10-21",
  status: "agendado",
  reception_status: "aguardando",
  billing_item_id: null,
};

test("recepção encontra cadastro e ações da agenda sem controles financeiros", async () => {
  const state = setup("atendimento");
  state.data.appointments = [
    appointment,
    { ...appointment, id: "a2", reception_status: "chegou", checked_in_at: "2026-10-21T12:00:00Z" },
  ];
  const patients = await render("saude.pacientes");
  assert(patients.includes("Novo paciente"));
  const agenda = await render("saude.agenda");
  for (const text of [
    "Novo atendimento",
    "Confirmar presença",
    "Registrar chegada",
    "Iniciar atendimento",
    "Reagendar",
    "Concluir sem faturar",
  ])
    assert(agenda.includes(text), text);
  assert(!agenda.includes("Concluir e faturar"));
  assert(!agenda.includes("Conta médica criada"));
  assert((await render("saude.convenios")).includes("Novo convênio"));
  assert((await render("saude.autorizacoes")).includes("Nova autorização"));
  setup("visualizador");
  assert(!(await render("saude.pacientes")).includes("Novo paciente"));
  const readonly = await render("saude.agenda");
  assert(!readonly.includes("Novo atendimento"));
  assert(!readonly.includes("Registrar chegada"));
});

test("clínica com módulos reduzidos ignora consultas desativadas e dados antigos em cache", async () => {
  const state = setup("proprietario", ["health_appointments"]);
  state.data.appointments = [appointment];
  state.data.billing = [{ status: "enviado", amount: 999999, paid_amount: 0 }];
  state.data.authorizations = [
    { patient_name: "Autorização antiga", status: "autorizado", valid_until: "2026-10-21" },
  ];
  for (const kind of ["billing", "denials", "authorizations"])
    state.states[kind] = { isError: true };
  const html = await render("saude.painel-clinica");
  assert(html.includes("Paciente de exemplo"));
  assert(!html.includes("Faturamento administrativo"));
  assert(!html.includes("Autorizações próximas"));
  assert(!html.includes("Glosas com prazo"));
  assert(!html.includes("999.999"));
  for (const kind of ["billing", "denials", "authorizations"])
    assert.equal(state.calls.find((call) => call.kind === kind).enabled, false);
});

test("falhas de autorizações/faturamento/glosas ficam na seção e preservam a agenda", async () => {
  for (const [kind, label] of [
    ["authorizations", "as autorizações"],
    ["billing", "o faturamento"],
    ["denials", "as glosas"],
  ]) {
    const state = setup();
    state.data.appointments = [appointment];
    state.states[kind] = { isError: true, isSuccess: false };
    const html = await render("saude.painel-clinica");
    assert(html.includes("Paciente de exemplo"));
    assert(html.includes(`Não foi possível carregar ${label}.`));
    assert(html.includes('role="alert"'));
    assert(html.includes("Tentar novamente"));
    if (kind === "billing") assert(!html.includes(">Em aberto<"));
  }
  const state = setup();
  state.states.appointments = { isError: true, isSuccess: false };
  state.data.billing = [{ status: "enviado", amount: 1600, paid_amount: 400 }];
  const html = await render("saude.painel-clinica");
  assert(html.includes("Não foi possível carregar a agenda."));
  assert(html.includes("Faturamento administrativo"));
  assert(html.includes("1.200,00"));
});

test("financeiro do painel respeita módulos e falhas não viram totais zero", async () => {
  const state = setup("proprietario", ["health_billing"]);
  state.data.batches = [
    {
      id: "b1",
      insurer_id: "i1",
      insurer_name: "Convênio de exemplo",
      status: "enviado",
      submitted_at: new Date().toISOString(),
      total_amount: 1600,
      paid_amount: 400,
      pending_amount: 1200,
    },
  ];
  state.states.denials = { isError: true, isSuccess: false };
  const html = await render("saude.painel-faturamento");
  assert(html.includes("1.600,00"));
  assert(html.includes("Convênio de exemplo"));
  assert(!html.includes(">Glosado<"));
  assert(!html.includes("Não foi possível carregar as glosas."));
  assert.equal(state.calls.find((call) => call.kind === "denials").enabled, false);
  state.states.batches = { isError: true, isSuccess: false };
  const error = await render("saude.painel-faturamento");
  assert(error.includes("Não foi possível carregar os lotes de faturamento."));
  assert(!error.includes(">Faturado<"));
  setup("atendimento");
  const denied = await render("saude.painel-faturamento");
  assert(denied.includes("não está disponível"));
  assert(globalThis.healthTest.calls.every((call) => !call.enabled));
});
