import { validConsultingDate } from "./consulting-project.ts";
export const CONSULTING_PROPOSAL_FREQUENCIES = ["once", "monthly", "quarterly", "yearly"] as const;
export type ConsultingProposalDraft = {
  title: string;
  serviceDescription: string;
  terms: string;
  amount: string;
  billingFrequency: (typeof CONSULTING_PROPOSAL_FREQUENCIES)[number];
  firstDueDate: string;
  validUntil: string;
};
/** Only the expected outcome crosses from the internal assessment into the proposal. */
export function proposalFromConsultingDiagnostic(
  expectedResult: string,
  title: string,
): ConsultingProposalDraft {
  if (expectedResult.trim().length < 3 || expectedResult.length > 2000)
    throw new Error("CONSULTING_PROPOSAL_INVALID");
  return {
    title,
    serviceDescription: expectedResult.trim(),
    terms: "",
    amount: "",
    billingFrequency: "once",
    firstDueDate: "",
    validUntil: "",
  };
}
export function consultingProposalAmount(value: string) {
  const text = value.trim();
  if (!/^(0|[1-9][0-9]{0,11})([,.][0-9]{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents >= 1 && cents <= 99999999999999 ? cents / 100 : null;
}
export function consultingProposalDraftValid(v: ConsultingProposalDraft, today: string) {
  return (
    v.title.trim().length >= 3 &&
    v.title.length <= 180 &&
    v.serviceDescription.trim().length >= 3 &&
    v.serviceDescription.length <= 2000 &&
    v.terms.trim().length >= 3 &&
    v.terms.length <= 4000 &&
    consultingProposalAmount(v.amount) !== null &&
    CONSULTING_PROPOSAL_FREQUENCIES.includes(v.billingFrequency) &&
    [today, v.firstDueDate, v.validUntil].every(
      (d) => Boolean(d) && validConsultingDate(d) && d >= "2000-01-01" && d <= "2100-12-31",
    ) &&
    v.firstDueDate >= today &&
    v.validUntil >= today
  );
}
/** Existing save_commercial_proposal contract. No token publication, automation or internal fields. */
export function consultingProposalInput(
  v: ConsultingProposalDraft,
  client: { id: string; name: string },
  today: string,
) {
  if (
    !client.id ||
    client.name.trim().length < 2 ||
    client.name.length > 160 ||
    !consultingProposalDraftValid(v, today)
  )
    throw new Error("CONSULTING_PROPOSAL_INVALID");
  return {
    clientId: client.id,
    customerName: client.name.trim(),
    opportunityId: null,
    title: v.title.trim(),
    serviceDescription: v.serviceDescription.trim(),
    terms: v.terms.trim(),
    amount: consultingProposalAmount(v.amount)!,
    billingFrequency: v.billingFrequency,
    firstDueDate: v.firstDueDate,
    validUntil: v.validUntil,
    asaasAutoCharge: false,
  };
}
