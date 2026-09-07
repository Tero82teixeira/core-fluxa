import type { CommunicationQuickReply } from "@/hooks/use-quick-replies";

export const activeQuickReplies = (replies: readonly CommunicationQuickReply[]) =>
  replies.filter((reply) => reply.is_active);

/** Preserva o texto já digitado e acrescenta o modelo escolhido para revisão humana. */
export function applyQuickReply(current: string, template: string) {
  const clean = template.trim();
  if (!current.trim()) return clean;
  return `${current.trimEnd()}\n\n${clean}`;
}

export function validateQuickReply(input: { title: string; content: string; category: string }) {
  if (input.title.trim().length < 2) return "Informe um título com pelo menos 2 caracteres.";
  if (input.title.trim().length > 80) return "O título pode ter no máximo 80 caracteres.";
  if (input.content.trim().length < 2) return "Informe o conteúdo da resposta.";
  if (input.content.trim().length > 2000) return "A resposta pode ter no máximo 2.000 caracteres.";
  if (input.category.trim().length < 2) return "Informe uma categoria com pelo menos 2 caracteres.";
  if (input.category.trim().length > 40) return "A categoria pode ter no máximo 40 caracteres.";
  return null;
}
