import { useState } from "react";
import { Archive, Loader2, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brl, type FinancialAccount, type FinancialCategory } from "@/lib/finance";

type Action = {
  isPending: boolean;
  mutateAsync: (input: { rpc: string; payload: Record<string, unknown> }) => Promise<unknown>;
};

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const categoryTypes = [
  ["income", "Receita"],
  ["expense", "Despesa"],
  ["both", "Receita e Despesa"],
] as const;
const accountTypes = [
  ["cash", "Caixa"],
  ["bank", "Banco"],
  ["digital_wallet", "Carteira digital"],
  ["other", "Outro"],
] as const;
const categoryLabel = Object.fromEntries(categoryTypes);
const accountLabel = Object.fromEntries(accountTypes);
const structureRpcs = {
  category: { active: "set_financial_category_active", archive: "archive_financial_category" },
  account: { active: "set_financial_account_active", archive: "archive_financial_account" },
} as const;

async function run(action: Action, rpc: string, payload: Record<string, unknown>, success: string) {
  try {
    await action.mutateAsync({ rpc, payload });
    toast.success(success);
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    return false;
  }
}

export function CategoriesManager({
  rows,
  editable,
  action,
}: {
  rows: FinancialCategory[];
  editable: boolean;
  action: Action;
}) {
  const visible = rows.filter((row) => !row.archived_at);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Categorias</CardTitle>
        {editable && <CategoryDialog action={action} />}
      </CardHeader>
      <CardContent>
        {!visible.length ? (
          <p className="py-6 text-center text-muted-foreground">Nenhuma categoria cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr>
                  {["Nome", "Tipo", "Status", "Descrição", "Ações"].map((label) => (
                    <th className="p-2 text-left" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td className="p-2 font-medium">
                      <span
                        className="mr-2 inline-block size-3 rounded-full"
                        style={{ backgroundColor: row.color || "#94a3b8" }}
                      />
                      {row.name}
                    </td>
                    <td className="p-2">{categoryLabel[row.type]}</td>
                    <td className="p-2">{row.is_active ? "Ativa" : "Inativa"}</td>
                    <td className="max-w-xs p-2 text-muted-foreground">{row.description || "—"}</td>
                    <td className="p-2">
                      {editable && <StructureActions kind="category" row={row} action={action} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AccountsManager({
  rows,
  editable,
  action,
}: {
  rows: FinancialAccount[];
  editable: boolean;
  action: Action;
}) {
  const visible = rows.filter((row) => !row.archived_at);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Contas</CardTitle>
        {editable && <AccountDialog action={action} />}
      </CardHeader>
      <CardContent>
        {!visible.length ? (
          <p className="py-6 text-center text-muted-foreground">Nenhuma conta cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  {["Nome", "Tipo", "Saldo atual", "Status", "Descrição", "Ações"].map((label) => (
                    <th className="p-2 text-left" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr className="border-t" key={row.id}>
                    <td className="p-2 font-medium">{row.name}</td>
                    <td className="p-2">{accountLabel[row.type]}</td>
                    <td className="p-2 font-medium">{brl(Number(row.current_balance))}</td>
                    <td className="p-2">{row.is_active ? "Ativa" : "Inativa"}</td>
                    <td className="max-w-xs p-2 text-muted-foreground">{row.description || "—"}</td>
                    <td className="p-2">
                      {editable && <StructureActions kind="account" row={row} action={action} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryDialog({ action, row }: { action: Action; row?: FinancialCategory }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: row?.name ?? "",
    type: row?.type ?? "income",
    description: row?.description ?? "",
    color: row?.color ?? "#2563eb",
  });
  const valid = form.name.trim().length > 0;
  const save = async () => {
    const rpc = row ? "update_financial_category" : "create_financial_category";
    const ok = await run(
      action,
      rpc,
      { ...(row && { id: row.id }), ...form, name: form.name.trim() },
      row ? "Categoria atualizada." : "Categoria criada.",
    );
    if (ok) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={row ? "sm" : "default"} variant={row ? "outline" : "default"}>
          {row ? (
            <>
              <Pencil />
              Editar
            </>
          ) : (
            <>
              <Plus />
              Nova categoria
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Editar categoria" : "Nova categoria"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Label>
            Nome
            <Input
              autoFocus
              maxLength={120}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Label>
          <Label>
            Tipo
            <select
              className={selectClass}
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value as FinancialCategory["type"] })
              }
            >
              {categoryTypes.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Label>
          <Label>
            Descrição
            <Textarea
              maxLength={500}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Label>
          <Label>
            Cor
            <Input
              aria-label="Cor"
              type="color"
              value={form.color}
              onChange={(event) => setForm({ ...form, color: event.target.value })}
            />
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={!valid || action.isPending} onClick={save}>
            {action.isPending && <Loader2 className="animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({ action, row }: { action: Action; row?: FinancialAccount }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: row?.name ?? "",
    type: row?.type ?? "cash",
    description: row?.description ?? "",
    initial_balance: row ? String(row.initial_balance) : "0",
  });
  const balance = Number(form.initial_balance);
  const valid = form.name.trim().length > 0 && Number.isFinite(balance) && balance >= 0;
  const save = async () => {
    const rpc = row ? "update_financial_account" : "create_financial_account";
    // The update RPC intentionally receives neither initial_balance nor current_balance.
    const payload = row
      ? { id: row.id, name: form.name.trim(), type: form.type, description: form.description }
      : { ...form, name: form.name.trim(), initial_balance: balance };
    const ok = await run(action, rpc, payload, row ? "Conta atualizada." : "Conta criada.");
    if (ok) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={row ? "sm" : "default"} variant={row ? "outline" : "default"}>
          {row ? (
            <>
              <Pencil />
              Editar
            </>
          ) : (
            <>
              <Plus />
              Nova conta
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Editar conta" : "Nova conta"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Label>
            Nome
            <Input
              autoFocus
              maxLength={120}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Label>
          <Label>
            Tipo
            <select
              className={selectClass}
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value as FinancialAccount["type"] })
              }
            >
              {accountTypes.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Label>
          <Label>
            Descrição
            <Textarea
              maxLength={500}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Label>
          {!row && (
            <Label>
              Saldo inicial
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.initial_balance}
                onChange={(event) => setForm({ ...form, initial_balance: event.target.value })}
              />
              {balance < 0 && (
                <span className="text-sm text-destructive">
                  O saldo inicial não pode ser negativo.
                </span>
              )}
            </Label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={!valid || action.isPending} onClick={save}>
            {action.isPending && <Loader2 className="animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StructureActions({
  kind,
  row,
  action,
}: {
  kind: "category" | "account";
  row: FinancialCategory | FinancialAccount;
  action: Action;
}) {
  const noun = kind === "category" ? "categoria" : "conta";
  const rpcs = structureRpcs[kind];
  const changeActive = () =>
    run(
      action,
      rpcs.active,
      { id: row.id, is_active: !row.is_active },
      `${noun === "conta" ? "Conta" : "Categoria"} ${row.is_active ? "desativada" : "ativada"}.`,
    );
  const archive = () =>
    run(
      action,
      rpcs.archive,
      { id: row.id, confirmed: true },
      `${noun === "conta" ? "Conta" : "Categoria"} arquivada.`,
    );
  return (
    <div className="flex flex-wrap gap-2">
      {kind === "category" ? (
        <CategoryDialog row={row as FinancialCategory} action={action} />
      ) : (
        <AccountDialog row={row as FinancialAccount} action={action} />
      )}
      <Button size="sm" variant="outline" disabled={action.isPending} onClick={changeActive}>
        <Power />
        {row.is_active ? "Desativar" : "Ativar"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={action.isPending}>
            <Archive />
            Arquivar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar {noun}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove “{row.name}” das opções de novos lançamentos. Os registros anteriores
              serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={archive}>Confirmar arquivamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
