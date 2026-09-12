# Exportação, histórico de backups e auditoria por empresa

Em **Configurações → Segurança**, proprietários e administradores encontram a central de proteção dos dados da empresa.

## Exportação

O botão **Gerar backup agora** consulta, com a sessão atual e as políticas RLS, os registros da empresa em páginas de até 1.000 itens. O arquivo contém um manifesto com data, empresa, quantidade total e contagem por seção.

São incluídos dados dos módulos de clientes, processos, tarefas, documentos, financeiro, comercial, comunicação, monitoramento, captação, metas, automações, suporte e auditoria. Segredos do Asaas, tokens, senhas, convites e credenciais são excluídos de forma deliberada.

Navegadores compatíveis geram `json.gz`; nos demais, o sistema gera `json`. O conteúdo é produzido no navegador autenticado e baixado diretamente no aparelho do usuário.

O inventário registra nomes, versões e caminhos protegidos dos documentos, mas não incorpora os arquivos binários. A cópia integral do Storage continua seguindo o procedimento operacional de backup da plataforma.

## Histórico

Depois que o arquivo é criado, o FLUXA registra `organization.backup.exported` por meio da RPC protegida `record_audit_event`. O painel mostra data, responsável, nome, tamanho e total de registros das exportações recentes.

## Auditoria

A central apresenta as 100 ações mais recentes da empresa, com busca por ação, responsável, entidade ou detalhe. A identidade é sempre derivada pelo servidor; o navegador não pode inserir, alterar nem excluir diretamente registros de auditoria.

## Permissões

- Proprietário e administrador: podem gerar a exportação completa.
- Membros ativos: podem consultar o histórico e a auditoria da própria empresa, conforme a política RLS já utilizada pelos módulos operacionais.
- Todas as consultas continuam limitadas à empresa ativa pelas políticas de isolamento do banco.
