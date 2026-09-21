import { FormEvent, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWorkspace } from "@/lib/workspace";
import { usePermissions } from "@/lib/permissions";
import { describeError } from "@/lib/errors";
import { maskPhone } from "@/lib/format";
import { useCreateHealthInsurer, useHealthInsurers } from "@/hooks/use-health-insurance";

export const Route = createFileRoute("/_authenticated/saude/convenios")({
  head: () => ({
    meta: [
      { title: "Convênios — FLUXA Saúde" },
      { name: "description", content: "Gestão administrativa de convênios e operadoras." },
    ],
  }),
  component: HealthInsurersPage,
});

function HealthInsurersPage() {
  const { organizationId } = useWorkspace();
  const permissions = usePermissions();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const query = useHealthInsurers(organizationId, debounced);
  const create = useCreateHealthInsurer(organizationId);
  const [form, setForm] = useState({
    name: "",
    registration_code: "",
    contact_phone: "",
    contact_email: "",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300);
    return () => clearTimeout(timer);
  }, [term]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do convênio.");
      return;
    }
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        registration_code: form.registration_code.trim() || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email.trim() || null,
      });
      toast.success("Convênio cadastrado.");
      setForm({ name: "", registration_code: "", contact_phone: "", contact_email: "" });
      setShowForm(false);
    } catch (error) {
      toast.error(describeError(error, "convênio"));
    }
  };

  const rows = query.data ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.8)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-32 size-80 rounded-full bg-teal-400/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-teal-400 text-slate-950 shadow-lg shadow-teal-400/20">
                <Building2 className="size-5.5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-teal-300 uppercase">FLUXA Saúde</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight">Convênios</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Cadastre operadoras, códigos de registro e contatos administrativos para organizar autorizações e faturamento.
            </p>
          </div>
          {permissions.canCreate && (
            <Button
              className="w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100 sm:w-auto"
              onClick={() => setShowForm((value) => !value)}
            >
              <Plus className="size-4" />
              {showForm ? "Fechar cadastro" : "Novo convênio"}
            </Button>
          )}
        </div>
      </header>

      {showForm && permissions.canCreate && (
        <Card className="rounded-2xl border-border/70 shadow-soft">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="insurer-name">Nome do convênio *</Label>
                <Input id="insurer-name" value={form.name} maxLength={140} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="insurer-code">Registro / código</Label>
                <Input id="insurer-code" value={form.registration_code} maxLength={80} onChange={(e) => setForm({ ...form, registration_code: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="insurer-phone">Telefone</Label>
                <Input id="insurer-phone" value={maskPhone(form.contact_phone)} inputMode="numeric" maxLength={15} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="insurer-email">E-mail administrativo</Label>
                <Input id="insurer-email" type="email" value={form.contact_email} maxLength={160} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="size-4 animate-spin" />}
                  {create.isPending ? "Salvando…" : "Salvar convênio"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-border/70 shadow-soft">
        <CardContent className="p-4 sm:p-5">
          <div className="relative mb-4 w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar convênio ou registro" className="rounded-xl pl-9" />
          </div>
          {query.isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando convênios…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Building2 className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Nenhum convênio cadastrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Convênio</TableHead>
                    <TableHead>Registro</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.registration_code || "—"}</TableCell>
                      <TableCell>
                        <div>{row.contact_phone ? maskPhone(row.contact_phone) : "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.contact_email || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          {row.status === "ativo" ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
