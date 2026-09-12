export type CommercialFollowUpStatus =
  "not_contacted" | "following" | "interested" | "not_interested";

export type CommercialContactChannel = "whatsapp" | "email" | "phone" | "meeting" | "other";

export const commercialFollowUpStatusLabel: Record<CommercialFollowUpStatus, string> = {
  not_contacted: "Ainda não contatado",
  following: "Em acompanhamento",
  interested: "Interessado",
  not_interested: "Não interessado",
};

export const commercialContactChannelLabel: Record<CommercialContactChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  phone: "Telefone",
  meeting: "Reunião",
  other: "Outro",
};

export function followUpDue(value: string | null, now = new Date()) {
  return Boolean(value && new Date(value).getTime() <= now.getTime());
}

export function whatsappUrl(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`;
}

export function contactStatusTone(status: CommercialFollowUpStatus) {
  if (status === "interested") return "border-success/30 bg-success/10 text-success";
  if (status === "not_interested") return "border-muted bg-muted text-muted-foreground";
  if (status === "following") return "border-info/30 bg-info/10 text-info";
  return "border-warning/30 bg-warning/10 text-warning";
}
