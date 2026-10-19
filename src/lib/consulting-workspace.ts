import { PROCESS_STAGE } from "./domain.ts";
const labels = {
  novo: ["Diagnóstico", "Diagnóstico"],
  aguardando_documentos: ["Coleta de informações", "Coleta"],
  documentos_conferencia: ["Análise inicial", "Análise"],
  montagem: ["Em execução", "Execução"],
  pronto_protocolo: ["Entrega em preparação", "Preparação"],
  protocolado: ["Entrega enviada", "Enviada"],
  em_analise: ["Validação pelo cliente", "Validação"],
  exigencia: ["Ajustes solicitados", "Ajustes"],
  deferido: ["Entrega aprovada", "Aprovada"],
  finalizado: ["Projeto concluído", "Concluído"],
  arquivado: ["Projeto arquivado", "Arquivado"],
  cancelado: ["Projeto cancelado", "Cancelado"],
} as const;
export const CONSULTING_PROCESS_STAGES = Object.fromEntries(
  Object.entries(PROCESS_STAGE).map(([key, value]) => [
    key,
    {
      ...value,
      label: labels[key as keyof typeof labels][0],
      short: labels[key as keyof typeof labels][1],
    },
  ]),
) as typeof PROCESS_STAGE;
export function processStageDefinitions(segment: string | null | undefined) {
  return segment === "consulting_services" ? CONSULTING_PROCESS_STAGES : PROCESS_STAGE;
}
export function consultingItemActive(
  item: { to: string; search?: { tipo?: string } },
  pathname: string,
  search: { tipo?: unknown },
) {
  if (pathname !== item.to && !pathname.startsWith(`${item.to}/`)) return false;
  if (item.to !== "/relatorios") return true;
  return item.search?.tipo
    ? item.search.tipo === search.tipo
    : !["commercial", "agenda"].includes(String(search.tipo));
}
