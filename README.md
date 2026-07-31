# Fluxo Inteligente

Crie a fundação de um sistema SaaS B2B multiempresa chamado provisoriamente FLUXA — Central Inteligente de Processos.

O sistema será utilizado por empresas que trabalham com processos regulatórios, documentação, acompanhamento de solicitações, atendimento de clientes e controle de prazos.

Não quero um painel administrativo genérico. Quero uma experiência de produto premium, moderna, extremamente organizada e surpreendente, com aparência de software de alto valor.

1. Visão do produto

O NEXORA deve funcionar como uma central operacional inteligente que reúne:

clientes;

processos;

documentos;

prazos e vencimentos;

tarefas;

comunicação;

equipe;

financeiro;

relatórios;

automações;

portal do cliente;

inteligência artificial.

O sistema precisa ser preparado como SaaS multiempresa. Cada empresa deve possuir seu próprio workspace, usuários, clientes, processos, documentos e configurações.

Nenhum usuário de uma empresa poderá acessar dados de outra empresa.

2. Tecnologias e organização

Utilize:

React;

TypeScript;

Tailwind CSS;

componentes reutilizáveis;

arquitetura organizada por módulos;

Supabase para banco de dados, autenticação, storage e Edge Functions;

React Query ou solução equivalente para gerenciamento das consultas;

formulários com validação;

componentes acessíveis;

responsividade completa.

Não coloque chaves privadas ou segredos no frontend.

Prepare o projeto para sincronização com GitHub.

Centralize:

tipos;

enums;

máscaras;

validações;

permissões;

status;

componentes compartilhados;

chamadas ao backend.

Evite arquivos gigantes. Separe páginas, layouts, componentes, hooks, serviços e tipos.

3. Idioma e localização

Todo o sistema deve estar em português do Brasil.

Utilize:

datas no padrão DD/MM/AAAA;

horários no formato de 24 horas;

moeda no padrão brasileiro: R$;

CPF e CNPJ com máscara;

telefone e WhatsApp com máscara;

CEP com máscara;

textos profissionais e naturais;

fuso horário America/Sao_Paulo.

4. Direção visual

Crie uma identidade sofisticada, confiável e tecnológica.

Aparência

interface limpa;

alto nível de acabamento;

espaçamento generoso;

excelente hierarquia visual;

menu lateral elegante;

cabeçalho compacto;

cartões refinados;

gráficos discretos;

ícones consistentes;

animações leves;

microinterações;

estados de carregamento com skeleton;

estados vazios bem elaborados;

mensagens de erro claras;

feedback visual após cada ação.

Estilo

Utilize fundo em tons de grafite profundo no modo escuro e tons muito claros no modo claro.

A cor principal deve ser azul profundo com detalhes em azul elétrico moderado. Utilize verde, amarelo, laranja e vermelho somente para comunicar status.

Não utilize:

excesso de gradientes;

neon exagerado;

glassmorphism em todos os elementos;

sombras muito fortes;

cartões coloridos sem necessidade;

aparência de template pronto;

textos pequenos demais;

excesso de bordas.

Crie modo claro e modo escuro.

O modo escuro deve parecer elegante e profissional, não apenas uma inversão de cores.

5. Estrutura de navegação

Crie um layout autenticado com menu lateral recolhível.

Menu principal

Central de Comando

Clientes

Processos

Documentos

Monitoramento

Tarefas

Comunicação

Financeiro

Relatórios

Equipe

Automações

Configurações

Na parte inferior do menu, incluir:

ajuda e suporte;

novidades;

perfil do usuário;

troca de tema;

botão para recolher o menu.

Cabeçalho

O cabeçalho deve conter:

nome da página;

breadcrumbs quando necessário;

busca global;

botão “Criar”;

central de notificações;

avatar do usuário;

seletor de workspace para usuários autorizados.

O botão “Criar” deve abrir um menu de ações rápidas:

Novo cliente;

Novo processo;

Nova tarefa;

Adicionar documento;

Registrar pagamento;

Criar lembrete.

6. Autenticação

Crie as seguintes páginas:

Entrar;

Criar conta;

Esqueci minha senha;

Redefinir senha;

Verificar e-mail;

Convite para equipe;

Sessão expirada;

Acesso não autorizado.

A página de login deve ser moderna, profissional e dividida em duas áreas:

Área esquerda

Apresentar uma mensagem de posicionamento:

“Transforme processos complexos em uma operação simples, previsível e inteligente.”

Adicionar três benefícios curtos:

Controle total dos processos;

Documentos e prazos organizados;

Equipe e clientes conectados.

Área direita

Formulário de acesso com:

e-mail;

senha;

mostrar ou ocultar senha;

lembrar acesso;

entrar;

recuperar senha.

Não criar autenticação falsa baseada somente em localStorage.

7. Onboarding da empresa

Após o primeiro acesso, apresentar um onboarding em etapas.

Etapa 1 — Empresa

Razão social;

Nome fantasia;

CPF ou CNPJ;

E-mail;

Telefone;

WhatsApp;

Site opcional.

Etapa 2 — Endereço

CEP;

Logradouro;

Número;

Complemento;

Bairro;

Cidade;

Estado.

Etapa 3 — Operação

Quantidade aproximada de clientes;

Quantidade de funcionários;

Principais serviços oferecidos;

Como os processos são controlados atualmente.

Etapa 4 — Personalização

Logotipo;

Cor principal;

Preferência de tema;

Nome que aparecerá no portal do cliente.

Etapa 5 — Conclusão

Mostrar um resumo e permitir entrar na Central de Comando.

O onboarding deve:

indicar o progresso;

salvar automaticamente;

permitir voltar;

validar campos;

não perder informações ao atualizar a página.

8. Central de Comando

Crie uma página inicial impressionante, chamada Central de Comando.

Ela não deve ser apenas um conjunto de gráficos. Deve responder rapidamente:

O que está acontecendo?

O que exige atenção?

O que precisa ser feito hoje?

Onde existem riscos?

Quais oportunidades estão surgindo?

Cabeçalho da Central de Comando

Apresentar:

“Boa tarde, [primeiro nome]. Aqui está o pulso da sua operação.”

Abaixo, mostrar data atual e um pequeno resumo:

“Existem 4 prioridades, 7 processos aguardando ação e 3 documentos próximos do vencimento.”

Barra Pulso da Operação

Criar uma barra horizontal com cinco indicadores clicáveis:

Urgentes;

Vencem hoje;

Aguardando cliente;

Sem movimentação;

Oportunidades.

Cada indicador deve abrir uma gaveta lateral com os registros relacionados.

Radar de Prioridades

Criar um componente em destaque chamado Radar de Prioridades.

Cada item deve apresentar:

cliente;

processo;

motivo do alerta;

nível de risco;

prazo;

responsável;

próxima ação recomendada;

botão para agir.

Exemplos de próxima ação:

Solicitar documento;

Atualizar cliente;

Verificar protocolo;

Renovar documento;

Atribuir responsável.

Indicadores principais

Criar cartões para:

Processos ativos;

Aguardando documentos;

Em análise;

Prazos críticos;

Clientes ativos;

Receita prevista.

Cada cartão deve mostrar:

valor atual;

comparação com o período anterior;

pequena tendência;

tooltip explicativo;

clique para abrir detalhes.

Pipeline de processos

Criar uma visualização resumida das etapas:

Entrada;

Documentação;

Montagem;

Protocolado;

Em análise;

Pendência;

Concluído.

Mostrar a quantidade em cada etapa.

Agenda operacional

Apresentar:

tarefas de hoje;

prazos;

reuniões;

retornos;

vencimentos.

Permitir marcar uma tarefa como concluída sem sair do dashboard.

Atividade recente

Criar uma linha do tempo contendo:

cliente cadastrado;

documento enviado;

processo atualizado;

comentário adicionado;

tarefa concluída;

pagamento registrado.

Mostrar usuário responsável e horário.

Busca global

A busca deve localizar:

clientes;

CPF;

CNPJ;

telefone;

e-mail;

protocolos;

processos;

documentos;

tarefas.

Os resultados devem ser agrupados por categoria e abrir rapidamente o registro correspondente.

Modo Foco

Adicionar um botão chamado Modo Foco.

Quando ativado, ocultar gráficos secundários e mostrar somente:

urgências;

tarefas de hoje;

processos bloqueados;

prazos críticos;

próximas ações.

9. Módulo de clientes

Crie uma página de clientes com:

visualização em tabela;

alternância futura para cards;

pesquisa;

filtros avançados;

ordenação;

seleção em massa;

exportação;

botão “Novo cliente”.

Colunas

Cliente;

CPF ou CNPJ;

Contato;

Cidade/UF;

Quantidade de processos;

Pendências;

Última interação;

Responsável;

Status;

Ações.

Status do cliente

Lead;

Em cadastro;

Ativo;

Com pendência;

Inativo;

Arquivado.

Novo cliente

Criar um formulário em etapas:

Dados básicos;

Documentação;

Endereço;

Contato;

Observações;

Revisão.

Permitir pessoa física e pessoa jurídica.

Adicionar validações e impedir duplicidade por CPF ou CNPJ dentro do mesmo workspace.

Cliente 360

Prepare a estrutura da página individual do cliente com abas:

Visão geral;

Processos;

Documentos;

Comunicação;

Tarefas;

Financeiro;

Histórico.

No topo, mostrar:

nome;

documento;

foto ou iniciais;

status;

responsável;

WhatsApp;

e-mail;

botão “Nova ação”.

Criar um indicador chamado Saúde do Relacionamento, utilizando inicialmente dados simulados:

Saudável;

Atenção;

Crítico.

Não implementar inteligência artificial real nessa etapa, apenas preparar o componente.

10. Módulo de processos

Crie duas visualizações:

Tabela;

Kanban.

Etapas padrão

Novo;

Aguardando documentos;

Documentos em conferência;

Montagem;

Pronto para protocolo;

Protocolado;

Em análise;

Exigência ou pendência;

Deferido;

Finalizado;

Arquivado;

Cancelado.

Dados do processo

Número interno;

Cliente;

Tipo de serviço;

Status;

Etapa;

Prioridade;

Responsável;

Data de abertura;

Prazo;

Protocolo;

Última movimentação;

Dias sem atualização;

Valor;

Situação financeira.

Kanban

Cada card deve mostrar:

cliente;

serviço;

responsável;

prazo;

alertas;

progresso documental;

dias sem movimentação.

Permitir arrastar entre etapas, mas solicitar confirmação para mudanças importantes.

Ao mudar de etapa, registrar a movimentação no histórico.

Página individual do processo

Prepare abas para:

Resumo;

Etapas;

Documentos;

Checklist;

Comunicação;

Tarefas;

Financeiro;

Histórico.

Mostrar no topo uma linha do tempo visual do processo.

11. Usuários e permissões

Criar os seguintes perfis:

Superadministrador da plataforma;

Proprietário da empresa;

Administrador;

Gestor;

Operacional;

Atendimento;

Financeiro;

Visualizador;

Cliente externo.

As permissões devem ser preparadas para controlar:

visualização;

criação;

edição;

exclusão;

exportação;

acesso financeiro;

acesso às configurações;

gerenciamento da equipe.

Não proteger páginas apenas ocultando botões. Preparar a segurança no backend.

12. Banco de dados

Crie uma estrutura inicial com tabelas equivalentes a:

organizations;

organization_settings;

profiles;

organization_members;

roles;

permissions;

role_permissions;

clients;

client_addresses;

client_contacts;

service_types;

processes;

process_stages;

process_movements;

tasks;

notifications;

audit_logs.

Todas as tabelas relacionadas à operação devem possuir organization_id.

Utilizar UUIDs.

Adicionar:

created_at;

updated_at;

created_by quando aplicável;

updated_by quando aplicável;

archived_at quando for necessário arquivamento.

Evite exclusão definitiva de clientes e processos. Utilize arquivamento ou soft delete.

Crie índices para campos pesquisados frequentemente, incluindo:

organization_id;

CPF/CNPJ normalizado;

nome;

protocolo;

status;

responsável;

prazo;

created_at.

13. Segurança

Ativar Row Level Security nas tabelas.

Criar políticas para que:

o usuário veja apenas dados das organizações das quais participa;

o proprietário administre sua empresa;

usuários comuns respeitem suas permissões;

clientes externos visualizem somente seus próprios dados;

arquivos privados não sejam expostos publicamente;

funções administrativas sejam executadas no servidor.

Não utilizar service role key no frontend.

Registrar ações importantes em audit_logs:

criação;

edição;

mudança de etapa;

arquivamento;

exportação;

login relevante;

alteração de permissões.

14. Dados de demonstração

Criar dados demonstrativos profissionais, sem utilizar “João da Silva” repetidamente ou textos genéricos.

Criar:

uma empresa de demonstração;

cinco usuários com funções diferentes;

aproximadamente quinze clientes;

aproximadamente vinte processos;

tarefas;

alertas;

movimentações;

indicadores.

Os dados precisam produzir uma Central de Comando visualmente completa.

Utilizar valores em reais.

15. Responsividade

O sistema deve funcionar em:

desktop;

notebook;

tablet;

celular.

No celular:

transformar o menu lateral em drawer;

preservar ações importantes;

transformar tabelas em cards quando necessário;

manter filtros acessíveis;

não gerar rolagem horizontal descontrolada;

utilizar botões adequados ao toque.

16. Qualidade da primeira entrega

Nesta primeira etapa, priorize:

Fundação técnica organizada;

Autenticação;

Onboarding;

Layout principal;

Central de Comando;

Clientes;

Processos;

Estrutura de banco;

Permissões;

Responsividade.

Os demais módulos devem aparecer no menu com páginas bem desenhadas de “em construção”, explicando o que existirão nelas, sem inventar funções falsas.

Não crie botões que não fazem nada. Quando uma função ainda não estiver implementada, apresente um estado claramente identificado como futura funcionalidade.

Antes de concluir:

verifique erros de TypeScript;

verifique rotas;

verifique responsividade;

verifique estados vazios;

verifique carregamento;

verifique tratamento de erros;

verifique contraste;

verifique permissões;

verifique funcionamento no modo claro e escuro.

Ao terminar, apresente um resumo do que foi criado, das tabelas adicionadas e do que ainda precisa ser implementado.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://core-fluxa.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f7bc33d1-2ea5-45bd-81e0-8ea37adeef15).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
