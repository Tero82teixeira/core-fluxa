import {
  Bot,
  Building2,
  CalendarClock,
  FileStack,
  Gauge,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  PieChart,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import type { IconType } from "@/lib/domain";

export type NavItem = {
  to: string;
  label: string;
  icon: IconType;
  description: string;
  ready: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/central", label: "Central de Comando", icon: LayoutDashboard, description: "Pulso da operação", ready: true },
  { to: "/clientes", label: "Clientes", icon: Users, description: "Carteira e relacionamento", ready: true },
  { to: "/processos", label: "Processos", icon: FileStack, description: "Etapas, prazos e protocolos", ready: true },
  { to: "/documentos", label: "Documentos", icon: Building2, description: "Arquivos e validades", ready: false },
  { to: "/monitoramento", label: "Monitoramento", icon: Gauge, description: "Prazos e vencimentos", ready: false },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks, description: "Agenda operacional", ready: false },
  { to: "/comunicacao", label: "Comunicação", icon: MessagesSquare, description: "Histórico com clientes", ready: false },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, description: "Receitas e cobranças", ready: false },
  { to: "/relatorios", label: "Relatórios", icon: PieChart, description: "Indicadores e exportações", ready: false },
  { to: "/equipe", label: "Equipe", icon: CalendarClock, description: "Usuários e permissões", ready: false },
  { to: "/automacoes", label: "Automações", icon: Bot, description: "Regras e disparos", ready: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, description: "Workspace e preferências", ready: false },
];

export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.to, item.label]),
);
