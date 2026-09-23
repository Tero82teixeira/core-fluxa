import type { HealthAppointment } from "@/hooks/use-health-appointments";
import type { HealthBillingItem } from "@/hooks/use-health-billing";
import type { HealthDenial } from "@/hooks/use-health-denials";
import type { HealthAuthorization } from "@/hooks/use-health-insurance";

const ACTIVE_DENIAL_STATUSES = new Set(["aberta", "em_recurso", "parcial"]);
const OPEN_BILLING_STATUSES = new Set(["rascunho", "enviado", "parcial", "glosado"]);

function civilDayDistance(today: string, target: string) {
  const start = new Date(`${today}T12:00:00Z`).getTime();
  const end = new Date(`${target}T12:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function localCivilDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function summarizeClinicDashboard({
  appointments,
  billingItems,
  authorizations,
  denials,
  today,
}: {
  appointments: HealthAppointment[];
  billingItems: HealthBillingItem[];
  authorizations: HealthAuthorization[];
  denials: HealthDenial[];
  today: string;
}) {
  const appointmentCounts = {
    total: appointments.length,
    awaitingConfirmation: appointments.filter((item) => item.status === "agendado").length,
    confirmed: appointments.filter((item) => item.status === "confirmado").length,
    waiting: appointments.filter((item) => item.reception_status === "chegou").length,
    inService: appointments.filter((item) => item.reception_status === "em_atendimento").length,
    completed: appointments.filter((item) => item.status === "concluido").length,
  };

  const openBillingItems = billingItems.filter((item) => OPEN_BILLING_STATUSES.has(item.status));
  const openBillingAmount = openBillingItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.amount || 0) - Number(item.paid_amount || 0)),
    0,
  );

  const expiringAuthorizations = authorizations
    .filter((item) => {
      if (!item.valid_until || !["pendente", "autorizado"].includes(item.status)) return false;
      const days = civilDayDistance(today, item.valid_until);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until)));

  const urgentDenials = denials
    .filter((item) => {
      if (!item.appeal_due_date || !ACTIVE_DENIAL_STATUSES.has(item.status)) return false;
      const days = civilDayDistance(today, item.appeal_due_date);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => String(a.appeal_due_date).localeCompare(String(b.appeal_due_date)));

  return {
    appointmentCounts,
    openBillingAmount,
    draftBillingCount: billingItems.filter((item) => item.status === "rascunho").length,
    expiringAuthorizations,
    urgentDenials,
  };
}
