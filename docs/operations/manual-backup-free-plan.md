# Backup manual gratuito do FLUXA no Windows

Este procedimento cria uma cópia do banco e dos arquivos do Supabase Storage sem contratar o plano Pro. Ele é manual: deve ser executado **uma vez por semana** e antes de migrations, importações ou alterações importantes.

## Regras de segurança

- Nunca cole connection string, senha ou `service_role` no ChatGPT, Lovable, GitHub, e-mail ou captura de tela.
- Nunca salve o backup dentro da pasta do projeto FLUXA. O repositório é público e o backup pode conter dados de clientes.
- Use um pendrive/HD protegido com BitLocker ou outra unidade criptografada. Uma pasta comum ou ZIP comum não é criptografado.
- Faça a primeira execução somente com dados de teste.
- O script apenas cria a cópia. Ele não apaga nem altera dados do Supabase.

## O que será copiado

| Item                                    | Arquivo/pasta gerado                 |
| --------------------------------------- | ------------------------------------ |
| Papéis e permissões do banco            | `roles.sql`                          |
| Estrutura, funções, políticas e tabelas | `schema.sql`                         |
| Dados do banco                          | `data.sql`                           |
| Arquivos de todos os buckets do Storage | `storage/blobs/`                     |
| Relação entre arquivo original e cópia  | `storage-manifest.json`              |
| Comprovante de integridade              | `checksums.sha256`                   |
| Informações da execução                 | `backup-info.json` e `CONCLUIDO.txt` |

Os arquivos do Storage são guardados pelo hash do conteúdo. O caminho original de cada objeto fica no `storage-manifest.json`, necessário para uma futura restauração.

## Preparação (somente na primeira vez)

1. Instale a versão LTS do [Node.js](https://nodejs.org/).
2. Instale e abra o [Docker Desktop](https://www.docker.com/products/docker-desktop/). A ferramenta oficial da Supabase usa o Docker para gerar uma exportação compatível.
3. Conecte ou crie uma unidade protegida. Neste exemplo ela é `E:\FLUXA_BACKUPS`.
4. No Supabase, abra **Connect** e copie a connection string do banco. Escolha **Session pooler**. Se ela mostrar `[YOUR-PASSWORD]`, substitua localmente pela senha do banco.
5. No Supabase, abra **Project Settings > API**:
   - copie a **Project URL**;
   - revele e copie a chave **service_role** somente no momento da execução.

A `service_role` tem acesso administrativo. Não use a chave `anon` no lugar dela e não deixe a chave salva em arquivo de texto.

## Executar o backup

Abra o **PowerShell** dentro da pasta do projeto e execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup\backup-fluxa.ps1 -OutputRoot "E:\FLUXA_BACKUPS"
```

O script solicitará, com a digitação oculta, a connection string e a `service_role`. A URL do projeto também será solicitada. As credenciais não são gravadas na cópia.

Mantenha o Docker Desktop aberto durante a execução. Na primeira vez, o `npx` pode pedir acesso à internet para obter a ferramenta de linha de comando da Supabase.

Ao terminar, confirme que a pasta criada contém `CONCLUIDO.txt` e não contém `INCOMPLETO.txt`. Se `INCOMPLETO.txt` existir, a cópia não deve ser considerada válida.

## Conferência rápida

1. Abra `backup-info.json` e confira se `fileCount` e `totalBytes` são maiores que zero.
2. Confirme a existência de `roles.sql`, `schema.sql`, `data.sql` e `storage-manifest.json`.
3. Guarde a unidade em local seguro e desconecte-a do computador quando não estiver em uso.
4. Mantenha as quatro cópias semanais mais recentes. Apague uma cópia antiga somente depois de confirmar uma mais nova como `CONCLUIDO`.

## Limitações importantes

- Não é backup automático; esquecer de executar aumenta a possível perda de dados.
- Não oferece restauração para um minuto específico.
- GitHub/Lovable protegem o código, mas não substituem o backup do banco e do Storage.
- Uma restauração deve ser feita primeiro em outro projeto Supabase, nunca diretamente sobre a produção.

O procedimento completo de recuperação está em [backup-and-disaster-recovery.md](./backup-and-disaster-recovery.md).
