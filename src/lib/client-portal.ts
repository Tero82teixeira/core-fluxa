export type ClientPortalInvitationStatus = "pending" | "accepted" | "expired" | "cancelled";

export function effectivePortalInvitationStatus(
  status: string,
  expiresAt: string,
  now = new Date(),
): ClientPortalInvitationStatus {
  if (status === "pending" && new Date(expiresAt).getTime() <= now.getTime()) return "expired";
  if (status === "accepted" || status === "cancelled" || status === "expired") return status;
  return "pending";
}

export function describeClientPortalError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");

  if (message.includes("PORTAL_ACCESS_ALREADY_ACTIVE"))
    return "Este e-mail já possui acesso ativo para o cliente.";
  if (message.includes("PORTAL_IDENTITY_CONFLICT"))
    return "Este e-mail já está vinculado à equipe desta empresa e não pode usar o portal.";
  if (message.includes("PORTAL_INVITE_EMAIL_MISMATCH"))
    return "Este convite pertence a outro e-mail. Entre com o endereço indicado no convite.";
  if (message.includes("PORTAL_INVITE_EXPIRED")) return "Este convite expirou.";
  if (message.includes("PORTAL_INVITE_CANCELLED")) return "Este convite foi cancelado.";
  if (message.includes("PORTAL_INVITE_ALREADY_USED")) return "Este convite já foi utilizado.";
  if (message.includes("PORTAL_INVITE_NOT_FOUND")) return "Este convite não foi encontrado.";
  if (message.includes("INVALID_EMAIL")) return "Informe um e-mail válido.";
  if (message.includes("NOT_ALLOWED") || (error as { code?: string })?.code === "42501")
    return "Somente proprietário e administrador podem gerenciar o Portal do Cliente.";
  return "Não foi possível concluir esta ação. Tente novamente.";
}
