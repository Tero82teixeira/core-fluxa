# Demonstração pública da advocacia

URL: `/demo?area=legal`, sem autenticação, com dados locais e fictícios.

O Painel Jurídico combina prazos gerais e individuais abertos, distingue as origens e limita apenas a prévia. A Agenda Jurídica apresenta dia/semana, totais do período e páginas de 20 compromissos. A ficha permite simular conclusão/reabertura de prazo ou processo e alteração de audiência. O estado é compartilhado entre painel, agenda, processos e as tarefas da demonstração, apenas nesta aba; recarregar ou trocar de área reinicia os exemplos.

A referência fixa é 18/10/2026, identificada nas telas, para manter os exemplos estáveis. Datas/horários são ilustrativos, sem consulta aos tribunais, cálculo de prazos ou validade do CNJ. Não chama Supabase, funções da área interna nem APIs externas. Nenhum SQL novo é necessário.

PT/EN/ES mantêm as mesmas chaves. No celular, o menu jurídico fica em uma grade e os registros em cartões; ações principais têm pelo menos 44px de altura.

Verificação: funções puras testam contadores, paginação, fechamento/reabertura e mudança de audiência; o teste de renderização usa os componentes reais nos três idiomas e confere as páginas e os totais depois da simulação. Os testes também restringem dependências de produção.
