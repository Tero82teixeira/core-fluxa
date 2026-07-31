/**
 * Fonte única de dados demonstrativos da FLUXA.
 * TODO(supabase): quando DEMO_MODE for false, estes dados são substituídos
 * pelas consultas reais em src/hooks/use-operations.ts. Nada aqui é persistido.
 */
import type { ClientRow, MovementRow, NotificationRow, ProcessRow, TaskRow } from "@/hooks/use-operations";
import type { ClientStatus, FinancialStatus, PriorityLevel, ProcessStage, TaskStatus } from "@/lib/domain";

export const DEMO_ORG_ID = "demo-org";
export const DEMO_ORG_NAME = "Vértice Consultoria Regulatória";

const now = new Date();
const iso = (offsetDays: number, hour = 9, minute = 0) => {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const day = (offsetDays: number) => iso(offsetDays, 12).slice(0, 10);

export type TeamMember = { id: string; name: string; role: string; email: string };

export const DEMO_TEAM: TeamMember[] = [
  { id: "u1", name: "Ronaldo Prado", role: "Proprietário", email: "ronaldo@vertice.com.br" },
  { id: "u2", name: "Marina Alves", role: "Gestora de operação", email: "marina@vertice.com.br" },
  { id: "u3", name: "Tiago Ferreira", role: "Analista de processos", email: "tiago@vertice.com.br" },
  { id: "u4", name: "Camila Rocha", role: "Atendimento", email: "camila@vertice.com.br" },
  { id: "u5", name: "Bruno Nakamura", role: "Financeiro", email: "bruno@vertice.com.br" },
];

export const DEMO_USER = DEMO_TEAM[0];

export type ServiceType = { id: string; name: string; averageDays: number };

export const DEMO_SERVICE_TYPES: ServiceType[] = [
  { id: "s1", name: "Licenciamento ambiental", averageDays: 60 },
  { id: "s2", name: "Registro de marca", averageDays: 120 },
  { id: "s3", name: "Alvará de funcionamento", averageDays: 30 },
  { id: "s4", name: "Regularização sanitária", averageDays: 45 },
  { id: "s5", name: "Abertura de empresa", averageDays: 15 },
  { id: "s6", name: "Certidões e regularidade fiscal", averageDays: 10 },
];

type ClientSeed = {
  id: string;
  name: string;
  trade?: string;
  type: "pf" | "pj";
  document: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  status: ClientStatus;
  owner: string;
  lastInteraction: number;
  notes: string;
};

const clientSeeds: ClientSeed[] = [
  { id: "c01", name: "Amanda Ribeiro Castro", type: "pf", document: "39053344705", email: "amanda.castro@email.com", phone: "11987450321", city: "São Paulo", state: "SP", status: "ativo", owner: "Marina Alves", lastInteraction: -1, notes: "Cliente recorrente desde 2023." },
  { id: "c02", name: "Nordeste Alimentos Ltda", trade: "Sabor do Vale", type: "pj", document: "19131243000197", email: "contato@sabordovale.com.br", phone: "8532117744", city: "Fortaleza", state: "CE", status: "ativo", owner: "Tiago Ferreira", lastInteraction: -3, notes: "Duas unidades em processo de licenciamento." },
  { id: "c03", name: "Carlos Eduardo Menezes", type: "pf", document: "12345678909", email: "cadu.menezes@email.com", phone: "21996640012", city: "Niterói", state: "RJ", status: "com_pendencia", owner: "Camila Rocha", lastInteraction: -6, notes: "Aguardando envio de comprovante de residência." },
  { id: "c04", name: "Construtora Horizonte Sul S.A.", trade: "Horizonte Sul", type: "pj", document: "11444777000161", email: "juridico@horizontesul.com.br", phone: "5133224411", city: "Porto Alegre", state: "RS", status: "ativo", owner: "Marina Alves", lastInteraction: 0, notes: "Contrato anual de assessoria." },
  { id: "c05", name: "Juliana Prado Barbosa", type: "pf", document: "98765432100", email: "juliana.barbosa@email.com", phone: "31988112255", city: "Belo Horizonte", state: "MG", status: "aguardando" as ClientStatus, owner: "Camila Rocha", lastInteraction: -5, notes: "Aguardando retorno sobre proposta enviada." },
  { id: "c06", name: "Farmácia Vida Plena Ltda", trade: "Vida Plena", type: "pj", document: "27865757000102", email: "adm@vidaplena.com.br", phone: "6232419988", city: "Goiânia", state: "GO", status: "com_pendencia", owner: "Tiago Ferreira", lastInteraction: -8, notes: "Exigência sanitária em aberto." },
  { id: "c07", name: "Marcos Vinícius Tavares", type: "pf", document: "45678912300", email: "marcos.tavares@email.com", phone: "4199887766", city: "Curitiba", state: "PR", status: "lead", owner: "Camila Rocha", lastInteraction: -2, notes: "Indicação de cliente ativo." },
  { id: "c08", name: "Transportes Serra Azul Ltda", trade: "Serra Azul", type: "pj", document: "34028316000103", email: "operacoes@serraazul.com.br", phone: "1633445566", city: "Ribeirão Preto", state: "SP", status: "ativo", owner: "Marina Alves", lastInteraction: -4, notes: "Frota com 42 veículos." },
  { id: "c09", name: "Patrícia Nogueira Lima", type: "pf", document: "32165498700", email: "patricia.lima@email.com", phone: "8199442211", city: "Recife", state: "PE", status: "inativo", owner: "Tiago Ferreira", lastInteraction: -95, notes: "Sem contratação nos últimos 6 meses." },
  { id: "c10", name: "Clínica Bem Viver S/S", trade: "Bem Viver", type: "pj", document: "05570714000159", email: "financeiro@bemviver.med.br", phone: "4832225533", city: "Florianópolis", state: "SC", status: "ativo", owner: "Camila Rocha", lastInteraction: -1, notes: "Renovação de alvará em andamento." },
  { id: "c11", name: "Rafael Souza Andrade", type: "pf", document: "15975368200", email: "rafael.andrade@email.com", phone: "7199336644", city: "Salvador", state: "BA", status: "em_cadastro", owner: "Camila Rocha", lastInteraction: -1, notes: "Cadastro iniciado pelo site." },
  { id: "c12", name: "AgroTech Cerrado Ltda", trade: "AgroTech", type: "pj", document: "60746948000112", email: "contato@agrotechcerrado.com.br", phone: "6534221100", city: "Campo Grande", state: "MS", status: "ativo", owner: "Tiago Ferreira", lastInteraction: -2, notes: "Licença de operação rural." },
  { id: "c13", name: "Beatriz Carvalho Nunes", type: "pf", document: "75395182600", email: "beatriz.nunes@email.com", phone: "6198774455", city: "Brasília", state: "DF", status: "aguardando" as ClientStatus, owner: "Marina Alves", lastInteraction: -7, notes: "Aguardando assinatura de procuração." },
  { id: "c14", name: "Metalúrgica Ponta Norte Ltda", trade: "Ponta Norte", type: "pj", document: "07526557000100", email: "qualidade@pontanorte.ind.br", phone: "9132114455", city: "Belém", state: "PA", status: "com_pendencia", owner: "Marina Alves", lastInteraction: -11, notes: "Pendência documental há 11 dias." },
  { id: "c15", name: "Eduarda Martins Pires", type: "pf", document: "85274196300", email: "eduarda.pires@email.com", phone: "2799885511", city: "Vitória", state: "ES", status: "arquivado", owner: "Tiago Ferreira", lastInteraction: -180, notes: "Processo concluído e conta arquivada." },
];

/** "aguardando" não existe no enum oficial — normalizado para com_pendencia com marcador. */
const normalizeStatus = (status: ClientStatus | string): ClientStatus =>
  status === "aguardando" ? "com_pendencia" : (status as ClientStatus);

export type DemoClient = ClientRow & {
  awaitingReturn: boolean;
  contracted: number;
  balance: number;
  notes: string;
};

export const DEMO_CLIENTS: DemoClient[] = clientSeeds.map((seed, index) => ({
  id: seed.id,
  organization_id: DEMO_ORG_ID,
  person_type: seed.type,
  name: seed.name,
  trade_name: seed.trade ?? null,
  document: seed.document,
  document_digits: seed.document,
  email: seed.email,
  phone: seed.phone,
  whatsapp: seed.phone,
  city: seed.city,
  state: seed.state,
  status: normalizeStatus(seed.status),
  owner_name: seed.owner,
  notes: seed.notes,
  last_interaction_at: iso(seed.lastInteraction, 10 + (index % 8)),
  archived_at: seed.status === "arquivado" ? iso(-180) : null,
  created_at: iso(-200 + index * 7),
  awaitingReturn: (seed.status as string) === "aguardando",
  contracted: 2500 + index * 1450,
  balance: index % 3 === 0 ? 0 : 800 + index * 210,
}));

type ProcessSeed = {
  id: string;
  code: string;
  clientId: string;
  service: string;
  stage: ProcessStage;
  priority: PriorityLevel;
  owner: string;
  due: number | null;
  opened: number;
  lastMovement: number;
  protocol: string | null;
  docsTotal: number;
  docsReceived: number;
  value: number;
  financial: FinancialStatus;
  description: string;
  nextAction: string;
};

const processSeeds: ProcessSeed[] = [
  { id: "p01", code: "PRC-2401", clientId: "c04", service: "s1", stage: "novo", priority: "media", owner: "Marina Alves", due: 22, opened: -2, lastMovement: -1, protocol: null, docsTotal: 8, docsReceived: 1, value: 18500, financial: "pendente", description: "Licença prévia para novo empreendimento residencial na zona sul.", nextAction: "Solicitar memorial descritivo ao cliente." },
  { id: "p02", code: "PRC-2402", clientId: "c02", service: "s4", stage: "aguardando_documentos", priority: "alta", owner: "Tiago Ferreira", due: 4, opened: -12, lastMovement: -3, protocol: null, docsTotal: 10, docsReceived: 4, value: 9800, financial: "parcial", description: "Regularização sanitária da unidade de produção de laticínios.", nextAction: "Cobrar laudo técnico e planta baixa." },
  { id: "p03", code: "PRC-2403", clientId: "c06", service: "s4", stage: "exigencia", priority: "critica", owner: "Tiago Ferreira", due: -3, opened: -48, lastMovement: -8, protocol: "SIS-88214/2025", docsTotal: 12, docsReceived: 10, value: 14200, financial: "atrasado", description: "Exigência sanitária referente à área de manipulação.", nextAction: "Protocolar resposta à exigência com laudo corrigido." },
  { id: "p04", code: "PRC-2404", clientId: "c10", service: "s3", stage: "documentos_conferencia", priority: "alta", owner: "Camila Rocha", due: 2, opened: -20, lastMovement: 0, protocol: null, docsTotal: 7, docsReceived: 7, value: 6400, financial: "pago", description: "Renovação de alvará de funcionamento da clínica.", nextAction: "Concluir conferência documental e liberar montagem." },
  { id: "p05", code: "PRC-2405", clientId: "c08", service: "s6", stage: "montagem", priority: "media", owner: "Marina Alves", due: 9, opened: -25, lastMovement: -2, protocol: null, docsTotal: 6, docsReceived: 6, value: 3200, financial: "pago", description: "Emissão de certidões de regularidade fiscal da frota.", nextAction: "Montar dossiê e revisar certidões estaduais." },
  { id: "p06", code: "PRC-2406", clientId: "c12", service: "s1", stage: "pronto_protocolo", priority: "alta", owner: "Tiago Ferreira", due: 1, opened: -40, lastMovement: -1, protocol: null, docsTotal: 11, docsReceived: 11, value: 22800, financial: "parcial", description: "Licença de operação para unidade de armazenagem de grãos.", nextAction: "Protocolar no órgão ambiental estadual." },
  { id: "p07", code: "PRC-2407", clientId: "c04", service: "s2", stage: "protocolado", priority: "media", owner: "Marina Alves", due: 35, opened: -60, lastMovement: -9, protocol: "INPI-925.441.882", docsTotal: 5, docsReceived: 5, value: 4700, financial: "pago", description: "Registro de marca nominativa Horizonte Sul.", nextAction: "Acompanhar publicação na RPI." },
  { id: "p08", code: "PRC-2408", clientId: "c02", service: "s2", stage: "em_analise", priority: "baixa", owner: "Tiago Ferreira", due: 48, opened: -80, lastMovement: -21, protocol: "INPI-925.117.043", docsTotal: 5, docsReceived: 5, value: 4700, financial: "pago", description: "Registro de marca mista Sabor do Vale.", nextAction: "Aguardar exame de mérito." },
  { id: "p09", code: "PRC-2409", clientId: "c14", service: "s3", stage: "aguardando_documentos", priority: "critica", owner: "Marina Alves", due: -6, opened: -35, lastMovement: -11, protocol: null, docsTotal: 9, docsReceived: 3, value: 11300, financial: "atrasado", description: "Alvará de funcionamento da nova planta industrial.", nextAction: "Escalar cobrança de documentos ao responsável." },
  { id: "p10", code: "PRC-2410", clientId: "c01", service: "s5", stage: "finalizado", priority: "baixa", owner: "Camila Rocha", due: -12, opened: -70, lastMovement: -12, protocol: "JUCESP-3.442.118", docsTotal: 6, docsReceived: 6, value: 2900, financial: "pago", description: "Abertura de empresa individual de consultoria.", nextAction: "Nenhuma ação pendente." },
  { id: "p11", code: "PRC-2411", clientId: "c03", service: "s6", stage: "aguardando_documentos", priority: "alta", owner: "Camila Rocha", due: 0, opened: -14, lastMovement: -6, protocol: null, docsTotal: 4, docsReceived: 2, value: 1800, financial: "pendente", description: "Certidões negativas para financiamento imobiliário.", nextAction: "Reenviar cobrança do comprovante de residência." },
  { id: "p12", code: "PRC-2412", clientId: "c10", service: "s4", stage: "em_analise", priority: "media", owner: "Camila Rocha", due: 18, opened: -55, lastMovement: -5, protocol: "VISA-2251/2025", docsTotal: 8, docsReceived: 8, value: 7600, financial: "parcial", description: "Licença sanitária para novo consultório odontológico.", nextAction: "Acompanhar vistoria agendada pelo órgão." },
  { id: "p13", code: "PRC-2413", clientId: "c12", service: "s6", stage: "deferido", priority: "baixa", owner: "Tiago Ferreira", due: -2, opened: -45, lastMovement: -2, protocol: "RFB-77.221.905", docsTotal: 5, docsReceived: 5, value: 2400, financial: "pago", description: "Regularidade fiscal federal para linha de crédito rural.", nextAction: "Entregar certidões ao cliente." },
  { id: "p14", code: "PRC-2414", clientId: "c08", service: "s1", stage: "montagem", priority: "media", owner: "Marina Alves", due: 13, opened: -30, lastMovement: -18, protocol: null, docsTotal: 10, docsReceived: 8, value: 16400, financial: "pendente", description: "Licença ambiental para pátio de manutenção da frota.", nextAction: "Retomar montagem — sem movimentação há 18 dias." },
  { id: "p15", code: "PRC-2415", clientId: "c13", service: "s5", stage: "novo", priority: "media", owner: "Marina Alves", due: 20, opened: -4, lastMovement: -4, protocol: null, docsTotal: 6, docsReceived: 0, value: 3100, financial: "pendente", description: "Abertura de sociedade limitada para consultoria educacional.", nextAction: "Coletar procuração assinada." },
  { id: "p16", code: "PRC-2416", clientId: "c06", service: "s3", stage: "documentos_conferencia", priority: "alta", owner: "Tiago Ferreira", due: 3, opened: -22, lastMovement: -1, protocol: null, docsTotal: 8, docsReceived: 6, value: 5200, financial: "parcial", description: "Alvará de funcionamento da segunda filial.", nextAction: "Validar contrato de locação e AVCB." },
  { id: "p17", code: "PRC-2417", clientId: "c14", service: "s1", stage: "exigencia", priority: "alta", owner: "Marina Alves", due: 6, opened: -90, lastMovement: -4, protocol: "SEMAS-4412/2025", docsTotal: 14, docsReceived: 12, value: 27500, financial: "parcial", description: "Exigência técnica sobre plano de gerenciamento de resíduos.", nextAction: "Anexar PGRS revisado pelo engenheiro." },
  { id: "p18", code: "PRC-2418", clientId: "c01", service: "s2", stage: "protocolado", priority: "media", owner: "Camila Rocha", due: 40, opened: -50, lastMovement: -7, protocol: "INPI-925.660.117", docsTotal: 5, docsReceived: 5, value: 4700, financial: "pago", description: "Registro de marca para linha de cursos online.", nextAction: "Monitorar oposições de terceiros." },
  { id: "p19", code: "PRC-2419", clientId: "c04", service: "s3", stage: "pronto_protocolo", priority: "critica", owner: "Tiago Ferreira", due: 0, opened: -18, lastMovement: 0, protocol: null, docsTotal: 9, docsReceived: 9, value: 8900, financial: "pendente", description: "Alvará do canteiro de obras — prazo vence hoje.", nextAction: "Protocolar hoje na prefeitura." },
  { id: "p20", code: "PRC-2420", clientId: "c02", service: "s5", stage: "finalizado", priority: "baixa", owner: "Marina Alves", due: -25, opened: -110, lastMovement: -25, protocol: "JUCEC-1.208.774", docsTotal: 6, docsReceived: 6, value: 3400, financial: "pago", description: "Abertura de filial em Sobral.", nextAction: "Nenhuma ação pendente." },
];

export type DemoProcess = ProcessRow & {
  description: string;
  next_action: string;
  service_id: string;
};

const clientById = new Map(DEMO_CLIENTS.map((client) => [client.id, client]));
const serviceById = new Map(DEMO_SERVICE_TYPES.map((service) => [service.id, service]));

export const DEMO_PROCESSES: DemoProcess[] = processSeeds.map((seed) => {
  const client = clientById.get(seed.clientId)!;
  const service = serviceById.get(seed.service)!;
  return {
    id: seed.id,
    organization_id: DEMO_ORG_ID,
    code: seed.code,
    client_id: seed.clientId,
    title: service.name,
    stage: seed.stage,
    priority: seed.priority,
    owner_name: seed.owner,
    opened_at: iso(seed.opened),
    due_date: seed.due === null ? null : day(seed.due),
    protocol: seed.protocol,
    last_movement_at: iso(seed.lastMovement, 14),
    documents_total: seed.docsTotal,
    documents_received: seed.docsReceived,
    value: seed.value,
    financial_status: seed.financial,
    archived_at: null,
    clients: { id: client.id, name: client.name, document: client.document, status: client.status },
    service_types: { id: service.id, name: service.name },
    service_id: service.id,
    description: seed.description,
    next_action: seed.nextAction,
  };
});

export type ChecklistStatus = "pendente" | "recebido" | "em_analise" | "aprovado" | "rejeitado";

export const CHECKLIST_STATUS: Record<ChecklistStatus, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pendente: { label: "Pendente", tone: "warning" },
  recebido: { label: "Recebido", tone: "info" },
  em_analise: { label: "Em análise", tone: "info" },
  aprovado: { label: "Aprovado", tone: "success" },
  rejeitado: { label: "Rejeitado", tone: "danger" },
};

export type ChecklistItem = { id: string; process_id: string; label: string; status: ChecklistStatus };

const CHECKLIST_LABELS = [
  "Documento de identificação",
  "Comprovante de residência",
  "Certidão negativa",
  "Formulário assinado",
  "Comprovante de pagamento",
  "Contrato social atualizado",
  "Laudo técnico",
];

const statusForIndex = (index: number, received: number): ChecklistStatus => {
  if (index < received - 1) return "aprovado";
  if (index === received - 1) return "em_analise";
  if (index === received) return "recebido";
  return "pendente";
};

export const DEMO_CHECKLIST: ChecklistItem[] = DEMO_PROCESSES.flatMap((process) =>
  CHECKLIST_LABELS.slice(0, 5).map((label, index) => ({
    id: `${process.id}-chk-${index}`,
    process_id: process.id,
    label,
    status:
      process.stage === "exigencia" && index === 2
        ? ("rejeitado" as ChecklistStatus)
        : statusForIndex(index, Math.round((process.documents_received / process.documents_total) * 5)),
  })),
);

type TaskSeed = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: PriorityLevel;
  dueOffset: number;
  hour: number;
  assignee: string;
  clientId: string;
  processId: string | null;
  kind: "tarefa" | "retorno" | "prazo" | "reuniao" | "vencimento";
};

const taskSeeds: TaskSeed[] = [
  { id: "t1", title: "Protocolar alvará do canteiro de obras", status: "pendente", priority: "critica", dueOffset: 0, hour: 11, assignee: "Tiago Ferreira", clientId: "c04", processId: "p19", kind: "prazo" },
  { id: "t2", title: "Retornar ligação sobre exigência sanitária", status: "pendente", priority: "alta", dueOffset: 0, hour: 14, assignee: "Camila Rocha", clientId: "c06", processId: "p03", kind: "retorno" },
  { id: "t3", title: "Reunião de alinhamento — Horizonte Sul", status: "pendente", priority: "media", dueOffset: 0, hour: 16, assignee: "Marina Alves", clientId: "c04", processId: "p01", kind: "reuniao" },
  { id: "t4", title: "Conferir documentos da Clínica Bem Viver", status: "em_andamento", priority: "alta", dueOffset: 1, hour: 10, assignee: "Camila Rocha", clientId: "c10", processId: "p04", kind: "tarefa" },
  { id: "t5", title: "Vencimento da licença sanitária atual", status: "pendente", priority: "alta", dueOffset: 2, hour: 9, assignee: "Tiago Ferreira", clientId: "c02", processId: "p02", kind: "vencimento" },
  { id: "t6", title: "Cobrar procuração assinada", status: "pendente", priority: "media", dueOffset: 3, hour: 9, assignee: "Marina Alves", clientId: "c13", processId: "p15", kind: "retorno" },
  { id: "t7", title: "Revisar PGRS antes do reenvio", status: "em_andamento", priority: "critica", dueOffset: -1, hour: 17, assignee: "Marina Alves", clientId: "c14", processId: "p17", kind: "prazo" },
  { id: "t8", title: "Enviar certidões deferidas ao cliente", status: "concluida", priority: "baixa", dueOffset: -1, hour: 15, assignee: "Tiago Ferreira", clientId: "c12", processId: "p13", kind: "tarefa" },
];

export type DemoTask = TaskRow & { kind: TaskSeed["kind"] };

export const DEMO_TASKS: DemoTask[] = taskSeeds.map((seed) => ({
  id: seed.id,
  organization_id: DEMO_ORG_ID,
  title: seed.title,
  status: seed.status,
  priority: seed.priority,
  due_at: iso(seed.dueOffset, seed.hour),
  assignee_name: seed.assignee,
  client_id: seed.clientId,
  process_id: seed.processId,
  clients: { name: clientById.get(seed.clientId)!.name },
  kind: seed.kind,
}));

export const DEMO_NOTIFICATIONS: NotificationRow[] = [
  { id: "n1", title: "Prazo vence hoje", body: "PRC-2419 — Alvará do canteiro de obras (Horizonte Sul).", kind: "prazo", read_at: null, created_at: iso(0, 8) },
  { id: "n2", title: "Exigência em aberto há 8 dias", body: "PRC-2403 — Farmácia Vida Plena aguarda resposta.", kind: "exigencia", read_at: null, created_at: iso(-1, 9) },
  { id: "n3", title: "Processo atrasado", body: "PRC-2409 — Metalúrgica Ponta Norte, 6 dias em atraso.", kind: "atraso", read_at: null, created_at: iso(-1, 16) },
  { id: "n4", title: "Documentos recebidos", body: "Clínica Bem Viver enviou 7 de 7 documentos.", kind: "documento", read_at: null, created_at: iso(-2, 11) },
  { id: "n5", title: "Sem movimentação", body: "PRC-2414 está há 18 dias sem atualização.", kind: "inercia", read_at: iso(-2, 12), created_at: iso(-2, 12) },
  { id: "n6", title: "Pagamento em atraso", body: "Farmácia Vida Plena — parcela vencida há 5 dias.", kind: "financeiro", read_at: iso(-3, 10), created_at: iso(-3, 10) },
  { id: "n7", title: "Oportunidade de novo serviço", body: "AgroTech Cerrado pode contratar renovação anual.", kind: "oportunidade", read_at: null, created_at: iso(-4, 15) },
];

type MovementSeed = { id: string; processId: string; description: string; actor: string; offset: number; hour: number; from?: ProcessStage; to?: ProcessStage };

const movementSeeds: MovementSeed[] = [
  { id: "m01", processId: "p04", description: "Documento recebido: contrato de locação atualizado.", actor: "Camila Rocha", offset: 0, hour: 9 },
  { id: "m02", processId: "p19", description: "Etapa alterada para Pronto para protocolo.", actor: "Tiago Ferreira", offset: 0, hour: 8, from: "montagem", to: "pronto_protocolo" },
  { id: "m03", processId: "p13", description: "Tarefa concluída: envio de certidões ao cliente.", actor: "Tiago Ferreira", offset: -1, hour: 17 },
  { id: "m04", processId: "p06", description: "Documentação completa — processo liberado para protocolo.", actor: "Tiago Ferreira", offset: -1, hour: 15 },
  { id: "m05", processId: "p11", description: "Cobrança enviada por WhatsApp ao cliente.", actor: "Camila Rocha", offset: -1, hour: 11 },
  { id: "m06", processId: "p17", description: "Exigência registrada pelo órgão ambiental.", actor: "Sistema", offset: -2, hour: 10 },
  { id: "m07", processId: "p05", description: "Pagamento registrado: R$ 3.200,00 (integral).", actor: "Bruno Nakamura", offset: -2, hour: 9 },
  { id: "m08", processId: "p02", description: "Documento recebido: alvará sanitário anterior.", actor: "Tiago Ferreira", offset: -3, hour: 14 },
  { id: "m09", processId: "p15", description: "Cliente cadastrado e vinculado ao processo.", actor: "Marina Alves", offset: -4, hour: 10 },
  { id: "m10", processId: "p12", description: "Etapa alterada para Em análise.", actor: "Camila Rocha", offset: -5, hour: 16, from: "protocolado", to: "em_analise" },
  { id: "m11", processId: "p03", description: "Resposta à exigência ainda pendente de laudo.", actor: "Tiago Ferreira", offset: -6, hour: 13 },
  { id: "m12", processId: "p18", description: "Processo criado a partir de proposta aprovada.", actor: "Camila Rocha", offset: -7, hour: 9 },
  { id: "m13", processId: "p07", description: "Publicação acompanhada na RPI sem oposições.", actor: "Marina Alves", offset: -9, hour: 11 },
  { id: "m14", processId: "p09", description: "Etapa alterada para Aguardando documentos.", actor: "Marina Alves", offset: -11, hour: 15, from: "novo", to: "aguardando_documentos" },
  { id: "m15", processId: "p10", description: "Processo finalizado e arquivado com sucesso.", actor: "Camila Rocha", offset: -12, hour: 18, from: "deferido", to: "finalizado" },
];

const processById = new Map(DEMO_PROCESSES.map((process) => [process.id, process]));

export const DEMO_MOVEMENTS: MovementRow[] = movementSeeds.map((seed) => {
  const process = processById.get(seed.processId)!;
  return {
    id: seed.id,
    description: seed.description,
    actor_name: seed.actor,
    created_at: iso(seed.offset, seed.hour),
    from_stage: seed.from ?? null,
    to_stage: seed.to ?? null,
    process_id: seed.processId,
    processes: { code: process.code, clients: { name: process.clients?.name ?? "" } },
  };
});

export const DEMO_OWNERS = Array.from(new Set(DEMO_PROCESSES.map((p) => p.owner_name!))).sort();
