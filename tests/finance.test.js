import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  availableFinancialAccounts,
  availableFinancialCategories,
  brDate,
  brl,
  canManageFinance,
  financialBuckets,
  financialCsv,
  canReverseFinancialPayment,
  displayFinancialStatus,
  paymentTotals,
  validateFinancialPayment,
} from "../src/lib/finance.ts";

const route = readFileSync(
  new URL("../src/routes/_authenticated/financeiro.tsx", import.meta.url),
  "utf8",
);
const hook = readFileSync(new URL("../src/hooks/use-finance.ts", import.meta.url), "utf8");
const structures = readFileSync(
  new URL("../src/components/finance/financial-structures.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260806120000_financial_module.sql", import.meta.url),
  "utf8",
);
describe("módulo financeiro", () => {
  test("ativa rota autenticada sem estado em breve", () => {
    assert.match(route, /\/_authenticated\/financeiro/);
    assert.doesNotMatch(route, /ComingSoon|em breve/i);
  });
  test("formata Real e data pt-BR", () => {
    assert.equal(brl(1234.56), "R$ 1.234,56");
    assert.equal(brDate("2026-08-06"), "06/08/2026");
  });
  test("classifica vencidos e próximos vencimentos", () => {
    assert.equal(financialBuckets("2026-08-01", "pending", new Date("2026-08-06")).overdue, true);
    assert.equal(financialBuckets("2026-08-12", "pending", new Date("2026-08-06")).in7, true);
    assert.equal(financialBuckets("2026-08-30", "pending", new Date("2026-08-06")).in30, true);
  });
  test("não considera pagos vencidos", () =>
    assert.equal(financialBuckets("2026-08-01", "paid", new Date("2026-08-06")).overdue, false));
  test("CSV tem BOM, ponto e vírgula e escapa aspas", () => {
    const csv = financialCsv([{ nome: 'A "B"', valor: brl(1) }]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /;|A ""B""/);
  });
  test("consulta fontes reais isoladas por organização", () => {
    assert.match(hook, /eq\("organization_id",organizationId\)/);
    assert.doesNotMatch(route + hook, /mock|faker|service_role/i);
  });
  test("dashboard, gráficos, filtros, paginação e estados acessíveis", () =>
    [
      "Saldo atual",
      "Resultado do mês",
      "Receitas x despesas",
      "Despesas por categoria",
      "Contas a receber por status",
      "Carregando dados financeiros reais",
      "Nenhum lançamento encontrado",
      "Página",
      "Buscar lançamento",
    ].forEach((x) => assert.match(route, new RegExp(x))));
  test("protege o primeiro render enquanto os dados financeiros estão indisponíveis", () => {
    const loading = route.search(/if\s*\(query\.isLoading\s*\|\|\s*!query\.data\)/);
    const dashboard = route.indexOf("<FinanceDashboard");
    assert.ok(loading > 0);
    assert.ok(dashboard > loading);
    assert.match(route, /data=\{query\.data\}/);
  });
  test("tabelas têm RLS e não há policy irrestrita", () => {
    assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 6);
    assert.doesNotMatch(migration, /USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)/i);
  });
  test("valores zero e negativos são rejeitados", () =>
    assert.ok((migration.match(/CHECK\(amount>0\)/g) || []).length >= 3));
  test("organização é imutável e vínculos cruzados são rejeitados", () =>
    [
      "ORGANIZATION_IMMUTABLE",
      "INVALID_CLIENT_ORGANIZATION",
      "INVALID_PROCESS_ORGANIZATION",
      "INVALID_TASK_ORGANIZATION",
      "INVALID_DOCUMENT_ORGANIZATION",
      "INVALID_RESPONSIBLE_ORGANIZATION",
    ].forEach((x) => assert.match(migration, new RegExp(x))));
  test("pagamento usa locks, limita saldo, atualiza status e conta", () =>
    [
      "FOR UPDATE",
      "PAYMENT_EXCEEDS_BALANCE",
      "'partial'",
      "'paid'",
      "current_balance=newbal",
      "paid_at",
    ].forEach((x) => assert.match(migration, new RegExp(x))));
  test("pagamento cancelado ou arquivado é impedido e estorno existe", () =>
    ["TRANSACTION_NOT_PAYABLE", "reverse_financial_payment", "reversed_at", "'reversal'"].forEach(
      (x) => assert.match(migration, new RegExp(x)),
    ));
  test("recorrência deduplica e avança próxima execução", () =>
    [
      "UNIQUE\\(recurrence_id,recurrence_due_date\\)",
      "ON CONFLICT\\(recurrence_id,recurrence_due_date\\) DO NOTHING",
      "next_run_date=run_date",
    ].forEach((x) => assert.match(migration, new RegExp(x))));
  test("RPCs exigem autenticação, papel e auditam", () =>
    ["auth\\.uid\\(\\) IS NULL", "has_org_role", "financial_audit"].forEach((x) =>
      assert.match(migration, new RegExp(x)),
    ));
  test("PUBLIC e anon revogados e DELETE físico indisponível", () => {
    assert.match(migration, /REVOKE EXECUTE[\s\S]*PUBLIC, anon/);
    assert.match(migration, /REVOKE DELETE[\s\S]*authenticated,PUBLIC,anon/);
  });
  test("não adiciona Edge Function, serviço externo ou segredo", () =>
    assert.doesNotMatch(
      migration + route + hook,
      /https?:\/\/|SUPABASE_SERVICE_ROLE|service.role|edge function/i,
    ));
  test("migration não usa financeiro como app_role", () =>
    assert.doesNotMatch(migration, /['"]financeiro['"][^\n]*::public\.app_role/));
  test("todos os app_role financeiros pertencem ao domínio autorizado", () => {
    const allowed = new Set([
      "proprietario",
      "administrador",
      "gestor",
      "operacional",
      "visualizador",
    ]);
    const lists = [...migration.matchAll(/ARRAY\[([^\]]+)\]::public\.app_role\[\]/g)];
    for (const list of lists)
      for (const role of list[1].matchAll(/'([^']+)'/g))
        assert.ok(allowed.has(role[1]), `papel inesperado: ${role[1]}`);
  });
  test("UUIDs opcionais vazios são convertidos em NULL antes do cast", () =>
    [
      "category_id",
      "account_id",
      "client_id",
      "process_id",
      "task_id",
      "document_id",
      "responsible_user_id",
    ].forEach((field) =>
      assert.match(migration, new RegExp(`NULLIF\\(_payload->>'${field}',''\\)::uuid`)),
    ));
  test("datas opcionais vazias são convertidas em NULL antes do cast", () =>
    ["competence_date", "end_date", "next_run_date"].forEach((field) =>
      assert.match(migration, new RegExp(`NULLIF\\(_payload->>'${field}',''\\)::date`)),
    ));
  test("campos obrigatórios possuem rejeições controladas", () =>
    [
      "DESCRIPTION_REQUIRED",
      "INVALID_TRANSACTION_TYPE",
      "INVALID_AMOUNT",
      "DUE_DATE_REQUIRED",
      "NAME_REQUIRED",
      "INVALID_FREQUENCY",
      "START_DATE_REQUIRED",
    ].forEach((code) => assert.match(migration, new RegExp(`RAISE EXCEPTION '${code}'`))));
  test("operacional e visualizador não recebem escrita financeira", () => {
    const editor = migration.match(/financial_assert_editor[\s\S]*?END\$\$/)?.[0] ?? "";
    assert.doesNotMatch(editor, /'operacional'|'visualizador'/);
    assert.doesNotMatch(migration, /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*financial_/i);
  });
  test("proprietário, administrador e gestor recebem gestão na UI", () => {
    assert.equal(canManageFinance("proprietario"), true);
    assert.equal(canManageFinance("administrador"), true);
    assert.equal(canManageFinance("gestor"), true);
    assert.match(structures, /Nova categoria/);
    assert.match(structures, /Nova conta/);
  });
  test("visualizador e operacional não recebem controles de escrita", () => {
    assert.equal(canManageFinance("visualizador"), false);
    assert.equal(canManageFinance("operacional"), false);
    assert.match(structures, /editable && <CategoryDialog/);
    assert.match(structures, /editable && <AccountDialog/);
  });
  test("gestão de categorias usa somente as RPCs financeiras", () =>
    [
      "create_financial_category",
      "update_financial_category",
      "set_financial_category_active",
      "archive_financial_category",
    ].forEach((rpc) => assert.match(structures, new RegExp(rpc))));
  test("gestão de contas usa somente as RPCs financeiras", () =>
    [
      "create_financial_account",
      "update_financial_account",
      "set_financial_account_active",
      "archive_financial_account",
    ].forEach((rpc) => assert.match(structures, new RegExp(rpc))));
  test("saldo inicial aceita zero e bloqueia negativo", () => {
    assert.match(structures, /balance >= 0/);
    assert.match(structures, /min="0"/);
    assert.match(structures, /saldo inicial não pode ser negativo/i);
  });
  test("saldo atual é exibido, mas nunca enviado para edição", () => {
    assert.match(structures, /current_balance/);
    const updatePayload = structures.match(/const payload = row \?[\s\S]*?: \{/i)?.[0] ?? "";
    assert.doesNotMatch(updatePayload, /current_balance/);
  });
  test("categorias são filtradas pelo tipo do lançamento", () => {
    const rows = [
      { id: "i", name: "I", type: "income", is_active: true },
      { id: "e", name: "E", type: "expense", is_active: true },
      { id: "b", name: "B", type: "both", is_active: true },
    ];
    assert.deepEqual(
      availableFinancialCategories(rows, "income").map((x) => x.id),
      ["i", "b"],
    );
    assert.deepEqual(
      availableFinancialCategories(rows, "expense").map((x) => x.id),
      ["e", "b"],
    );
  });
  test("categoria inativa ou arquivada não aparece no lançamento", () => {
    const rows = [
      { id: "ok", name: "Ok", type: "both", is_active: true },
      { id: "off", name: "Off", type: "income", is_active: false },
      { id: "old", name: "Old", type: "income", is_active: true, archived_at: "2026-01-01" },
    ];
    assert.deepEqual(
      availableFinancialCategories(rows, "income").map((x) => x.id),
      ["ok"],
    );
  });
  test("conta inativa ou arquivada não aparece no lançamento", () => {
    const rows = [
      {
        id: "ok",
        name: "Ok",
        type: "bank",
        is_active: true,
        current_balance: 0,
        initial_balance: 0,
      },
      {
        id: "off",
        name: "Off",
        type: "cash",
        is_active: false,
        current_balance: 0,
        initial_balance: 0,
      },
      {
        id: "old",
        name: "Old",
        type: "other",
        is_active: true,
        current_balance: 0,
        initial_balance: 0,
        archived_at: "2026-01-01",
      },
    ];
    assert.deepEqual(
      availableFinancialAccounts(rows).map((x) => x.id),
      ["ok"],
    );
  });
  test("sucesso invalida a consulta financeira da organização", () =>
    assert.match(hook, /invalidateQueries\(\{queryKey:\["finance",organizationId\]\}\)/));
  test("frontend não escreve diretamente nas tabelas financeiras", () =>
    assert.doesNotMatch(
      hook + route + structures,
      /\.from\("financial_[^\n]+\.(?:insert|update)\(/,
    ));
  test("pagamentos parciais, quitação e bloqueios são calculados com segurança", () => {
    const tx = { amount: 100, status: "pending" };
    assert.deepEqual(paymentTotals(100, [{ amount: 30 }]), { original: 100, paid: 30, reversed: 0, remaining: 70 });
    assert.equal(validateFinancialPayment(tx, [{ amount: 30 }], 70), null);
    assert.equal(validateFinancialPayment(tx, [{ amount: 30 }], 71), "PAYMENT_EXCEEDS_BALANCE");
    assert.equal(validateFinancialPayment({ ...tx, status: "paid" }, [], 1), "TRANSACTION_NOT_PAYABLE");
    assert.equal(validateFinancialPayment({ ...tx, status: "cancelled" }, [], 1), "TRANSACTION_NOT_PAYABLE");
  });
  test("histórico preserva pagos, estornados e saldo", () => assert.deepEqual(paymentTotals(100, [{ amount: 60 }, { amount: 40, reversed_at: "2026-08-08" }]), { original: 100, paid: 60, reversed: 40, remaining: 40 }));
  test("permissões de estorno são restritas", () => {
    assert.equal(canReverseFinancialPayment("proprietario"), true); assert.equal(canReverseFinancialPayment("administrador"), true);
    for (const role of ["gestor", "operacional", "visualizador"]) assert.equal(canReverseFinancialPayment(role), false);
  });
  test("status vencido é apenas apresentação", () => assert.equal(displayFinancialStatus("partial", "2026-08-01", new Date("2026-08-08")), "overdue"));
  test("interface reutiliza RPCs para pagamentos, estorno e recorrências", () => ["register_partial_payment","mark_financial_transaction_paid","reverse_financial_payment","create_financial_recurrence","update_financial_recurrence","generate_recurrence_transactions"].forEach(rpc=>assert.match(route+hook,new RegExp(rpc))));
  test("estorno preserva histórico, reverte saldo, status e paid_at", () => ["reversed_at=now()","current_balance=newbal","WHEN total=0 THEN 'pending' ELSE 'partial'","paid_at=NULL"].forEach(value=>assert.match(migration,new RegExp(value))));
  test("recorrências cobrem frequências, deduplicação e encerramento", () => ["'weekly'","'monthly'","'quarterly'","make_interval\\(years","ON CONFLICT","next_run_date=run_date","'finished'"].forEach(value=>assert.match(migration,new RegExp(value))));
});
