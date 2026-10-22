import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { healthPermissionsFor } from "../src/lib/health-access.ts";
import { permissionsForRole } from "../src/lib/access-control.ts";
import {
  dateInHealthPeriod,
  summarizeHealthBillingDashboard,
} from "../src/lib/health-billing-dashboard.ts";
import { summarizeClinicDashboard } from "../src/lib/health-clinic-dashboard.ts";

const modules = [
  "health_patients",
  "health_appointments",
  "health_insurance",
  "health_authorizations",
  "health_billing",
  "health_denials",
];
const settings = { business_segment: "health", enabled_modules: modules };

test("recepção opera somente os módulos administrativos da Saúde; papéis seguem as RPCs existentes", () => {
  for (const role of [
    "superadmin",
    "proprietario",
    "administrador",
    "gestor",
    "operacional",
    "atendimento",
    "financeiro",
    "visualizador",
    "cliente_externo",
    null,
  ]) {
    const access = healthPermissionsFor(role, settings);
    assert.equal(
      access.canManagePatients,
      [
        "superadmin",
        "proprietario",
        "administrador",
        "gestor",
        "operacional",
        "atendimento",
      ].includes(role),
    );
    assert.equal(access.canManageAppointments, access.canManagePatients);
    assert.equal(access.canManageInsurers, access.canManagePatients);
    assert.equal(access.canManageAuthorizations, access.canManagePatients);
    assert.equal(
      access.canViewBilling,
      ["superadmin", "proprietario", "administrador", "gestor", "financeiro"].includes(role),
    );
    assert.equal(access.canViewDenials, access.canViewBilling);
  }
  assert.equal(permissionsForRole("atendimento").canCreate, false);
  for (const segment of ["legal", "consulting_services", "real_estate", null])
    assert(
      Object.values(
        healthPermissionsFor("proprietario", { ...settings, business_segment: segment }),
      ).every((v) => !v),
    );
  for (const enabled_modules of [[], null, "health_billing", {}])
    assert(
      Object.values(healthPermissionsFor("proprietario", { ...settings, enabled_modules })).every(
        (v) => !v,
      ),
    );
  const limited = healthPermissionsFor("proprietario", {
    ...settings,
    enabled_modules: ["health_appointments"],
  });
  assert.equal(limited.canManageAppointments, true);
  assert.equal(limited.canManageAuthorizations, false);
  assert.equal(limited.canViewBilling, false);
  assert.equal(limited.canViewDenials, false);
  // Role parity with the current database APIs, not an expansion of SQL permissions.
  for (const [file, name] of [
    ["20261017130000_health_patients_foundation.sql", "create_health_patient"],
    ["20261018170000_health_appointments.sql", "create_health_appointment"],
    ["20261018220000_health_reception_queue.sql", "update_health_appointment_reception_status"],
  ]) {
    const body = readFileSync(`supabase/migrations/${file}`, "utf8").split(
      `FUNCTION public.${name}(`,
    )[1];
    assert.match(
      body,
      /ARRAY\['superadmin','proprietario','administrador','gestor','operacional','atendimento'\]/,
    );
  }
});

test("fila ignora resultados encerrados e saldo em aberto segue a regra de Contas Médicas", () => {
  const summary = summarizeClinicDashboard({
    today: "2026-10-21",
    authorizations: [],
    denials: [],
    appointments: [
      { status: "agendado", reception_status: "chegou" },
      { status: "confirmado", reception_status: "em_atendimento" },
      { status: "concluido", reception_status: "em_atendimento" },
      { status: "cancelado", reception_status: "chegou" },
      { status: "faltou", reception_status: "chegou" },
    ],
    billingItems: [
      { status: "rascunho", amount: 1000, paid_amount: 0 },
      { status: "cancelado", amount: 500, paid_amount: 0 },
      { status: "enviado", amount: 200, paid_amount: 0 },
      { status: "parcial", amount: 100, paid_amount: 40 },
      { status: "pago", amount: 80, paid_amount: 80 },
    ],
  });
  assert.equal(summary.openBillingAmount, 260);
  assert.equal(summary.draftBillingCount, 1);
  assert.equal(summary.appointmentCounts.waiting, 1);
  assert.equal(summary.appointmentCounts.inService, 1);
  assert.equal(summary.appointmentCounts.completed, 1);
});

test("períodos financeiros incluem dias completos, timestamps, limites e ano sem datas futuras", () => {
  const today = "2026-10-21";
  assert.equal(dateInHealthPeriod("2026-10-21", "30d", today), true);
  assert.equal(dateInHealthPeriod("2026-10-21T12:00:00+00:00", "90d", today), true);
  assert.equal(dateInHealthPeriod("2026-09-22", "30d", today), true);
  assert.equal(dateInHealthPeriod("2026-09-21", "30d", today), false);
  assert.equal(dateInHealthPeriod("2026-07-24", "90d", today), true);
  assert.equal(dateInHealthPeriod("2026-07-23", "90d", today), false);
  assert.equal(dateInHealthPeriod("2026-01-01", "year", today), true);
  assert.equal(dateInHealthPeriod("2025-12-31", "year", today), false);
  for (const period of ["30d", "90d", "year"]) {
    for (const value of [null, "", "invalid", "2026-02-30", "2026-10-22"])
      assert.equal(dateInHealthPeriod(value, period, today), false);
  }
  assert.equal(dateInHealthPeriod(null, "all", today), true);
  // Reproduce the near-midnight timestamp in the browser's actual local timezone.
  const script = `import {dateInHealthPeriod} from './src/lib/health-billing-dashboard.ts';console.log(dateInHealthPeriod('2026-10-22T01:00:00Z','30d','2026-10-21'));`;
  assert.equal(
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: "America/Sao_Paulo" },
      encoding: "utf8",
    }).trim(),
    "true",
  );
  assert.equal(
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: "UTC" },
      encoding: "utf8",
    }).trim(),
    "false",
  );
});

test("painel por convênio exclui rascunhos/cancelados e mantém convênios homônimos separados", () => {
  const make = (id, extra = {}) => ({
    id,
    insurer_id: id,
    insurer_name: "Mesmo nome",
    status: "enviado",
    submitted_at: null,
    created_at: "2026-10-20T12:00:00Z",
    total_amount: 100,
    paid_amount: 20,
    pending_amount: 80,
    expected_payment_at: "2026-10-20",
    ...extra,
  });
  const summary = summarizeHealthBillingDashboard(
    [
      make("a"),
      make("b"),
      make("draft", { status: "rascunho", total_amount: 9999 }),
      make("canceled", { status: "cancelado", total_amount: 9999 }),
      make("old", { submitted_at: "2026-01-01" }),
      make("paid", { status: "pago", total_amount: 100, paid_amount: 100, pending_amount: 0 }),
    ],
    [
      { status: "aberta", received_at: "2026-10-20", denied_amount: 30, recovered_amount: 0 },
      { status: "recuperada", received_at: "2026-10-20", denied_amount: 20, recovered_amount: 20 },
      {
        status: "cancelada",
        received_at: "2026-10-20",
        denied_amount: 9999,
        recovered_amount: 9999,
      },
    ],
    "30d",
    "2026-10-21",
  );
  assert.equal(summary.billed, 300);
  assert.equal(summary.received, 140);
  assert.equal(summary.pending, 160);
  assert.equal(summary.denied, 50);
  assert.equal(summary.recovered, 20);
  assert.equal(summary.byInsurer.length, 3);
  assert.deepEqual(
    summary.overdue.map((row) => row.id),
    ["a", "b"],
  );
  assert.equal(summary.receiptRate, 140 / 300);
  const empty = summarizeHealthBillingDashboard([], [], "all", "2026-10-21");
  assert.equal(empty.receiptRate, 0);
  assert.equal(empty.denialRate, 0);
  assert.equal(empty.recoveryRate, 0);
});
