export type ConsultingProposalSource = {
  id: string;
  organization_id: string;
  client_id: string | null;
  converted_client_id: string | null;
  proposal_number: string;
  title: string;
  service_description: string;
  terms: string;
  status: string;
  archived_at: string | null;
};
export const consultingSourceIdValid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function consultingSourceClient(
  source: Pick<ConsultingProposalSource, "client_id" | "converted_client_id">,
) {
  return source.client_id ?? source.converted_client_id;
}
export function consultingSourceReady(
  source: ConsultingProposalSource | null | undefined,
  organizationId: string | null,
) {
  return Boolean(
    source &&
    source.organization_id === organizationId &&
    source.status === "accepted" &&
    !source.archived_at &&
    consultingSourceClient(source),
  );
}
/** Copy the approved title/scope only. No amounts, payment dates, terms or deliveries are inferred. */
export function consultingProjectFromProposal(
  source: ConsultingProposalSource,
  organizationId: string,
) {
  if (!consultingSourceReady(source, organizationId))
    throw new Error("CONSULTING_PROJECT_SOURCE_INVALID");
  return {
    client_id: consultingSourceClient(source)!,
    title: source.title.trim().slice(0, 160),
    description: source.service_description,
    source_commercial_proposal_id: source.id,
  };
}
