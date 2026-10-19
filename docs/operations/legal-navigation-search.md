# Advocacia: menu e busca CNJ

A navegação jurídica prioriza Painel Jurídico, Agenda Jurídica, Clientes, Processos, Tarefas e Documentos. Comunicação e Financeiro ficam em Gestão do escritório; os demais destinos autorizados permanecem em Administração, que abre ao entrar em uma de suas páginas. Não renomeia o financeiro para honorários nem cria módulos ou permissões. Atalhos do cabeçalho respeitam os mesmos papéis e módulos.

Em Processos, um CNJ completo (20 dígitos) é reconhecido com ou sem pontuação. Para prefixos, use `CNJ: 0000041` (mínimo de sete dígitos). Números curtos sem esse prefixo continuam na busca geral de código/protocolo. A busca CNJ usa a lista paginada de 25 registros e mantém os filtros existentes, ordenação e opção de arquivados. O CNJ encontrado aparece junto ao código; não faz consulta a tribunais, validação de dígito verificador ou sincronização processual.

A RPC `search_legal_processes` somente lê dados. Exige sessão, papel e módulo jurídico, aplica o escopo da organização em todos os vínculos, devolve total completo e usa ordem estável. SECURITY DEFINER é necessário para ler a ficha jurídica privada sem conceder acesso direto à tabela. Adiciona índice parcial por organização e CNJ. Não altera tabelas de processos, permissões existentes ou rotinas de gravação.

## Ativação

1. Aplicar `legal-cnj-search.sql` inteiro no SQL Editor do projeto operacional `nobtbymxudlcsyurbopl`.
2. Publicar no Lovable em Publish → Update.

Migration criada pela CLI e posicionada depois das dependências jurídicas existentes, que já tinham datas futuras no repositório. O script não cria prazos ou processos e pode ser reaplicado.

A demonstração pública mantém os exemplos fictícios locais já entregues; esta RPC atende somente a área interna. A busca global do cabeçalho também reconhece CNJ completo ou prefixo explícito. Reutiliza a mesma RPC existente, com uma prévia de cinco processos. Havendo mais resultados, oferece um link estruturado para Processos com o parâmetro CNJ validado e sem reaproveitar filtros antigos. Resultados mantêm nome, código e CNJ; erros da fonte jurídica exibem nova tentativa. A filtragem local já é feita pelo ranking, evitando uma segunda filtragem visual que ocultaria correspondências de CNJ com outra pontuação.

Painel Jurídico e Agenda Jurídica entram como atalhos locais, somente para usuários com permissão de processos, papel autorizado e módulo jurídico habilitado. A chave de cache inclui esse acesso e a organização. Nenhuma nova migration é necessária para esta extensão: basta publicar no Lovable após a aplicação anterior de `legal-cnj-search.sql`.

Verificação: pgTAP confirma função, privilégios e índice no banco completo; `tests/legal-workspace.database.mjs` inclui `legal-search.database.mjs`, que verifica a SQL real com 507 resultados de prefixo, todas as páginas, filtros, arquivamento e negações de acesso. Testes do menu asseguram preservação dos destinos por papel/módulo; testes da normalização evitam capturar protocolos numéricos curtos.

Reversão: novo commit retornando o frontend à versão anterior. A função de leitura e o índice podem permanecer instalados sem afetar as consultas anteriores. Não remover fichas ou dados jurídicos.
