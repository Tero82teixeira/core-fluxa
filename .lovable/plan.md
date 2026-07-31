# Clientes e Processos — evolução para uso diário

Escopo restrito aos módulos **Clientes** e **Processos** (e o que eles alimentam: tarefas vinculadas, tipos de serviço, checklist e indicadores da Central). Login, onboarding, WorkspaceProvider, AuthProvider, bootstrap e guards permanecem intactos.

O trabalho é grande, então será entregue em 4 fases encadeadas — cada fase deixa o app funcionando e testável. Aprove uma vez e eu executo as fases em sequência.

---

## Fase 1 — Banco de dados

Uma única migração:

- `clients`: novos campos `birth_date`, `legal_rep_name`, `zip_code`, `street`, `number`, `complement`, `district` (o endereço hoje só existe em `client_addresses`, que não é usado pela tela).
- `processes`: campo `status` operacional já não existe separado da etapa — será usado `stage` + `financial_status`; nenhum campo novo além de `notes`.
- Nova tabela `process_checklist_items`: título, descrição, status (pendente/recebido/em análise/aprovado/rejeitado), obrigatório, ordem, responsável, prazo, `deleted_at`.
- `service_types`: campos `suggested_stages` (jsonb) e `default_checklist` (jsonb); arquivamento via `is_active`.
- Índice único parcial de documento por organização (`organization_id`, `document_digits`) para bloquear CPF/CNPJ duplicado no banco.
- Índices ausentes: `clients(organization_id)`, `clients(document_digits)`, `clients(name)`, `processes(organization_id, stage)`, `processes(client_id)`, `processes(due_date)`, `process_movements(process_id)`, `tasks(organization_id)`, `tasks(process_id)`, `tasks(client_id)`.
- Políticas: apenas as necessárias para a nova tabela de checklist (mesmo padrão `is_org_member` já usado), mais restrição de escrita para `visualizador` em clientes/processos/tarefas/checklist via `has_org_role`. Nada mais é tocado.
- GRANTs completos para as tabelas novas.

## Fase 2 — Clientes

- `src/lib/validators.ts` (novo): validação de CPF/CNPJ com dígito verificador, e-mail, telefone/WhatsApp com DDD, UF, CEP; normalização para apenas dígitos.
- Formulário único reutilizável `client-form.tsx` com seletor Pessoa física / Pessoa jurídica, exibindo apenas os campos do tipo escolhido, incluindo endereço completo, responsável, status e observações. Usado tanto em criar quanto editar.
- Mensagens específicas de erro exigidas (CPF/CNPJ duplicado, documento inválido, telefone sem DDD, falha genérica).
- Listagem `/clientes`: busca com debounce por nome, documento, e-mail, telefone e WhatsApp; filtros por tipo de pessoa, status e responsável; ordenação; paginação server-side; alternância "mostrar arquivados"; estados de carregando, vazio e erro.
- Ações: editar, arquivar (com confirmação), restaurar, abrir ficha, criar processo para o cliente, criar tarefa para o cliente.
- Cliente 360: abas Visão geral / Processos / Tarefas / Histórico ligadas a dados reais, com os contadores pedidos (processos totais, ativos, concluídos, tarefas pendentes, última interação, cadastro).

## Fase 3 — Processos, tipos de serviço e checklist

- Listagem `/processos`: alternância Tabela / Kanban, busca com debounce, filtros (cliente, tipo de serviço, etapa, prioridade, responsável, prazo, situação financeira, arquivados), ordenação, paginação na tabela, estados de carregando/vazio/erro.
- Formulário de novo processo com todos os campos pedidos; número interno continua vindo da função do banco `next_process_code` (sequência isolada por empresa, sem contagem no frontend). Tipo de serviço preenche prazo e valor padrão.
- Página do processo: cabeçalho completo e abas Resumo / Etapas / Checklist / Tarefas / Histórico. Documentos, Comunicação e Financeiro completo continuam "Em breve".
- Edição inline de etapa, prioridade, responsável, prazo, protocolo e situação financeira, cada alteração gravando movimentação com valor anterior e novo.
- Kanban: arrastar atualiza etapa, grava movimentação, atualiza última movimentação, confirma com toast e reverte visualmente em caso de erro; confirmação obrigatória ao mover para Finalizado, Arquivado ou Cancelado; bloqueio para quem não tem permissão.
- Checklist real na nova tabela: adicionar, editar, alterar status, reordenar, remover logicamente, com registro no histórico.
- Tipos de serviço: tela de gestão (listar, criar, editar, arquivar) dentro de Configurações, sem automações.
- Tarefas vinculadas a cliente e/ou processo: criar, editar, concluir (grava data e usuário), reabrir, arquivar.

## Fase 4 — Central, permissões e testes

- Indicadores da Central recalculados com dados reais: clientes ativos, processos ativos, aguardando documentos, em análise, prazos críticos, tarefas do dia, processos sem movimentação. Design inalterado.
- Camada `usePermissions` derivada do papel atual: proprietário/administrador (tudo), operacional (criar/editar/mover/tarefas/checklist), visualizador (somente leitura) — com bloqueio também no banco, não só na interface.
- Estados consistentes de carregando/salvando/sucesso/erro/vazio/sem permissão/arquivado; botões travados durante envio; formulário não fecha em caso de erro.
- Testes no navegador com a conta atual cobrindo a lista de 28 verificações pedidas (criação PF e PJ, duplicidade, edição, arquivar/restaurar, tipo de serviço, processo e número interno, Kanban com recarga, histórico, checklist, tarefas, Central, persistência após novo login), mais verificação de tipos e console limpo.

---

## Detalhes técnicos

- Consultas passam a filtrar e paginar no banco (`range`, `or(...)`, `order`), sempre com `eq("organization_id", ...)`; nada de carregar tudo no cliente.
- Chaves de cache do TanStack Query passam a incluir os filtros; invalidação após cada mutação de cliente, processo, tarefa e checklist.
- `use-operations.ts` perde os ramos de demonstração (`DEMO_MODE` já está desligado) para eliminar os tipos duplicados `DemoClient`/`DemoProcess` que hoje mascaram os tipos reais.
- Nenhuma chave de serviço no frontend; toda escrita continua sob RLS com `auth.uid()`.

## Fora do escopo

Upload de documentos, WhatsApp, e-mail, pagamentos, relatórios avançados, IA, automações externas, portal do cliente e certidões seguem como "Em breve".
