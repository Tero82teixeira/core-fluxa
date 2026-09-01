import {
  Bot,
  Building2,
  CalendarClock,
  CreditCard,
  FileStack,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessagesSquare,
  PieChart,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import type { IconType } from "@/lib/domain";

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
  { to: "/central", label: "Central de Comando", icon: LayoutDashboard, description: "Pulso da operação", ready: true, group: "operacao" },
  { to: "/clientes", label: "Clientes", icon: Users, description: "Carteira e relacionamento", ready: true, group: "operacao" },
  { to: "/processos", label: "Processos", icon: FileStack, description: "Etapas, prazos e protocolos", ready: true, group: "operacao" },
  { to: "/documentos", label: "Documentos", icon: Building2, description: "Arquivos e validades", ready: true, group: "operacao" },
  { to: "/monitoramento", label: "Monitoramento", icon: Gauge, description: "Prazos e vencimentos", ready: true, group: "operacao" },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks, description: "Agenda operacional", ready: true, group: "operacao" },
  { to: "/comunicacao", label: "Comunicação", icon: MessagesSquare, description: "Histórico com clientes", ready: true, group: "gestao" },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, description: "Receitas e cobranças", ready: true, group: "gestao" },
  { to: "/relatorios", label: "Relatórios", icon: PieChart, description: "Indicadores e exportações", ready: true, group: "gestao" },
  { to: "/equipe", label: "Equipe", icon: CalendarClock, description: "Usuários e permissões", ready: true, group: "gestao" },
  { to: "/automacoes", label: "Automações", icon: Bot, description: "Regras e disparos", ready: true, group: "gestao" },
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
