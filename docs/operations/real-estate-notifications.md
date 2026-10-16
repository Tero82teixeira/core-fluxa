# Avisos automáticos da imobiliária

## Ativação

1. No SQL Editor do banco operacional que já atende o FLUXA, execute `docs/operations/real-estate-notifications.sql` completo, como postgres.
2. Publique a atualização no Lovable. Os primeiros avisos elegíveis aparecem no próximo ciclo, em até 15 minutos, na categoria **Imobiliária** da Central de Notificações.

O script também está na migration `20261016180614_real_estate_operational_notifications.sql`. Ambientes que aplicam migrations automaticamente não precisam executar novamente o arquivo manual. A aplicação é idempotente. Se o relógio único estiver ausente, inativo ou com comando inesperado, a transação é cancelada sem alteração parcial.

## Regras

| Pendência | Quando gera aviso | Quem recebe |
| --- | --- | --- |
| Proposta | Aberta ou em contraproposta; novo aviso ao vencer a validade ou revisar as condições | Proprietário, administrador, gestor, operacional e superadmin |
| Contrato | Ativo, já iniciado, com término em até 30 dias ou vencido | Proprietário, administrador, gestor, operacional e superadmin |
| Repasse | Recebido e com previsão anterior à data atual | Proprietário, administrador, gestor, financeiro e superadmin |

Datas seguem o horário de Brasília, como o painel imobiliário. Contratos têm avisos deduplicados por término e faixa: até 30, 15, 7 e 1 dia, no dia do vencimento e após vencer. Não são reenviados a cada ciclo. Repasses têm um aviso por previsão; propostas, por versão e situação da validade. Ler ou arquivar um aviso não causa novo envio.

Somente empresas ativas, da área imobiliária e com o módulo disponível participam. Membros inativos, visualizadores e clientes externos não recebem esses avisos. Cada aviso abre a visão geral filtrada pelo tipo e código do imóvel. Uma pendência resolvida deixa de gerar avisos; os avisos já recebidos continuam no histórico e podem ser arquivados.

## Integração e validação

O mesmo job `core-fluxa-process-due-scheduled-automations` preserva sua frequência, identidade e estado. Seu comando passa a executar uma função privada que chama a definição vigente de `public.run_temporal_automation_cycle()` e acrescenta a consulta imobiliária. As automações de Saúde, Jurídico e Asaas são preservadas. As funções novas são SECURITY INVOKER, executáveis apenas pelo postgres do scheduler. Uma falha na consulta imobiliária gera warning e resultado `real_estate_operational_notifications_created = -1`, preservando o ciclo anterior.

Instalações sem as tabelas imobiliárias retornam zero avisos. Nenhum cadastro, proposta, contrato ou demonstrativo é alterado. A Central mantém suas políticas de leitura por usuário e empresa.

Verificações automáticas: `npm run check`, pgTAP em `supabase/tests/database/085_real_estate_notifications.sql` e o cenário de banco descartável executado por `tests/real-estate-overview.database.mjs`. Esse cenário inclui deduplicação, estados atuais, vencimentos, renovação, pagamento, perfis, módulos, empresas arquivadas, isolamento e falha do scanner.

## Reversão

Execute `docs/operations/real-estate-notifications-rollback.sql` no mesmo banco como postgres. Ele restaura o comando original do relógio e remove somente as duas funções novas. Não remove o schema imobiliário nem avisos já recebidos. Depois reverta a alteração da interface, se necessário.
