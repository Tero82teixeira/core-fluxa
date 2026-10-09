import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/lib/workspace";
import { usePropertyOptions, type PropertyRow } from "@/hooks/use-real-estate";
import { usePropertyActivity, useSaveActivity } from "@/hooks/use-real-estate-activity";
import { canWriteProperties } from "@/lib/real-estate";
import {
  INTEREST_STATUSES,
  VISIT_STATUSES,
  activityError,
  interestSchema,
  visitSchema,
  localVisitDate,
  toLocalVisitDate,
  type InterestRow,
  type VisitRow,
} from "@/lib/real-estate-activity";
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";
function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function options(values: Record<string, string>) {
  return Object.entries(values).map(([value, label]) => (
    <option value={value} key={value}>
      {label}
    </option>
  ));
}
function visitTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
type Form = {
  client_id: string;
  purpose: "venda" | "locacao";
  status: string;
  responsible_user_id: string;
  notes: string;
  interest_id: string;
  starts_at: string;
  ends_at: string;
  outcome: string;
};
export function PropertyActivity({
  property,
  onClose,
}: {
  property: PropertyRow;
  onClose: () => void;
}) {
  const { organizationId, role } = useWorkspace();
  const writable = canWriteProperties(role);
  const [kind, setKind] = useState<"interests" | "visits">("interests");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const query = usePropertyActivity(organizationId, property.id, kind, status, page, true);
  const opts = usePropertyOptions(organizationId, true);
  const save = useSaveActivity(organizationId, property.id);
  const [editing, setEditing] = useState<{
    kind: "interest" | "visit";
    id: string;
    version: number | null;
    label?: string;
  } | null>(null);
  const empty = (): Form => ({
    client_id: "",
    purpose: property.purpose === "locacao" ? "locacao" : "venda",
    status: "novo",
    responsible_user_id: property.responsible_user_id || "",
    notes: "",
    interest_id: "",
    starts_at: "",
    ends_at: "",
    outcome: "",
  });
  const [form, setForm] = useState<Form>(empty);
  const change = (key: keyof Form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const startInterest = (row?: InterestRow) => {
    setForm(
      row
        ? {
            ...empty(),
            ...row,
            responsible_user_id: row.responsible_user_id || "",
            notes: row.notes || "",
          }
        : empty(),
    );
    setEditing({
      kind: "interest",
      id: row?.id || crypto.randomUUID(),
      version: row?.version ?? null,
      label: row?.client_name || undefined,
    });
    save.reset();
  };
  const startVisit = (interest?: InterestRow, row?: VisitRow) => {
    setForm({
      ...empty(),
      status: row?.status || "agendada",
      interest_id: row?.interest_id || interest?.id || "",
      responsible_user_id:
        row?.responsible_user_id ||
        interest?.responsible_user_id ||
        property.responsible_user_id ||
        "",
      notes: row?.notes || "",
      outcome: row?.outcome || "",
      starts_at: row ? toLocalVisitDate(row.starts_at) : "",
      ends_at: row ? toLocalVisitDate(row.ends_at) : "",
    });
    setEditing({
      kind: "visit",
      id: row?.id || crypto.randomUUID(),
      version: row?.version ?? null,
      label: row?.client_name || interest?.client_name || "Cliente",
    });
    save.reset();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || save.isPending) return;
    try {
      const values =
        editing.kind === "interest"
          ? interestSchema.parse({ ...form, property_id: property.id })
          : visitSchema.parse({
              ...form,
              property_id: property.id,
              starts_at: localVisitDate(form.starts_at),
              ends_at: localVisitDate(form.ends_at),
            });
      await save.mutateAsync({ ...editing, values });
      toast.success(editing.kind === "interest" ? "Interesse salvo." : "Visita salva.");
      setEditing(null);
    } catch (error) {
      const validation = error as { issues?: { message: string }[] };
      toast.error(
        validation.issues?.[0]?.message ||
          (error instanceof Error && error.message.startsWith("Informe data")
            ? error.message
            : activityError(error)),
      );
    }
  };
  const closed = !["disponivel", "reservado"].includes(property.status);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <>
      <Dialog
        open={!editing}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{property.code} — Interessados e visitas</DialogTitle>
            <DialogDescription>
              {property.title}. Acompanhe os clientes interessados e os horários de visita.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={kind === "interests" ? "default" : "outline"}
              onClick={() => {
                setKind("interests");
                setStatus("");
                setPage(1);
              }}
            >
              Interessados
            </Button>
            <Button
              variant={kind === "visits" ? "default" : "outline"}
              onClick={() => {
                setKind("visits");
                setStatus("");
                setPage(1);
              }}
            >
              Visitas
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              aria-label="Filtrar situação"
              className={selectClass}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as situações</option>
              {options(kind === "interests" ? INTEREST_STATUSES : VISIT_STATUSES)}
            </select>
            {kind === "interests" && writable && (
              <Button disabled={closed} onClick={() => startInterest()}>
                Novo interessado
              </Button>
            )}
          </div>
          {closed && (
            <p className="text-sm text-muted-foreground">
              Imóvel vendido, alugado ou inativo: os registros anteriores continuam disponíveis;
              novos interesses e agendamentos ficam bloqueados.
            </p>
          )}
          {kind === "visits" && (
            <p className="text-sm text-muted-foreground">
              Para agendar, abra Interessados e clique em Agendar visita. Horários no fuso {zone}.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {query.isLoading || query.isError ? "—" : query.data?.total || 0} registros encontrados.
          </p>
          {query.isLoading ? (
            <p>Carregando…</p>
          ) : query.isError ? (
            <div role="alert">
              <p>{activityError(query.error)}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : !query.data?.items.length ? (
            <p className="rounded-lg border border-dashed p-6">
              Nenhum registro encontrado.{" "}
              {kind === "interests"
                ? "Cadastre um interessado ou ajuste o filtro."
                : "Agende uma visita pela ficha de um interessado ou ajuste o filtro."}
            </p>
          ) : (
            <div className="space-y-3">
              {query.data.items.map((item) => {
                const interest = kind === "interests" ? (item as InterestRow) : null;
                const visit = kind === "visits" ? (item as VisitRow) : null;
                return (
                  <article key={item.id} className="space-y-3 rounded-xl border p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="font-semibold break-words">
                        {item.client_name || "Cliente indisponível"}
                      </h3>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs">
                        {interest
                          ? INTEREST_STATUSES[interest.status]
                          : VISIT_STATUSES[visit!.status]}
                      </span>
                    </div>
                    {interest && (
                      <p className="text-sm">
                        Interesse: {interest.purpose === "venda" ? "Compra" : "Locação"}
                      </p>
                    )}
                    {visit && (
                      <p className="text-sm">
                        {visitTime(visit.starts_at)} até {visitTime(visit.ends_at)}
                      </p>
                    )}
                    <p className="text-sm">
                      Responsável: {item.responsible_name || "Não atribuído"}
                    </p>
                    {item.notes && (
                      <p className="whitespace-pre-wrap break-words text-sm">
                        Observações: {item.notes}
                      </p>
                    )}
                    {visit?.outcome && (
                      <p className="whitespace-pre-wrap break-words text-sm">
                        Resultado / motivo: {visit.outcome}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/clientes/$clientId"
                          params={{ clientId: interest?.client_id || visit!.client_id }}
                        >
                          Ver cliente
                        </Link>
                      </Button>
                      {writable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            interest ? startInterest(interest) : startVisit(undefined, visit!)
                          }
                        >
                          Editar
                        </Button>
                      )}
                      {writable && interest && (
                        <Button
                          size="sm"
                          disabled={closed || interest.status === "encerrado"}
                          onClick={() => startVisit(interest)}
                        >
                          Agendar visita
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {Boolean(query.data && query.data.total > 20) && (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={page === 1 || query.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm">Página {page}</span>
              <Button
                variant="outline"
                disabled={page * 20 >= (query.data?.total || 0) || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Atualizar lista
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setEditing(null);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          onInteractOutside={(e) => {
            if (save.isPending) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (save.isPending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing?.kind === "interest"
                ? editing.version === null
                  ? "Novo interessado"
                  : "Editar interesse"
                : editing?.version === null
                  ? "Agendar visita"
                  : "Editar visita"}
            </DialogTitle>
            <DialogDescription>
              {property.code} — {property.title}.{" "}
              {editing?.kind === "visit"
                ? `Cliente: ${editing.label}. Horários no fuso ${zone}.`
                : "Campos com * são obrigatórios."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <fieldset disabled={save.isPending} className="space-y-4">
              {editing?.kind === "interest" ? (
                <>
                  <Field label="Cliente *" id="activity-client">
                    <select
                      id="activity-client"
                      className={selectClass}
                      value={form.client_id}
                      disabled={editing.version !== null}
                      onChange={(e) => change("client_id", e.target.value)}
                      required
                    >
                      <option value="">Selecione um cliente</option>
                      {editing.version !== null &&
                        !opts.data?.owners.some((c) => c.id === form.client_id) && (
                          <option value={form.client_id}>
                            {editing.label || "Cliente vinculado"}
                          </option>
                        )}
                      {opts.data?.owners.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Use um cliente cadastrado nesta empresa. Se precisar cadastrá-lo, cancele o
                    formulário e abra Clientes.
                  </p>
                  <Field label="Finalidade *" id="activity-purpose">
                    <select
                      id="activity-purpose"
                      className={selectClass}
                      value={form.purpose}
                      disabled={editing.version !== null}
                      onChange={(e) => change("purpose", e.target.value)}
                    >
                      {(property.purpose !== "locacao" || form.purpose === "venda") && (
                        <option value="venda">Compra</option>
                      )}
                      {(property.purpose !== "venda" || form.purpose === "locacao") && (
                        <option value="locacao">Locação</option>
                      )}
                    </select>
                  </Field>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Início *" id="visit-start">
                    <Input
                      id="visit-start"
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => change("starts_at", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Fim *" id="visit-end">
                    <Input
                      id="visit-end"
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => change("ends_at", e.target.value)}
                      required
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Duração de 15 minutos a 4 horas. Agendamentos devem estar no futuro; visitas
                    realizadas ou sem comparecimento só podem ser registradas após o início.
                  </p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Situação *" id="activity-status">
                  <select
                    id="activity-status"
                    className={selectClass}
                    value={form.status}
                    onChange={(e) => change("status", e.target.value)}
                  >
                    {options(editing?.kind === "interest" ? INTEREST_STATUSES : VISIT_STATUSES)}
                  </select>
                </Field>
                <Field
                  label={editing?.kind === "visit" ? "Responsável *" : "Responsável"}
                  id="activity-responsible"
                >
                  <select
                    id="activity-responsible"
                    className={selectClass}
                    value={form.responsible_user_id}
                    onChange={(e) => change("responsible_user_id", e.target.value)}
                    required={editing?.kind === "visit"}
                  >
                    <option value="">
                      {editing?.kind === "visit" ? "Selecione um responsável" : "Não atribuído"}
                    </option>
                    {opts.data?.responsibles.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {opts.isLoading && <p>Carregando clientes e responsáveis…</p>}
              {opts.isError && (
                <div role="alert">
                  <p>Não foi possível carregar as opções.</p>
                  <Button type="button" variant="outline" onClick={() => void opts.refetch()}>
                    Tentar novamente
                  </Button>
                </div>
              )}
              <Field label="Observações" id="activity-notes">
                <Textarea
                  id="activity-notes"
                  maxLength={4000}
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </Field>
              {editing?.kind === "visit" && (
                <Field
                  label={form.status === "agendada" ? "Resultado / motivo" : "Resultado / motivo *"}
                  id="visit-outcome"
                >
                  <Textarea
                    id="visit-outcome"
                    value={form.outcome}
                    maxLength={4000}
                    required={form.status !== "agendada"}
                    onChange={(e) => change("outcome", e.target.value)}
                  />
                </Field>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={opts.isLoading || opts.isError}>
                  {save.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
