# Imobiliária V4 — Contratos e vencimentos

Registra um contrato a partir de uma proposta aceita e acompanha prazos de venda ou locação. A criação é confirmada pelo usuário: o aceite da proposta não cria contrato sozinho. O registro é gerencial; não gera documento ou assinatura, cobrança, comissão, mensagens ou mudança automática do status do imóvel.

## Uso

Em **Imóveis**, o botão **Contratos e vencimentos** do cabeçalho mostra todos os contratos da empresa. O mesmo botão em cada imóvel abre a lista daquele imóvel e permite registrar contrato.

1. Aceite uma proposta em **Propostas e negociações**.
2. No imóvel, abra **Contratos e vencimentos → Registrar contrato**. Escolha a proposta aceita. Valor e condições vêm da proposta e não podem ser alterados no registro inicial.
3. Informe referência única na empresa (ex.: `CT-001`), início, término e confirmação do documento conferido. Na locação o término é obrigatório e o valor é mensal; na venda o término é opcional.
4. Consulte os filtros **Em acompanhamento**, **Início futuro**, **Vence em até 30 dias**, **Prazo vencido**, **Encerrado** ou **Cancelado**. O prazo usa America/Sao_Paulo e inclui o último dia. Os indicadores são calculados na consulta, sem novo cron ou alterações automáticas do histórico.
5. Abra **Ver contrato e histórico**. Uma locação em acompanhamento pode ser renovada com término posterior ao atual, mantendo o início. Valor e condições podem ser ajustados explicitamente na renovação; as versões anteriores permanecem visíveis.
6. Encerramento e cancelamento exigem motivo e preservam os termos e datas anteriores. Contratos encerrados ou cancelados não reabrem. Uma proposta só pode originar um contrato; após cancelamento, uma nova negociação deve originar um novo contrato.

Uma proposta com contrato em acompanhamento não pode ser cancelada antes de encerrar/cancelar seu contrato. Um prazo vencido não encerra sozinho o contrato nem libera outro contrato para a mesma finalidade do imóvel. A referência é imutável após o registro. Aceite cuja validade já passou continua sendo um aceite: o prazo da negociação não é o prazo do contrato.

## Instalação controlada

Base confirmada: `1631f5050ea69269a00ec199c611c8ec58587629`, PR #294. Aplicar somente sobre Imobiliária V1, V2 e V3 instaladas no banco operacional do Lovable, `nobtbymxudlcsyurbopl`. O projeto próprio `dysjefzfcbpxtzvjkwyi` não é o alvo desta entrega.

Este SQL segue os pacotes manuais de Imobiliária já aplicados: `docs/operations/real-estate-contracts.sql`. Não é colocado no diretório de migrations oficial enquanto a fundação desses pacotes não estiver reconciliada com o histórico local; isso evita um reset local que dependa de tabelas ausentes. O CI exercita a fundação e os quatro pacotes em PostgreSQL embarcado independente do schema oficial. Não alterar migrations antigas nem usar `db push`.

Sequência: revisar PR, aguardar `quality` e `validate`, integrar; aplicar SQL transacional no Lovable pelo mecanismo suportado; executar `real-estate-contracts-verify.sql`; confirmar sincronização do commit e publicar. Na operação assistida, estes passos podem ser executados pelo assistente com autorização explícita. O SQL não apaga nem atualiza dados existentes, e a reaplicação preserva os contratos.

## Segurança e verificação

As duas tabelas novas usam RLS e SELECT/INSERT para perfis autorizados. Anônimo e cliente externo não têm acesso; usuários de outra empresa não veem os registros. Autenticados não podem editar ou apagar os registros históricos. Escrita segue os cinco perfis de imóveis; leitura segue os oito perfis internos. Todas as RPCs públicas são SECURITY INVOKER com search_path fixo. O trigger privado de auditoria tem execução direta revogada e registra apenas metadados.

Os vínculos incluem organização/imóvel/proposta/versão aceita. Triggers validam INSERT direto, definem autor/horário, verificam transições, valores, datas e exclusividade. Contratos e propostas compartilham a trava transacional por imóvel. UUID do pedido permite repetição idêntica sem duplicação; versão esperada evita sobrescrever uma decisão mais recente. Sem teste de carga multiconexão nesta entrega.

Validação local: TypeScript, lint, suíte existente, build e `tests/real-estate-contracts.database.mjs` com PGlite 0.5.8. O CI instala a dependência de teste fora do produto e executa o teste SQL.

Teste de tela em registros fictícios: criar contrato de locação de proposta aceita, conferir F5 e histórico, renovar com novo término/valor, filtrar vencimentos, tentar salvar em duas abas sobre versão antiga, encerrar com motivo e conferir leitura no celular. Contrato de venda não oferece renovação. Não cadastrar contrato real apenas para testar. Publicação e verificações de schema não substituem esta conferência funcional.

Backup automático e migração do Lovable continuam fora desta entrega e não são ativados.
