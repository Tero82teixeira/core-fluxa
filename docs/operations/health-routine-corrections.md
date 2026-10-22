# Correções da rotina e dos indicadores de Saúde

## Comportamento

O Painel da Clínica consulta Agenda, Autorizações, Contas Médicas e Glosas somente
quando o módulo está explicitamente habilitado e o papel é aceito pela RPC existente.
Uma lista vazia de módulos não habilita Saúde, conforme `health_module_enabled` no
banco. Falhas e carregamentos ficam dentro da seção correspondente. Um erro não
é convertido em saldo zero, lista vazia ou indisponibilidade do painel inteiro.
Dados em cache de módulos desativados não alimentam indicadores nem seções.

As telas de Pacientes, Agenda, Convênios e Autorizações usam permissões próprias
da Saúde. Superadmin, proprietário, administrador, gestor, operacional e
atendimento recebem os controles administrativos já permitidos pelo banco.
Operacional e atendimento continuam sem controles financeiros. Os papéis de
faturamento seguem superadmin/proprietário/administrador/gestor/financeiro e
dependem do módulo correspondente. Não há alteração em permissões globais,
políticas SQL, navegação por papel nem acesso de outras áreas.

O resumo da clínica reutiliza a regra de Contas Médicas: rascunhos são separados
do saldo em aberto, cancelados não entram e recebimentos parciais descontam o
valor recebido. Pacientes com resultado encerrado não ficam nos contadores da
recepção. A lista de atendimentos ativos do painel exclui concluídos.

No Painel de Faturamento, datas civis são preservadas; timestamps são convertidos
para o dia local do navegador, seguindo a apresentação atual das telas. Janelas
de 30/90 dias incluem hoje e os 29/89 dias anteriores, com dias completos e sem
incluir o futuro. Este ano vai de 1º de janeiro até hoje. Todo período conserva
o histórico. Datas inválidas não entram nas janelas limitadas.

Totais, atrasos e agrupamentos do painel consideram somente lotes que saíram de
rascunho e não foram cancelados; glosas canceladas não entram em valores e taxas.
Convênios são agrupados pelo ID, mesmo quando têm o mesmo nome. As taxas mantêm
a definição administrativa existente: recebimento por lotes do período, glosas
por data de recebimento e recuperação dessas glosas; não são análise de coorte.
Contas particulares e recebimentos individuais continuam em Contas Médicas, sem
ser somados novamente ao painel de lotes. O texto da tela explicita esse escopo.

## Entrega e verificação

Não há migration, SQL de ativação, nova dependência, alteração de RPC nem envio de
mensagens. Depois da integração, publicar com **Publish > Update** no Lovable.
A demonstração específica da Saúde e a ficha administrativa do paciente são
etapas seguintes, fora deste pacote.

Testes de regras cobrem papéis/módulos/áreas, saldo, fila, períodos, limites e
timestamps próximos da meia-noite em UTC e America/Sao_Paulo. Testes das páginas
reais renderizadas cobrem recepção, ausência de controles financeiros, módulos
desativados com cache antigo e falhas independentes. O workspace e as respostas
de consulta são simulados; esses testes não confirmam o banco publicado nem a
interação em um aparelho físico. As verificações gerais do repositório e a
pipeline de Supabase permanecem obrigatórias para integrar.
