# Imobiliária V5 — Comissões e repasses

Demonstrativos gerenciais vinculados aos contratos. O sistema calcula a comissão e o valor líquido do proprietário; o usuário confirma recebimentos e repasses que já aconteceram. Não executa transferência bancária, cobrança, emissão fiscal nem lançamento automático no Financeiro.

## Uso e regras

Em **Imóveis → Comissões e repasses**, consulte todos os demonstrativos da empresa. O botão de cada imóvel limita a consulta àquele imóvel.

1. Escolha **Registrar demonstrativo** e um contrato ativo ou encerrado, com proprietário cadastrado e ativo. Contratos cancelados não são elegíveis.
2. Confira o proprietário mostrado: ele será o beneficiário registrado. O vínculo usa o proprietário visível do imóvel naquele registro, não um histórico de titularidade. Se o proprietário mudou, confirme a atribuição antes de registrar; os demonstrativos anteriores mantêm o beneficiário original.
3. Informe valor bruto, comissão percentual (0–100%) ou fixa (até o bruto), previsão do repasse e confirmação. O valor sugerido vem da última versão do contrato; pode ser ajustado explicitamente para o recebimento em questão.
4. Na locação, referência é a competência `YYYY-MM`, entre os meses de início e término. Para contrato encerrado, o último mês permitido também fica limitado ao mês do encerramento. Na venda, use uma referência como `VENDA-001`.
5. Após receber integralmente, confirme **Recebimento**, data real e observação. O valor líquido passa a **Repasse pendente**. Depois de pagar o proprietário, confirme **Repasse** com data igual ou posterior ao recebimento, nunca futura. As operações ficam no histórico com autor e versão.

Valores e vínculos são imutáveis. Uma previsão incorreta pode ser cancelada com motivo e substituída na mesma competência; recebimentos e repasses confirmados não podem ser cancelados nesta versão. Não oferece parcelas, pagamentos parciais, estornos, divisão entre corretores ou múltiplos proprietários.

Uma referência não cancelada por contrato evita duplicação. Os valores usam centavos com arredondamento da comissão percentual. Recebimentos pendentes de repasse, cuja previsão já passou, aparecem em atraso. Datas usam America/Sao_Paulo. Indicadores somam todos os demonstrativos do escopo empresa/imóvel e não apenas a página ou filtro exibido. Comissão recebida inclui demonstrativos recebidos e já repassados.

## Instalação e validação

Base: `7bc6278cb9fea607bb837f7076bac3b602b9ad14`, incluindo contratos da PR #295 e demo/idiomas posteriores. Alvo operacional: Lovable Cloud `nobtbymxudlcsyurbopl`, com Imobiliária V1–V4 instaladas. O Supabase próprio `dysjefzfcbpxtzvjkwyi` não é alvo desta entrega.

SQL transacional reaplicável: `real-estate-settlements.sql`. Segue a instalação manual dos pacotes imobiliários anteriores, fora das migrations oficiais até reconciliação da fundação com o histórico. Não usar db push ou alterar migrations antigas. Após PR e CI quality/validate aprovados: integrar, aplicar SQL pelo conector Lovable, executar `real-estate-settlements-verify.sql`, testar operações fictícias em transação revertida, sincronizar e publicar.

As duas tabelas têm RLS, SELECT/INSERT autorizados, sem UPDATE/DELETE para authenticated e sem acesso anon. Escrita para superadmin, proprietário, administrador, gestor e financeiro; operacional, atendimento e visualizador apenas consultam; cliente externo e outra empresa não têm acesso. O financeiro continua sem permissão de editar imóveis. Todas as funções públicas são SECURITY INVOKER com search_path fixo; auditoria privada, não executável diretamente, registra metadados sem valores financeiros. Triggers validam também INSERT direto, autor, horário e transições.

Trava transacional por imóvel compartilhada com propostas/contratos, versões esperadas e UUID do pedido protegem decisões e repetição idêntica. O proprietário é um snapshot de leitura sujeito à conferência explícita, sem bloquear edições de cadastro. Sem teste de carga multiconexão nesta entrega.

Verificação: testes de valores/calendário/perfis, SQL PGlite 0.5.8 (cálculo, duplicação, repetição, versão, datas, transições, encerramento, cancelamento, paginação, RLS e ausência de edição do imóvel pelo financeiro), suíte existente, tipos, lint e build. CI instala PGlite fora do produto.

Teste de tela em dados fictícios: registrar bruto R$ 1.600 e comissão 10% (R$ 160; proprietário R$ 1.440); confirmar recebimento e repasse; conferir três etapas após F5. Em outro demonstrativo previsto, cancelar com motivo e conferir filtro. Não confirmar recebimento/pagamento real apenas para testar.

Migração do Lovable e backup automático permanecem pausados e fora desta entrega.
