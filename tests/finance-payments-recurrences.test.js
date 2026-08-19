import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, test } from "node:test";
import {
  canManageFinance,
  canReverseFinancialPayment,
  displayedFinancialStatus,
  matchesDisplayedFinancialStatus,
  monthlyCashFlow,
  paymentBalance,
} from "../src/lib/finance.ts";

const route = readFileSync(
  new URL("../src/routes/_authenticated/financeiro.tsx", import.meta.url),
  "utf8",
);
const hook = readFileSync(new URL("../src/hooks/use-finance.ts", import.meta.url), "utf8");
const moduleMigration = readFileSync(
  new URL("../supabase/migrations/20260806120000_financial_module.sql", import.meta.url),
  "utf8",
);
const securityMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260808120000_secure_financial_recurrences.sql",
    import.meta.url,
  ),
  "utf8",
);
const updateMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260808130000_expand_update_financial_recurrence.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("pagamentos financeiros", () => {
  test("fluxo de caixa ignora lançamento pendente sem pagamento", () => {
    assert.deepEqual(monthlyCashFlow([{ id: "pending", type: "income" }], []), []);
  });
  test("recebimento aumenta e pagamento de despesa diminui o caixa", () => {
    assert.deepEqual(
      monthlyCashFlow(
        [
          { id: "income", type: "income" },
          { id: "expense", type: "expense" },
        ],
        [
          { transaction_id: "income", amount: 340, paid_at: "2026-08-05T10:00:00Z" },
          { transaction_id: "expense", amount: 121, paid_at: "2026-08-06T10:00:00Z" },
        ],
      ),
      [{ month: "2026-08", entradas: 340, saidas: 121, fluxo: 219 }],
    );
  });
  test("estorno desfaz o efeito no caixa no mês em que ocorreu", () => {
    assert.deepEqual(
      monthlyCashFlow(
        [{ id: "expense", type: "expense" }],
        [
          {
            transaction_id: "expense",
            amount: 121,
            paid_at: "2026-08-06T10:00:00Z",
            reversed_at: "2026-09-01T10:00:00Z",
          },
        ],
      ),
      [
        { month: "2026-08", entradas: 0, saidas: 121, fluxo: -121 },
        { month: "2026-09", entradas: 121, saidas: 0, fluxo: 121 },
      ],
    );
  });
  test("calcula pagamento parcial e saldo somente com pagamentos confirmados", () => {
    assert.equal(
      paymentBalance(100, [{ amount: 30 }, { amount: 20, reversed_at: "2026-08-08" }]),
      70,
    );
  });
  test("pagamento total usa a RPC de quitação", () =>
    assert.match(hook, /mark_financial_transaction_paid/));
  test("bloqueia valor acima do saldo e valor não positivo", () => {
    assert.match(route, /Number\(amount\) <= 0/);
    assert.match(route, /Number\(amount\) > balance/);
  });
  test("bloqueia paga, cancelada, arquivada e conta inativa", () => {
    assert.match(route, /transaction\.status === "paid"/);
    assert.match(route, /transaction\.status === "cancelled"/);
    assert.match(route, /transaction\.archived_at/);
    assert.match(route, /availableFinancialAccounts/);
  });
  test("histórico exibe detalhes, totais e estado do pagamento", () =>
    [
      "Histórico de pagamentos",
      "Total pago",
      "Total\\s+estornado",
      "Saldo restante",
      "Confirmado",
      "Estornado em",
      "Forma",
      "Observação",
    ].forEach((label) => assert.match(route, new RegExp(label))));
  test("estorno usa RPC e confirmação explícita", () => {
    assert.match(hook, /reverse_financial_payment/);
    assert.match(route, /O estorno desfará a movimentação financeira desta conta/);
    assert.match(route, /canReverse && !p\.reversed_at/);
  });
  test("somente proprietário e administrador podem estornar", () => {
    assert.equal(canReverseFinancialPayment("proprietario"), true);
    assert.equal(canReverseFinancialPayment("administrador"), true);
    assert.equal(canReverseFinancialPayment("gestor"), false);
  });
  test("operacional e visualizador não escrevem", () => {
    assert.equal(canManageFinance("operacional"), false);
    assert.equal(canManageFinance("visualizador"), false);
  });
  test("status aberto vencido é apenas apresentado como atrasado", () => {
    assert.equal(
      displayedFinancialStatus("pending", "2026-08-01", new Date("2026-08-08")),
      "overdue",
    );
    assert.equal(displayedFinancialStatus("paid", "2026-08-01", new Date("2026-08-08")), "paid");
  });
  test("filtro usa o status efetivamente exibido em todas as situações financeiras", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const cases = [
      ["pending", "2026-08-01", "overdue"],
      ["partial", "2026-08-01", "overdue"],
      ["pending", "2026-08-09", "pending"],
      ["partial", "2026-08-09", "partial"],
      ["paid", "2026-08-01", "paid"],
      ["cancelled", "2026-08-01", "cancelled"],
    ];

    for (const [transactionStatus, dueDate, displayedStatus] of cases) {
      assert.equal(
        matchesDisplayedFinancialStatus(transactionStatus, dueDate, displayedStatus, now),
        true,
      );
      for (const otherStatus of ["pending", "partial", "paid", "overdue", "cancelled"]) {
        if (otherStatus !== displayedStatus) {
          assert.equal(
            matchesDisplayedFinancialStatus(transactionStatus, dueDate, otherStatus, now),
            false,
          );
        }
      }
    }
  });
});

describe("recorrências financeiras", () => {
  test("cria, edita, pausa, reativa e gera somente via RPC", () =>
    [
      "create_financial_recurrence",
      "update_financial_recurrence",
      "generate_recurrence_transactions",
      "Nova recorrência",
      "Editar",
      "Pausar",
      "Reativar",
    ].forEach((term) => assert.match(route + hook, new RegExp(term))));
  test("geração continua idempotente", () =>
    assert.match(moduleMigration, /ON CONFLICT\(recurrence_id,recurrence_due_date\) DO NOTHING/));
  test("RPC aditiva suporta e valida todos os campos editáveis", () =>
    [
      "type",
      "frequency",
      "status",
      "amount",
      "interval_count",
      "start_date",
      "end_date",
      "next_run_date",
      "category_id",
      "account_id",
      "client_id",
      "process_id",
      "notes",
    ].forEach((field) => assert.match(updateMigration, new RegExp(field))));
  test("RPC é restrita a authenticated e usa search_path seguro", () => {
    assert.match(updateMigration, /SET search_path = public/);
    assert.match(updateMigration, /REVOKE ALL[\s\S]*PUBLIC, anon/);
    assert.match(updateMigration, /GRANT EXECUTE[\s\S]*authenticated/);
  });
  test("proteção cross-organization do PR 16 permanece presente", () => {
    assert.match(securityMigration, /financial_validate_recurrence_links/);
    assert.match(securityMigration, /organization_id = NEW\.organization_id/);
    assert.doesNotMatch(
      updateMigration,
      /CREATE TRIGGER|CREATE OR REPLACE FUNCTION public\.financial_validate_recurrence_links/,
    );
  });
  test("não há Edge Function nova nem escrita financeira direta no frontend", () => {
    const functionsUrl = new URL("../supabase/functions", import.meta.url);
    const functions = existsSync(functionsUrl) ? readdirSync(functionsUrl) : [];
    assert.deepEqual(functions, []);
    assert.doesNotMatch(
      route + hook,
      /\.from\(["']financial_(?:transaction_payments|account_movements|recurrences)["']\)\.(?:insert|update|upsert|delete)/,
    );
    assert.doesNotMatch(route + hook, /service.role|service_role/i);
  });
});
