export type ProductUpdateType = "feature" | "improvement" | "fix" | "security";

export type ProductUpdateModule =
  | "geral"
  | "clientes"
  | "processos"
  | "documentos"
  | "tarefas"
  | "comunicação"
  | "financeiro"
  | "monitoramento"
  | "relatórios"
  | "equipe"
  | "automações"
  | "configurações"
  | "ajuda";

export type ProductUpdate = {
  id: string;
  title: string;
  summary: string;
  description: string;
  type: ProductUpdateType;
  module: ProductUpdateModule;
  date: string;
  version?: string;
  highlights: string[];
  relatedRoute?: string;
  featured: boolean;
  newUntil?: string;
  keywords: string[];
};

export type ProductUpdatePeriod = "all" | "7" | "30" | "90";

export const PRODUCT_UPDATE_TYPE_LABELS: Record<ProductUpdateType, string> = {
  feature: "Novo recurso",
  improvement: "Melhoria",
  fix: "Correção",
  security: "Segurança",
};

export const PRODUCT_UPDATE_MODULE_LABELS: Record<ProductUpdateModule, string> = {
  geral: "Geral",
  clientes: "Clientes",
  processos: "Processos",
  documentos: "Documentos",
  tarefas: "Tarefas",
  comunicação: "Comunicação",
  financeiro: "Financeiro",
  monitoramento: "Monitoramento",
  relatórios: "Relatórios",
  equipe: "Equipe",
  automações: "Automações",
  configurações: "Configurações",
  ajuda: "Ajuda",
};

// Conteúdo editorial centralizado: a interface pode trocar esta fonte por uma API no futuro.
export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: "monitoramento-operacional",
    title: "Central de Monitoramento Operacional",
    summary: "Centraliza alertas de tarefas, processos, documentos, comunicação e financeiro.",
    description:
      "Uma visão única das situações que exigem acompanhamento, sem alterar o registro que originou cada alerta.",
    type: "feature",
    module: "monitoramento",
    date: "2026-08-10",
    version: "1.9.0",
    highlights: [
      "Alertas críticos",
      "Itens atrasados e vencendo",
      "Responsáveis",
      "Acompanhamento independente da origem",
      "Resolver e reabrir alertas",
    ],
    relatedRoute: "/monitoramento",
    featured: true,
    newUntil: "2026-09-10",
    keywords: ["alertas", "prazos", "acompanhamento", "vencimentos"],
  },
  {
    id: "configuracoes-organizacao",
    title: "Configurações da Organização",
    summary: "Preferências e regras da operação reunidas em um só lugar.",
    description:
      "A organização pode adaptar comportamentos da FLUXA ao seu contexto com configurações seguras e centralizadas.",
    type: "feature",
    module: "configurações",
    date: "2026-08-09",
    version: "1.8.0",
    highlights: [
      "Preferências regionais",
      "Operação e financeiro",
      "Comunicação e monitoramento",
      "Notificações e segurança",
      "Regras configuráveis por organização",
    ],
    relatedRoute: "/configuracoes",
    featured: true,
    newUntil: "2026-09-09",
    keywords: ["preferências", "regras", "organização", "segurança"],
  },
  {
    id: "ajuda-suporte",
    title: "Ajuda e Suporte",
    summary: "Conteúdo prático para encontrar respostas e conhecer a plataforma.",
    description:
      "A central de conhecimento já reúne conteúdo de autoatendimento. A abertura de solicitações depende da infraestrutura de suporte e não faz parte deste anúncio.",
    type: "feature",
    module: "ajuda",
    date: "2026-08-08",
    version: "1.7.0",
    highlights: ["Artigos", "Busca", "Categorias", "FAQ", "Guias rápidos"],
    relatedRoute: "/ajuda",
    featured: true,
    newUntil: "2026-09-08",
    keywords: ["conhecimento", "documentação", "perguntas", "guias"],
  },
  {
    id: "janela-monitoramento",
    title: "Janela dinâmica do Monitoramento",
    summary: "O período de próximos dias agora acompanha a configuração da organização.",
    description:
      "O card de próximos vencimentos mostra o valor configurado pela organização, mantendo a leitura do painel coerente com sua operação.",
    type: "improvement",
    module: "monitoramento",
    date: "2026-08-07",
    highlights: ["Período configurável", "Rótulo dinâmico no card", "Visão alinhada à operação"],
    relatedRoute: "/monitoramento",
    featured: false,
    newUntil: "2026-08-21",
    keywords: ["janela", "dias", "card", "vencimento"],
  },
  {
    id: "comunicacao",
    title: "Central de Comunicação",
    summary: "Organize o histórico de relacionamento e os próximos retornos.",
    description:
      "Conversas e registros internos ficam reunidos em uma timeline organizada por cliente e responsável.",
    type: "feature",
    module: "comunicação",
    date: "2026-08-05",
    version: "1.6.0",
    highlights: ["Conversas e timeline", "Notas internas", "Retorno e responsável", "Arquivamento"],
    relatedRoute: "/comunicacao",
    featured: false,
    keywords: ["mensagens", "cliente", "histórico", "follow-up"],
  },
  {
    id: "financeiro",
    title: "Financeiro completo",
    summary: "Controle entradas, saídas, pagamentos e estruturas financeiras.",
    description:
      "A operação financeira passa a contar com lançamentos, liquidações e recorrências em uma visão integrada.",
    type: "feature",
    module: "financeiro",
    date: "2026-08-03",
    version: "1.5.0",
    highlights: [
      "Receitas e despesas",
      "Contas a receber e a pagar",
      "Pagamentos parciais e quitação",
      "Recorrências e categorias",
      "Contas financeiras",
    ],
    relatedRoute: "/financeiro",
    featured: false,
    keywords: ["pagamento", "recebimento", "caixa", "recorrência"],
  },
  {
    id: "relatorios",
    title: "Relatórios",
    summary: "Acompanhe indicadores e transforme filtros em análises compartilháveis.",
    description:
      "Relatórios operacionais apresentam dados em indicadores e gráficos, com opções práticas de exportação.",
    type: "feature",
    module: "relatórios",
    date: "2026-07-30",
    version: "1.4.0",
    highlights: ["Indicadores", "Filtros", "Gráficos", "Exportação CSV", "Impressão e PDF"],
    relatedRoute: "/relatorios",
    featured: false,
    keywords: ["dashboard", "análise", "exportar", "gráficos"],
  },
  {
    id: "equipe-permissoes",
    title: "Equipe e permissões",
    summary: "Gerencie participantes e níveis de acesso da organização.",
    description:
      "O módulo de equipe oferece uma visão clara de membros, convites e responsabilidades de acesso.",
    type: "improvement",
    module: "equipe",
    date: "2026-07-26",
    highlights: ["Convites", "Papéis", "Organização", "Permissões"],
    relatedRoute: "/equipe",
    featured: false,
    keywords: ["membros", "acesso", "usuários", "convite"],
  },
  {
    id: "automacoes",
    title: "Automações",
    summary: "Crie regras internas para reduzir tarefas repetitivas.",
    description:
      "Regras baseadas em eventos de tarefas, processos e monitoramento podem criar tarefas, atualizar registros, notificar e gerar auditoria.",
    type: "feature",
    module: "automações",
    date: "2026-07-20",
    version: "1.3.0",
    highlights: [
      "Gatilhos de tarefas, processos e monitoramento",
      "Condições configuráveis",
      "Ações internas",
      "Histórico de execuções",
    ],
    relatedRoute: "/automacoes",
    featured: false,
    keywords: ["regras", "gatilhos", "ações", "execuções"],
  },
  {
    id: "fix-configuracoes-parcial",
    title: "Carregamento resiliente das Configurações",
    summary: "Payloads parciais não interrompem mais a página de configurações.",
    description:
      "Valores ausentes passam a usar padrões seguros durante o carregamento das preferências da organização.",
    type: "fix",
    module: "configurações",
    date: "2026-08-06",
    highlights: ["Tratamento de payload parcial", "Valores padrão seguros", "Página mais estável"],
    relatedRoute: "/configuracoes",
    featured: false,
    keywords: ["payload", "carregamento", "falha"],
  },
  {
    id: "fix-filtros-comunicacao",
    title: "Sincronização dos filtros da Comunicação",
    summary: "Filtros e resultados permanecem sincronizados durante a navegação.",
    description:
      "A seleção de filtros da Central de Comunicação agora reflete corretamente a lista exibida.",
    type: "fix",
    module: "comunicação",
    date: "2026-08-02",
    highlights: ["Filtros sincronizados", "Resultados consistentes"],
    relatedRoute: "/comunicacao",
    featured: false,
    keywords: ["filtros", "sincronização", "resultados"],
  },
  {
    id: "fix-financeiro",
    title: "Carregamento do Financeiro",
    summary: "A consulta financeira ficou mais previsível e resiliente.",
    description:
      "Ajustes no fluxo de carregamento evitam estados inconsistentes ao abrir o módulo financeiro.",
    type: "fix",
    module: "financeiro",
    date: "2026-07-28",
    highlights: ["Carregamento estável", "Estados consistentes", "Feedback visual"],
    relatedRoute: "/financeiro",
    featured: false,
    keywords: ["consulta", "loading", "estabilidade"],
  },
  {
    id: "melhorias-visuais",
    title: "Melhorias visuais em tabelas",
    summary: "Listagens ficaram mais legíveis em diferentes tamanhos de tela.",
    description:
      "Espaçamento, hierarquia e estados visuais foram refinados nas listagens aplicáveis da plataforma.",
    type: "improvement",
    module: "geral",
    date: "2026-07-15",
    highlights: ["Leitura aprimorada", "Hierarquia visual", "Responsividade"],
    featured: false,
    keywords: ["tabelas", "layout", "mobile", "interface"],
  },
];

export function normalizeProductUpdateText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function sortProductUpdates(updates: readonly ProductUpdate[] = PRODUCT_UPDATES) {
  return [...updates].sort((a, b) => b.date.localeCompare(a.date));
}

export function isProductUpdateNew(update: ProductUpdate, referenceDate = new Date()) {
  if (!update.newUntil) return false;
  const endOfDay = new Date(`${update.newUntil}T23:59:59.999`);
  return endOfDay.getTime() >= referenceDate.getTime();
}

export function filterProductUpdates(
  options: {
    query?: string;
    type?: ProductUpdateType | "all";
    module?: ProductUpdateModule | "all";
    period?: ProductUpdatePeriod;
    referenceDate?: Date;
  } = {},
) {
  const {
    query = "",
    type = "all",
    module = "all",
    period = "all",
    referenceDate = new Date(),
  } = options;
  const needle = normalizeProductUpdateText(query.trim());
  const cutoff =
    period === "all" ? null : new Date(referenceDate.getTime() - Number(period) * 86_400_000);
  return sortProductUpdates().filter((update) => {
    const searchable = normalizeProductUpdateText(
      [
        update.title,
        update.summary,
        update.description,
        PRODUCT_UPDATE_MODULE_LABELS[update.module],
        ...update.keywords,
        ...update.highlights,
      ].join(" "),
    );
    return (
      (!needle || searchable.includes(needle)) &&
      (type === "all" || update.type === type) &&
      (module === "all" || update.module === module) &&
      (!cutoff || new Date(`${update.date}T23:59:59.999`) >= cutoff)
    );
  });
}
