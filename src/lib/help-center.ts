export const HELP_CATEGORIES = [
  "Primeiros passos",
  "Clientes",
  "Processos",
  "Documentos",
  "Tarefas",
  "Comunicação",
  "Financeiro",
  "Monitoramento",
  "Relatórios",
  "Equipe",
  "Automações",
  "Configurações",
  "Segurança e acesso",
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export type HelpArticle = {
  id: string;
  title: string;
  question?: string;
  category: HelpCategory;
  summary: string;
  content: string[];
  tips: string[];
  keywords: string[];
  relatedRoute: string;
  order: number;
};

const article = (
  id: string,
  title: string,
  category: HelpCategory,
  summary: string,
  relatedRoute: string,
  order: number,
  keywords: string[] = [],
): HelpArticle => ({
  id,
  title,
  question: title,
  category,
  summary,
  relatedRoute,
  order,
  keywords,
  content: [
    `Acesse ${category} pelo menu principal.`,
    summary,
    "Revise os dados informados e confirme a ação disponível na tela.",
  ],
  tips: [
    "As opções disponíveis respeitam seu papel e a organização ativa.",
    "Campos somente leitura não podem ser alterados pelo seu nível de acesso.",
  ],
});
export const HELP_ARTICLES: HelpArticle[] = [
  article(
    "comecar",
    "Como começar a usar a FLUXA",
    "Primeiros passos",
    "Escolha a organização ativa e use o menu para acessar clientes, processos e tarefas.",
    "/central",
    1,
    ["início", "onboarding"],
  ),
  article(
    "primeiro-cliente",
    "Como criar um cliente",
    "Primeiros passos",
    "Cadastre os dados essenciais do cliente antes de vinculá-lo a processos.",
    "/clientes/novo",
    2,
    ["cadastrar", "pessoa"],
  ),
  article(
    "primeiro-processo",
    "Como criar um processo",
    "Primeiros passos",
    "Crie um processo e vincule cliente e responsável quando aplicável.",
    "/processos/novo",
    3,
    ["caso", "fluxo"],
  ),
  article(
    "primeira-tarefa",
    "Como criar uma tarefa",
    "Primeiros passos",
    "Registre título, prazo, prioridade e responsável na área de tarefas.",
    "/tarefas",
    4,
    ["atividade", "prazo"],
  ),
  article(
    "convidar-equipe",
    "Como convidar membros da equipe",
    "Primeiros passos",
    "Administradores podem enviar convites e selecionar o papel adequado.",
    "/equipe",
    5,
    ["usuário", "convite"],
  ),
  article(
    "cadastrar-cliente",
    "Como cadastrar um cliente",
    "Clientes",
    "Informe os dados disponíveis no formulário e salve o cadastro.",
    "/clientes/novo",
    10,
    ["cadastro"],
  ),
  article(
    "arquivar-cliente",
    "Como arquivar um cliente",
    "Clientes",
    "Use a ação de arquivamento quando o cadastro não deve aparecer entre os ativos.",
    "/clientes",
    11,
    ["inativo"],
  ),
  article(
    "localizar-cliente",
    "Como localizar um cliente",
    "Clientes",
    "Use a busca e os filtros da lista de clientes.",
    "/clientes",
    12,
    ["pesquisa", "filtro"],
  ),
  article(
    "criar-processo",
    "Como criar um processo",
    "Processos",
    "Preencha os dados do processo e confirme o cadastro.",
    "/processos/novo",
    20,
  ),
  article(
    "etapas-processo",
    "Como acompanhar etapas",
    "Processos",
    "Abra o processo para consultar sua evolução e informações relacionadas.",
    "/processos",
    21,
    ["andamento"],
  ),
  article(
    "vinculos-processo",
    "Como vincular cliente e responsável",
    "Processos",
    "Selecione vínculos pertencentes à mesma organização.",
    "/processos",
    22,
    ["responsável"],
  ),
  article(
    "prazos-processo",
    "Como acompanhar prazos",
    "Processos",
    "Consulte datas no processo, nas tarefas e no Monitoramento.",
    "/processos",
    23,
    ["vencimento"],
  ),
  ...[
    [
      "cadastrar-documento",
      "Como cadastrar documentos",
      "Registre o documento no escopo disponível.",
    ],
    [
      "vencer-documento",
      "Como acompanhar vencimentos",
      "Consulte datas e alertas relacionados aos documentos.",
    ],
    [
      "vincular-documento",
      "Como vincular documento a cliente/processo",
      "Abra o cliente ou processo e use a área de documentos.",
    ],
  ].map((x, i) => article(x[0], x[1], "Documentos", x[2], "/documentos", 30 + i, ["arquivo"])),
  ...[
    [
      "criar-tarefa",
      "Como criar tarefa",
      "Use a ação de nova tarefa e informe os campos obrigatórios.",
    ],
    [
      "prioridade-tarefa",
      "Como definir prioridade",
      "Escolha a prioridade disponível no formulário.",
    ],
    ["concluir-tarefa", "Como concluir uma tarefa", "Abra a tarefa e marque-a como concluída."],
    [
      "atrasada-tarefa",
      "Como funcionam tarefas atrasadas",
      "Uma tarefa pendente após o prazo é destacada e pode aparecer no Monitoramento.",
    ],
  ].map((x, i) => article(x[0], x[1], "Tarefas", x[2], "/tarefas", 40 + i, ["atividade", "prazo"])),
  ...[
    [
      "criar-conversa",
      "Como criar uma conversa",
      "Abra Comunicação, escolha um cliente e registre o assunto.",
    ],
    [
      "interacao",
      "Como registrar interação",
      "Abra a conversa e adicione uma interação ao histórico.",
    ],
    ["nota-interna", "O que é nota interna", "É um registro interno da equipe na conversa."],
    [
      "retorno",
      "Como funciona retorno",
      "A data de retorno ajuda a acompanhar contatos pendentes.",
    ],
    [
      "arquivar-conversa",
      "Como arquivar conversa",
      "O arquivamento preserva o histórico e torna a conversa somente leitura.",
    ],
  ].map((x, i) =>
    article(x[0], x[1], "Comunicação", x[2], "/comunicacao", 50 + i, ["contato", "histórico"]),
  ),
  ...[
    [
      "lancamento",
      "Como criar lançamento",
      "Registre uma receita ou despesa com vencimento e valor.",
    ],
    [
      "receita-despesa",
      "Diferença entre receita e despesa",
      "Receita representa entrada; despesa representa saída.",
    ],
    [
      "contas-financeiras",
      "Contas a receber e pagar",
      "Consulte lançamentos pendentes conforme seu tipo.",
    ],
    [
      "pagamento-parcial",
      "Como registrar pagamento parcial",
      "Informe um valor menor que o saldo para manter o restante pendente.",
    ],
    ["quitar", "Como quitar saldo", "Registre o pagamento do saldo restante."],
    [
      "recorrencias",
      "Como usar recorrências",
      "Use recorrências para gerar lançamentos repetidos conforme as opções atuais.",
    ],
    [
      "categorias-contas",
      "Categorias e contas",
      "Organize lançamentos por categoria e conta financeira.",
    ],
  ].map((x, i) =>
    article(x[0], x[1], "Financeiro", x[2], "/financeiro", 60 + i, ["cobrança", "pagamento"]),
  ),
  ...[
    [
      "central-monitoramento",
      "O que é a Central de Monitoramento",
      "Reúne itens operacionais que precisam de acompanhamento.",
    ],
    [
      "critico",
      "O que significa crítico",
      "Indica um item que exige atenção conforme prazo e prioridade.",
    ],
    [
      "responsavel-alerta",
      "Como atribuir responsável",
      "Gestores e administradores podem atribuir um membro da organização.",
    ],
    [
      "resolver-alerta",
      "Como resolver e reabrir alerta",
      "O acompanhamento pode ser resolvido ou reaberto sem alterar automaticamente a origem.",
    ],
    [
      "status-monitoramento",
      "Diferença entre status original e acompanhamento",
      "O status do acompanhamento não substitui o status da tarefa ou item original.",
    ],
  ].map((x, i) => article(x[0], x[1], "Monitoramento", x[2], "/monitoramento", 70 + i, ["alerta"])),
  ...[
    [
      "filtrar-relatorio",
      "Como filtrar relatórios",
      "Selecione os filtros disponíveis antes de analisar os resultados.",
    ],
    ["csv", "Como exportar CSV", "Use a ação de exportação quando disponível no relatório."],
    [
      "pdf",
      "Como imprimir/PDF",
      "Use a visualização de impressão para salvar em PDF pelo navegador.",
    ],
  ].map((x, i) => article(x[0], x[1], "Relatórios", x[2], "/relatorios", 80 + i, ["exportar"])),
  ...[
    ["convidar", "Como convidar usuário", "Administradores escolhem o papel ao enviar um convite."],
    [
      "papeis",
      "Diferenças entre papéis",
      "Cada papel libera somente ações compatíveis com sua responsabilidade.",
    ],
    [
      "desativar-membro",
      "Como remover/desativar membro",
      "Administradores podem desativar membros sem apagar o histórico.",
    ],
  ].map((x, i) => article(x[0], x[1], "Equipe", x[2], "/equipe", 90 + i, ["permissão"])),
  ...[
    [
      "automacoes",
      "O que são automações internas",
      "São regras internas para ações suportadas pela plataforma.",
    ],
    ["ativar-automacao", "Como ativar/desativar", "Use o controle da regra se seu papel permitir."],
    [
      "limites-automacao",
      "Limitações atuais",
      "Somente gatilhos e ações exibidos na tela estão disponíveis.",
    ],
  ].map((x, i) => article(x[0], x[1], "Automações", x[2], "/automacoes", 100 + i, ["regra"])),
  ...[
    [
      "preferencias",
      "Como alterar preferências",
      "Abra Configurações e salve preferências permitidas.",
    ],
    [
      "janela-monitoramento",
      "Como alterar janela de monitoramento",
      "Administradores ajustam os períodos na aba Monitoramento.",
    ],
    [
      "config-comunicacao",
      "Configurações de comunicação",
      "Consulte a aba Comunicação nas configurações.",
    ],
    [
      "config-financeiro",
      "Configurações financeiras",
      "Consulte a aba Financeiro nas configurações.",
    ],
  ].map((x, i) =>
    article(x[0], x[1], "Configurações", x[2], "/configuracoes", 110 + i, ["ajustes"]),
  ),
  ...[
    ["permissoes", "Papéis e permissões", "Ações e leituras dependem do papel na organização."],
    [
      "organizacao-ativa",
      "Organização ativa",
      "Os dados exibidos pertencem à organização selecionada no momento.",
    ],
    [
      "somente-leitura",
      "Por que alguns campos ficam somente leitura",
      "Seu papel ou o estado do registro pode impedir alterações.",
    ],
  ].map((x, i) =>
    article(x[0], x[1], "Segurança e acesso", x[2], "/configuracoes", 120 + i, ["acesso", "rls"]),
  ),
];
export const FAQ_IDS = [
  "somente-leitura",
  "atrasada-tarefa",
  "resolver-alerta",
  "arquivar-conversa",
  "pagamento-parcial",
  "responsavel-alerta",
  "preferencias",
  "organizacao-ativa",
];
export const QUICK_GUIDE_IDS = [
  "primeiro-cliente",
  "primeiro-processo",
  "lancamento",
  "pagamento-parcial",
  "criar-conversa",
  "central-monitoramento",
  "janela-monitoramento",
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function searchHelpArticles(query: string, category?: HelpCategory | null) {
  const q = normalize(query.trim());
  return HELP_ARTICLES.filter(
    (a) =>
      (!category || a.category === category) &&
      (!q ||
        normalize(
          [a.title, a.question, a.summary, a.category, ...a.keywords].filter(Boolean).join(" "),
        ).includes(q)),
  ).sort((a, b) => a.order - b.order);
}
