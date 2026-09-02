# Plano de backup e recuperação do FLUXA

Este documento define o mínimo necessário para recuperar o FLUXA após exclusão acidental, corrupção de dados, indisponibilidade grave ou perda completa do projeto. Ele não confirma que um recurso pago da Supabase está ativo; essa confirmação deve ser feita no painel e registrada no checklist abaixo.

## Objetivos iniciais

| Objetivo             |                   Meta inicial | Interpretação                                                    |
| -------------------- | -----------------------------: | ---------------------------------------------------------------- |
| RPO                  |                   até 24 horas | perda máxima aceitável de dados desde a última cópia válida      |
| RTO                  |                    até 8 horas | tempo máximo desejado para restabelecer o serviço                |
| Retenção externa     | 4 cópias semanais e 12 mensais | cópias criptografadas fora do projeto de produção                |
| Teste de restauração |                     trimestral | recuperação em projeto isolado, nunca diretamente sobre produção |

Quando o volume de clientes ou o impacto financeiro tornar 24 horas inaceitável, reavaliar o RPO e habilitar Point-in-Time Recovery antes de assumir uma meta menor.

## O que precisa ser protegido

1. **Banco PostgreSQL:** schemas, dados, usuários do Auth, permissões, funções, políticas e histórico de migrations.
2. **Storage:** arquivos reais do bucket `organization-documents`, além dos metadados presentes no banco.
3. **Código:** repositório GitHub, migrations, testes e fonte das Edge Functions.
4. **Configuração:** URLs de redirecionamento, SMTP, provedores de autenticação, extensões, cron, variáveis do Lovable e nomes dos secrets das Edge Functions.
5. **Integrações:** configuração do webhook Kiwify, produto, plano, URL de checkout e procedimento de reenvio de eventos.

Backups do banco não contêm os arquivos binários do Supabase Storage. Restaurar apenas o banco pode trazer de volta os metadados sem recuperar os arquivos correspondentes. Edge Functions, configurações de autenticação, API keys e secrets também exigem reconfiguração separada.

## Controles obrigatórios antes de ampliar as vendas

- [ ] Confirmar o plano atual da Supabase em **Billing**.
- [ ] Confirmar em **Database > Backups** a existência, data e retenção do último backup.
- [ ] Se o projeto estiver no plano gratuito, programar exportações lógicas externas regulares.
- [ ] Manter uma cópia externa criptografada de banco e Storage, com acesso restrito.
- [ ] Registrar somente os **nomes** dos secrets; os valores ficam em um gerenciador de senhas, nunca no GitHub.
- [ ] Exigir MFA e limitar quem pode apagar o projeto ou alterar backups.
- [ ] Registrar o commit da versão em produção e a data de cada cópia.
- [ ] Executar `scripts/admin/backup-readiness.sql` e guardar o resultado junto ao registro da cópia.

## Rotina de backup

### Diária

1. Verificar se o backup gerenciado mais recente terminou sem erro.
2. Conferir alertas de banco, Storage e pagamentos.
3. Não considerar um backup válido apenas porque ele aparece na lista: a restauração trimestral é a prova de recuperação.

### Semanal

1. Gerar exportação lógica de papéis, schema e dados conforme a documentação oficial da Supabase.
2. Copiar separadamente todos os objetos do Storage por CLI ou cliente S3 compatível.
3. Gerar o inventário somente leitura de `scripts/admin/backup-readiness.sql`.
4. Criptografar os artefatos e armazená-los fora da conta/projeto de produção.
5. Registrar data, operador, commit, tamanho, localização segura e resultado da verificação.
6. Nunca colocar connection strings, senhas, service role keys ou secrets dentro do arquivo de registro.

### Antes de mudança de alto risco

Criar ou confirmar um ponto de recuperação imediatamente antes de migrations destrutivas, importações em massa, alteração de autenticação ou limpeza administrativa. Adiar a mudança se não houver cópia válida e reversão documentada.

## Resposta a incidentes

### 1. Exclusão de poucos registros

1. Interromper a ação que causou o problema e preservar audit logs.
2. Identificar organização, tabelas, horário e operador afetados.
3. Restaurar o backup em um projeto isolado.
4. Extrair apenas os registros necessários e suas dependências.
5. Revisar RLS, relacionamentos e auditoria antes da reinserção controlada.
6. Não restaurar toda a produção para corrigir um único registro.

### 2. Banco indisponível ou corrompido

1. Declarar incidente, registrar o horário e suspender operações que escrevem dados.
2. Definir o último instante íntegro antes do problema.
3. Usar backup diário ou PITR, se já estiver habilitado.
4. Validar contagens, migrations, usuários, RLS, cron e funções.
5. Executar os testes de fumaça antes de reabrir o acesso.

### 3. Arquivo ausente no Storage

1. Confirmar o caminho do objeto e o registro correspondente em documentos/versões.
2. Recuperar o objeto da cópia externa mantendo exatamente bucket e caminho.
3. Validar tamanho, tipo, acesso autenticado e vínculo com a organização.
4. Não tornar o bucket público para facilitar a recuperação.

### 4. Perda completa do projeto

1. Criar um novo projeto Supabase sem reutilizar credenciais comprometidas.
2. Restaurar papéis, schema, dados e histórico de migrations.
3. Recriar buckets/configurações e copiar os objetos do Storage.
4. Reimplantar Edge Functions a partir do GitHub.
5. Reconfigurar Auth, SMTP, extensões, cron, URLs, API keys e secrets.
6. Atualizar as variáveis do Lovable e o webhook da Kiwify somente após validação.
7. Executar testes de login, isolamento entre empresas, documentos, automações, assinatura e pagamento.
8. Trocar o tráfego apenas com aprovação registrada do responsável.

## Teste trimestral de restauração

O teste deve usar um projeto Supabase temporário e isolado. É proibido usar produção como destino do primeiro ensaio.

Critérios mínimos de aprovação:

- schema e histórico de migrations coerentes;
- usuários de teste conseguem autenticar;
- organizações continuam isoladas por RLS;
- contagens principais coincidem com o inventário do backup;
- objetos de Storage existem nos mesmos caminhos e permanecem privados;
- Edge Functions e cron estão configurados;
- checkout não é aberto durante o ensaio;
- nenhum webhook de teste altera uma empresa real;
- resultado, duração, RPO observado, RTO observado e correções ficam registrados.

## Checklist de retorno ao serviço

- [ ] Banco restaurado no ponto aprovado.
- [ ] Inventário anterior e posterior comparado.
- [ ] Auth, RLS e papéis validados.
- [ ] Storage privado e arquivos amostrados.
- [ ] Edge Functions e secrets reconfigurados.
- [ ] Automações temporais executando sem duplicidade.
- [ ] Kiwify apontando para o endpoint correto.
- [ ] Saúde dos pagamentos sem eventos pendentes inesperados.
- [ ] Site publicado e jornada comercial validada.
- [ ] Incidente e decisão de reabertura registrados.

## Referências oficiais

- [Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
- [Download Storage objects](https://supabase.com/docs/guides/storage/management/download-objects)
- [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
