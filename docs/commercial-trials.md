# Testes comerciais do Core Fluxa

## Objetivo

Permitir que empresas e profissionais conheçam o sistema por um período
controlado, sem alterar o acesso das organizações que já existiam antes da
implantação comercial.

## Regras

- Organizações existentes são registradas como `active` no plano `legacy`.
- Uma nova organização recebe automaticamente 14 dias no status `trial`.
- O prazo pertence à organização, não a cada usuário convidado.
- Empresas ativas não possuem vencimento automático nesta etapa.
- Testes vencidos e empresas suspensas veem uma tela de bloqueio, mas os dados
  permanecem preservados.
- O estado ausente é tratado como legado ativo durante a janela entre a
  publicação da interface e a aplicação da migration.

## Administração da plataforma

A rota **Administração** é exibida somente quando `is_platform_admin()` confirma
que o usuário está registrado em `platform_admins`.

O administrador pode:

- consultar empresas, responsáveis, quantidade de membros e clientes;
- estender o teste em 7 dias;
- ativar uma empresa para cobrança manual;
- suspender o acesso de outra empresa.

O administrador não pode suspender a organização que está usando para acessar o
painel. Toda alteração comercial gera um registro em `audit_logs`.

## Segurança

- Membros leem somente o estado comercial da própria organização.
- Nenhum cliente pode inserir, atualizar ou excluir assinaturas diretamente.
- A lista global e as alterações comerciais usam RPCs `SECURITY DEFINER` com
  `search_path` restrito e validação de administrador da plataforma.
- A tabela de administradores não é consultável pelo frontend.

## Limite desta etapa

Esta fundação controla teste e liberação manual. Planos definitivos, limites de
uso, cobrança por Pix/cartão, renovação automática e inadimplência serão
implementados depois da página comercial e da validação dos primeiros testes.
