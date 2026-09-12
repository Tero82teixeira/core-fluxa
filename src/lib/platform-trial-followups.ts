export type PlatformTrialFollowupStatus =
  "not_contacted" | "following" | "interested" | "not_interested";

export type PlatformTrialFollowupFilter =
  "all" | "due" | "not_contacted" | "following" | "interested";

export type PlatformTrialFollowup = {
  organization_id: string;
  status: PlatformTrialFollowupStatus;
  next_contact_at: string | null;
  last_contact_at: string | null;
  notes: string | null;
  updated_at: string;
};

export const PLATFORM_TRIAL_FOLLOWUP_LABEL: Record<PlatformTrialFollowupStatus, string> = {
  not_contacted: "Ainda não contatado",
  following: "Em acompanhamento",
  interested: "Interessado",
  not_interested: "Não interessado",
};

export function platformTrialFollowupIsDue(
  followup: PlatformTrialFollowup | undefined,
  now = new Date(),
): boolean {
  if (!followup?.next_contact_at || followup.status === "not_interested") return false;
  return new Date(followup.next_contact_at).getTime() <= now.getTime();
}

export function matchesPlatformTrialFollowupFilter(
  followup: PlatformTrialFollowup | undefined,
  filter: PlatformTrialFollowupFilter,
  now = new Date(),
): boolean {
  if (filter === "all") return true;
  if (filter === "due") return platformTrialFollowupIsDue(followup, now);
  if (filter === "not_contacted") return !followup || followup.status === "not_contacted";
  return followup?.status === filter;
}

export function whatsappUrl(phone: string | null, message: string): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
