import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useWorkspace } from "@/lib/workspace";
import { useCreateClient } from "@/hooks/use-operations";
import { DEMO_MODE } from "@/lib/demo";
import { notifyDemoAction } from "@/components/shared/demo-notice";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/clientes/novo")({
  head: () => ({
    meta: [
      { title: "Novo cliente — FLUXA" },
      { name: "description", content: "Cadastre um novo cliente na base da empresa." },
      { property: "og:title", content: "Novo cliente — FLUXA" },
      { property: "og:description", content: "Cadastre um novo cliente na base da empresa." },
    ],
  }),
  component: NewClient,
});

function NewClient() {
  const navigate = useNavigate();
  const { organizationId, user } = useWorkspace();
  const createClient = useCreateClient(organizationId, user?.id);
  const [form, setForm] = useState({ name: "", document: "", email: "", phone: "", city: "", state: "" });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (DEMO_MODE) {
      // TODO(supabase): cadastro real será habilitado com o banco conectado.
      notifyDemoAction("Cadastro de cliente");
      return;
    }
    try {
      const created = await createClient.mutateAsync({
        name: form.name.trim(),
        document: form.document.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        person_type: form.document.replace(/\D/g, "").length > 11 ? "pj" : "pf",
        status: "ativo",
      });
      toast.success("Cliente cadastrado.");
      navigate({ to: "/clientes/$clientId", params: { clientId: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar cliente.");
    }
  };


  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold">Novo cliente</h2>
          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Nome / Razão social</Label>
              <Input id="name" required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="document">CPF / CNPJ</Label>
              <Input id="document" maxLength={20} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" maxLength={255} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">UF</Label>
              <Input id="state" maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createClient.isPending}>
                {createClient.isPending ? "Salvando…" : "Salvar cliente"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
