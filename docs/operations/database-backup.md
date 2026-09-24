# Backup lógico diário do PostgreSQL do FLUXA

Este procedimento complementa o [plano de recuperação](./backup-and-disaster-recovery.md) e o [backup manual de banco e Storage para Windows](./manual-backup-free-plan.md). O alvo operacional do FLUXA é o projeto Supabase `nobtbymxudlcsyurbopl`; confirme o identificador antes de copiar sua URL de conexão. Este guia não confirma que os backups nativos estão habilitados nem que uma execução agendada já ocorreu.

## O que cada proteção cobre

| Proteção | Disponibilidade e recuperação | Limite |
| --- | --- | --- |
| Backup diário nativo do Supabase | Em projetos Pro, Team e Enterprise, consulte **Database > Backups** para verificar o último backup e a retenção do seu plano. | Até um dia de dados novos pode ficar fora da última cópia. |
| PITR (Point-in-Time Recovery) | Opção adicional em planos pagos; consulte **Database > Backups > Point in Time** para verificar se está ativa e quais pontos podem ser restaurados. | Se ativo, substitui os backups diários nativos. |
| Dump lógico deste guia | Um `.dump` com schema e dados, um SQL de schema para auditoria, SHA-256 dos dois e um marcador `COMPLETED`. | Não cobre arquivos binários do Storage, papéis globais, secrets ou configurações externas. |

Confirme o plano em **Billing** e registre a data/hora e o status do último backup em **Database > Backups**. No plano gratuito, não presuma que existe backup nativo recuperável. Os backups gerenciados também não contêm os arquivos reais do Storage; eles armazenam apenas os metadados do banco.

## Preparação

1. Instale `pg_dump` e `pg_restore` compatíveis com o servidor (o projeto operacional usa PostgreSQL 17 na preparação deste guia), além de `bash`, `sha256sum` e `flock`. Em Linux, o cliente PostgreSQL da mesma versão principal do servidor é uma escolha segura. No Windows, execute este script no WSL2 com essas ferramentas instaladas; para um backup manual sem WSL2, use o [procedimento PowerShell existente](./manual-backup-free-plan.md).
2. Crie uma pasta protegida **fora do checkout do FLUXA** e fora de qualquer pasta sincronizada publicamente. Use disco criptografado; o dump contém dados de clientes e pode conter hashes de usuários.
3. Copie a URL PostgreSQL do projeto operacional em **Supabase > Connect**. Uma conexão direta ou o pooler em *session mode* é adequada para `pg_dump`; não use *transaction mode* para essa rotina. Mantenha a URL apenas em variáveis de ambiente/gestor de segredos, nunca em comandos compartilhados, logs, prints ou arquivos versionados.
4. Confira se existem espaço em disco e acesso de leitura ao banco. Rode fora da janela de migrations: o dump completo e o SQL de schema são capturados em comandos separados e o schema pode mudar entre eles se alguém aplicar uma migration simultaneamente.

## Executar manualmente

No terminal Linux/macOS com `flock` instalado, após obter as variáveis de um gerenciador de segredos:

```bash
read -r -s -p 'URL do banco operacional: ' SUPABASE_DB_URL; printf '\n'
export SUPABASE_DB_URL
export BACKUP_DIR='/caminho/protegido/fora/do/repositorio'
bash scripts/backup-db.sh
```

Digite a URL obtida do gerenciador de segredos somente no prompt oculto; não a inclua no histórico do terminal. O script exige as duas variáveis, recusa a pasta do repositório, bloqueia execuções concorrentes, descarta saídas incompletas e publica o conjunto somente depois de verificar os dois hashes e a lista do arquivo customizado. Execuções posteriores geram pastas com timestamp UTC distinto:

```text
fluxa_db_YYYYMMDD_HHMMSS/
  fluxa_db_YYYYMMDD_HHMMSS.dump
  fluxa_db_YYYYMMDD_HHMMSS.dump.sha256
  fluxa_db_YYYYMMDD_HHMMSS_schema.sql
  fluxa_db_YYYYMMDD_HHMMSS_schema.sql.sha256
  COMPLETED
```

Para conferir a integridade depois de copiar o conjunto para outro destino:

```bash
cd /caminho/protegido/fluxa_db_YYYYMMDD_HHMMSS
sha256sum -c fluxa_db_YYYYMMDD_HHMMSS.dump.sha256
sha256sum -c fluxa_db_YYYYMMDD_HHMMSS_schema.sql.sha256
pg_restore --list fluxa_db_YYYYMMDD_HHMMSS.dump >/dev/null
```

## Restaurar e validar

**Comece por um projeto Supabase isolado.** O script executa `pg_restore --clean --if-exists`: ele apaga objetos no destino antes de recriá-los. Usar um projeto Supabase já provisionado requer atenção a schemas e permissões gerenciados (`auth`, `storage` e extensões); um dump PostgreSQL não recria, sozinho, toda a configuração da plataforma.

```bash
read -r -s -p 'URL do banco isolado de destino: ' TARGET_DB_URL; printf '\n'
export TARGET_DB_URL
export BACKUP_FILE='/caminho/protegido/fluxa_db_YYYYMMDD_HHMMSS/fluxa_db_YYYYMMDD_HHMMSS.dump'
bash scripts/restore-db.sh
```

O script confere o SHA-256 quando encontra `BACKUP_FILE.sha256`, valida o formato customizado e exige que a pessoa digite `RESTAURAR`. Em automação isolada, `FORCE=1` dispensa essa confirmação; **não use `FORCE=1` para uma primeira restauração em produção**. Se faltar o arquivo `.sha256`, o script avisa, mas permite prosseguir; conserve sempre os dois juntos. Teste autenticação, isolamento por `organization_id` e RLS, tabelas de Saúde e Advocacia, contagens, automações e integrações após restaurar. Registre o resultado e repita o teste periodicamente.

O `pg_dump` do banco não exporta papéis globais, senhas dos papéis, objetos binários do Storage, Edge Functions, URL de redirecionamento, chaves do Lovable ou secrets de provedores. O [procedimento manual existente](./manual-backup-free-plan.md) também copia Storage; mantenha-o até haver uma rotina automatizada externa para os arquivos.

## Automação diária opcional

O workflow [`.github/workflows/db-backup.yml`](../../.github/workflows/db-backup.yml) pode executar uma cópia diariamente e enviar os arquivos para um bucket S3 privado fora do Supabase. **Apenas colocar o arquivo no repositório não liga uma cópia automaticamente**: é preciso configurar o bucket, uma função IAM para o GitHub OIDC e os valores abaixo antes de ativar o workflow na `main`.

| Tipo | Nome no GitHub | Finalidade |
| --- | --- | --- |
| Secret | `SUPABASE_DB_URL` | URL do banco operacional, com senha; nunca usar projeto auxiliar. |
| Secret | `AWS_ROLE_TO_ASSUME` | ARN de função IAM com `s3:PutObject` e `s3:GetObject` apenas no prefixo `fluxa-db/` do bucket. |
| Secret | `BACKUP_S3_BUCKET` | Nome do bucket S3 privado com criptografia e bloqueio de acesso público. |
| Variable | `AWS_REGION` | Região AWS do bucket, por exemplo `sa-east-1`. |

Configure a trust policy OIDC da função IAM limitada ao repositório `Tero82teixeira/core-fluxa` e à branch `main`. O workflow usa credenciais temporárias, verifica cada upload pelo tamanho e envia `COMPLETED` por último. Falhas tornam o job vermelho, mas uma execução agendada do GitHub pode atrasar ou nem iniciar em caso de carga alta. Monitore **fora do GitHub** a idade do último conjunto remoto com `COMPLETED` e dispare alerta quando passar de 24 horas. Agende, por exemplo, `17 3 * * *` (UTC), evitando o início exato da hora. Em um servidor próprio, uma entrada equivalente de cron pode executar `bash /caminho/FLUXA/scripts/backup-db.sh` com segredos carregados por um gerenciador seguro e enviar o conjunto ao armazenamento externo.

**RPO alvo: no máximo 24 horas.** Conte a idade desde a conclusão do último backup remoto íntegro, não desde o disparo do cron. Confira os SHA-256 após baixar uma cópia e faça ensaios de restauração em projeto isolado. Mantenha política de retenção, versionamento e criptografia no armazenamento externo. Não grave dumps, arquivos `.sql`, `.sha256` ou URLs com senha no GitHub, em artifacts de Actions ou em pastas públicas.

## Referências

- [Supabase - Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase - Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [PostgreSQL - pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) e [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html)
- [GitHub - agendamentos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) e [OIDC na AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)
