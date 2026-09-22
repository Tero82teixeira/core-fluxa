import {
  Bell,
  Bot,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  CircleDollarSign,
  FileStack,
  FileText,
  Gauge,
  ListTodo,
  LayoutDashboard,
  HeartPulse,
  LifeBuoy,
  ListChecks,
  MessagesSquare,
  ReceiptText,
  PieChart,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import type { AppRole, IconType } from "@/lib/domain";

export type NavGroupKey = "operacao" | "gestao" | "sistema";

export type NavItem = {
  to: string;
  label: string;
  icon: IconType;
  description: string;
  ready: boolean;
  group: NavGroupKey;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/meu-dia", label: "Meu Dia", icon: ListTodo, description: "Prioridades pessoais", ready: true, group: "operacao" },
  { to: "/central", label: "Central de Comando", icon: LayoutDashboard, description: "Pulso da operação", ready: true, group: "operacao" },
  { to: "/clientes", label: "Clientes", icon: Users, description: "Carteira e relacionamento", ready: true, group: "operacao" },
  { to: "/saude/pacientes", label: "Pacientes", icon: HeartPulse, description: "Gestão administrativa de pacientes", ready: true, group: "operacao" },
  { to: "/saude/agenda", label: "Agenda e Atendimentos", icon: CalendarClock, description: "Horários, confirmações e responsáveis", ready: true, group: "operacao" },
  { to: "/saude/convenios", label: "Convênios", icon: Building2, description: "Operadoras e contatos administrativos", ready: true, group: "operacao" },
  { to: "/saude/autorizacoes", label: "Autorizações", icon: ClipboardCheck, description: "Solicitações, validade e status", ready: true, group: "operacao" },
  { to: "/saude/contas-medicas", label: "Contas Médicas", icon: FileText, description: "Faturamento e recebimentos", ready: true, group: "gestao" },
  { to: "/saude/lotes-faturamento", label: "Lotes de Faturamento", icon: ClipboardList, description: "Agrupamento e envio de contas médicas", ready: true, group: "gestao" },
  { to: "/saude/conciliacao", label: "Conciliação", icon: ReceiptText, description: "Enviado, recebido, glosado e pendente", ready: true, group: "gestao" },
  { to: "/saude/painel-faturamento", label: "Painel de Faturamento", icon: BarChart3, description: "Indicadores por convênio e período", ready: true, group: "gestao" },
  { to: "/saude/glosas", label: "Glosas", icon: CircleDollarSign, description: "Recursos e recuperação de valores", ready: true, group: "gestao" },
  { to: "/processos", label: "Processos", icon: FileStack, description: "Etapas, prazos e protocolos", ready: true, group: "operacao" },
  { to: "/documentos", label: "Documentos", icon: Building2, description: "Arquivos e validades", ready: true, group: "operacao" },
  { to: "/monitoramento", label: "Monitoramento", icon: Gauge, description: "Prazos e vencimentos", ready: true, group: "operacao" },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks, description: "Agenda operacional", ready: true, group: "operacao" },
  { to: "/comunicacao", label: "Comunicação", icon: MessagesSquare, description: "Histórico com clientes", ready: true, group: "gestao" },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, description: "Receitas e cobranças", ready: true, group: "gestao" },
  { to: "/relatorios", label: "Relatórios", icon: PieChart, description: "Indicadores e exportações", ready: true, group: "gestao" },
  { to: "/equipe", label: "Equipe", icon: CalendarClock, description: "Usuários e permissões", ready: true, group: "gestao" },
  { to: "/automacoes", label: "Automações", icon: Bot, description: "Regras e disparos", ready: true, group: "gestao" },
  { to: "/notificacoes", label: "Notificações", icon: Bell, description: "Avisos e alertas no aparelho", ready: true, group: "sistema" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, description: "Workspace e preferências", ready: true, group: "sistema" },
  { to: "/assinatura", label: "Minha assinatura", icon: CreditCard, description: "Plano, cobrança e acesso", ready: true, group: "sistema" },
  { to: "/ajuda", label: "Ajuda e suporte", icon: LifeBuoy, description: "Documentação e atendimento", ready: true, group: "sistema" },
  { to: "/novidades", label: "Novidades", icon: Sparkles, description: "Entregas e melhorias", ready: true, group: "sistema" },
];

export const NAV_GROUPS: { key: NavGroupKey; label: string }[] = [
  { key: "operacao", label: "Operação" },
  { key: "gestao", label: "Gestão" },
  { key: "sistema", label: "Sistema" },
];

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.to, item.label]),
);


const ROLE_NAVIGATION: Partial<Record<AppRole, readonly string[]>> = {
  gestor: [
    "/meu-dia",
    "/central",
    "/clientes",
    "/saude/pacientes",
    "/saude/agenda",
    "/saude/convenios",
    "/saude/autorizacoes",
    "/saude/contas-medicas",
    "/saude/lotes-faturamento",
    "/saude/conciliacao",
    "/saude/painel-faturamento",
    "/saude/glosas",
    "/processos",
    "/documentos",
    "/monitoramento",
    "/tarefas",
    "/comunicacao",
    "/relatorios",
    "/equipe",
    "/automacoes",
    "/notificacoes",
    "/ajuda",
    "/novidades",
  ],
  operacional: [
    "/meu-dia",
    "/central",
    "/clientes",
    "/saude/pacientes",
    "/saude/agenda",
    "/saude/convenios",
    "/saude/autorizacoes",
    "/processos",
    "/documentos",
    "/monitoramento",
    "/tarefas",
    "/comunicacao",
    "/notificacoes",
    "/ajuda",
    "/novidades",
  ],
  atendimento: [
    "/meu-dia",
    "/central",
    "/clientes",
    "/saude/pacientes",
    "/saude/agenda",
    "/saude/convenios",
    "/saude/autorizacoes",
    "/tarefas",
    "/comunicacao",
    "/notificacoes",
    "/ajuda",
    "/novidades",
  ],
  financeiro: [
    "/meu-dia",
    "/central",
    "/clientes",
    "/saude/contas-medicas",
    "/saude/lotes-faturamento",
    "/saude/conciliacao",
    "/saude/painel-faturamento",
    "/saude/glosas",
    "/financeiro",
    "/relatorios",
    "/notificacoes",
    "/ajuda",
    "/novidades",
  ],
  visualizador: [
    "/meu-dia",
    "/central",
    "/clientes",
    "/processos",
    "/documentos",
    "/monitoramento",
    "/tarefas",
    "/comunicacao",
    "/relatorios",
    "/notificacoes",
    "/ajuda",
    "/novidades",
  ],
  cliente_externo: ["/ajuda"],
};

export function navItemVisibleForRole(to: string, role: AppRole | null) {
  if (!role || role === "superadmin" || role === "proprietario" || role === "administrador") {
    return true;
  }
  return ROLE_NAVIGATION[role]?.includes(to) ?? false;
}
