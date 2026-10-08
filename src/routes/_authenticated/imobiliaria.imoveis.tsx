import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatCurrency } from "@/lib/format";
import { routeVisibleForModules } from "@/lib/organization-segments";
import {
  useProperties,
  usePropertyOptions,
  useSaveProperty,
  type PropertyRow,
  type PropertyFilters,
} from "@/hooks/use-real-estate";
import {
  BRAZIL_STATES,
  PROPERTY_TYPES,
  PROPERTY_PURPOSES,
  PROPERTY_STATUSES,
  canWriteProperties,
  emptyPropertyForm,
  propertyFormSchema,
  realEstateError,
  type PropertyForm,
} from "@/lib/real-estate";

export const Route = createFileRoute("/_authenticated/imobiliaria/imoveis")({
  head: () => ({ meta: [{ title: "Imóveis — FLUXA Imobiliária" }] }),
  component: PropertiesPage,
});
function PropertiesPage() {
  const { organizationId } = useWorkspace();
  return <PropertyWorkspace key={organizationId ?? "none"} />;
}
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function enumOptions(values: Record<string, string>) {
  return Object.entries(values).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}
function formFor(row: PropertyRow): PropertyForm {
  return {
    ...emptyPropertyForm(),
    ...row,
    responsible_user_id: row.responsible_user_id || "",
    zip_code: row.zip_code || "",
    number: row.number || "",
    complement: row.complement || "",
    district: row.district || "",
    sale_price: row.sale_price === null ? "" : String(row.sale_price),
    rent_price: row.rent_price === null ? "" : String(row.rent_price),
    area_m2: row.area_m2 === null ? "" : String(row.area_m2),
    notes: row.notes || "",
  };
}
function PropertyWorkspace() {
  const { organizationId, role, membership } = useWorkspace();
  const settings = membership?.organizations?.organization_settings;
  const allowed = routeVisibleForModules(
    "/imobiliaria/imoveis",
    settings?.business_segment,
    settings?.enabled_modules,
  );
  const canWrite = canWriteProperties(role);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<PropertyFilters>({
    search: "",
    type: "",
    purpose: "",
    status: "",
    city: "",
    page: 1,
  });
  const query = useProperties(organizationId, filters, allowed);
  const options = usePropertyOptions(organizationId, allowed);
  const save = useSaveProperty(organizationId);
  const [form, setForm] = useState<PropertyForm>(emptyPropertyForm);
  const [editing, setEditing] = useState<{
    id: string;
    version: number | null;
    ownerName?: string | null;
  } | null>(null);
  const [selected, setSelected] = useState<PropertyRow | null>(null);
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => ({ ...f, search: search.trim(), page: 1 })),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const data = query.data;
  const detail = data?.items.find((row) => row.id === selected?.id) || selected;
  const change = (key: keyof PropertyForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const filter = (key: keyof PropertyFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  const edit = (row?: PropertyRow) => {
    setSelected(null);
    setForm(row ? formFor(row) : emptyPropertyForm());
    setEditing({
      id: row?.id || crypto.randomUUID(),
      version: row?.version ?? null,
      ownerName: row?.owner_name,
    });
    save.reset();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || save.isPending) return;
    const parsed = propertyFormSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    try {
      await save.mutateAsync({ ...editing, values: parsed.data });
      setEditing(null);
      toast.success(editing.version === null ? "Imóvel cadastrado." : "Imóvel atualizado.");
    } catch (error) {
      toast.error(realEstateError(error));
    }
  };
  if (!allowed)
    return <div className="p-6">A área imobiliária não está habilitada nesta empresa.</div>;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
              FLUXA Imobiliária
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold">
              <Building2 aria-hidden className="size-6" />
              Imóveis
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              Organize sua carteira, proprietários, valores e responsáveis pela negociação.
            </p>
          </div>
          {canWrite && (
            <Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => edit()}>
              <Plus className="size-4" />
              Novo imóvel
            </Button>
          )}
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Imóveis encontrados", data?.total],
          ["Disponíveis", data?.available],
          ["Reservados", data?.reserved],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">
                {query.isError || query.isLoading ? "—" : (value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">
            Os indicadores acompanham os filtros da lista.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Buscar imóveis"
                className="pl-9"
                placeholder="Código, título, endereço ou proprietário"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filtrar tipo"
              className={selectClass}
              value={filters.type}
              onChange={(e) => filter("type", e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {enumOptions(PROPERTY_TYPES)}
            </select>
            <select
              aria-label="Filtrar finalidade"
              className={selectClass}
              value={filters.purpose}
              onChange={(e) => filter("purpose", e.target.value)}
            >
              <option value="">Todas as finalidades</option>
              {enumOptions(PROPERTY_PURPOSES)}
            </select>
            <select
              aria-label="Filtrar situação"
              className={selectClass}
              value={filters.status}
              onChange={(e) => filter("status", e.target.value)}
            >
              <option value="">Todas as situações</option>
              {enumOptions(PROPERTY_STATUSES)}
            </select>
            <select
              aria-label="Filtrar cidade"
              className={selectClass}
              value={filters.city}
              onChange={(e) => filter("city", e.target.value)}
            >
              <option value="">Todas as cidades</option>
              {options.data?.cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
          </div>
          {query.isLoading ? (
            <p className="flex items-center gap-2 py-8">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Carregando imóveis…
            </p>
          ) : query.isError ? (
            <div role="alert" className="space-y-3 rounded-xl border p-5">
              <p>{realEstateError(query.error)}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : !data?.items.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="font-medium">Nenhum imóvel encontrado.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Cadastre o primeiro imóvel ou ajuste os filtros.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.items.map((row) => (
                <article key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {row.code} · {PROPERTY_TYPES[row.property_type]}
                      </p>
                      <h2 className="mt-1 break-words font-semibold">{row.title}</h2>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs">
                      {PROPERTY_STATUSES[row.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {row.city} / {row.state} · {PROPERTY_PURPOSES[row.purpose]}
                  </p>
                  <div className="mt-3 text-sm">
                    {row.sale_price !== null && (
                      <p>
                        Venda: <strong>{formatCurrency(row.sale_price)}</strong>
                      </p>
                    )}
                    {row.rent_price !== null && (
                      <p>
                        Aluguel mensal: <strong>{formatCurrency(row.rent_price)}</strong>
                      </p>
                    )}
                  </div>
                  <p className="mt-3 truncate text-sm">
                    Proprietário: {row.owner_name || "Cadastro indisponível"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Ver detalhes de ${row.code}`}
                      onClick={() => setSelected(row)}
                    >
                      Ver detalhes
                    </Button>
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Editar ${row.code}`}
                        onClick={() => edit(row)}
                      >
                        Editar
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">
                Página {filters.page} de {Math.ceil((data?.total ?? 0) / 20)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={filters.page === 1 || query.isFetching}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={filters.page * 20 >= (data?.total ?? 0) || query.isFetching}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {detail?.code} · {detail?.title}
            </DialogTitle>
            <DialogDescription>Informações do imóvel e vínculos da empresa.</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <p>
                {PROPERTY_TYPES[detail.property_type]} · {PROPERTY_PURPOSES[detail.purpose]} ·{" "}
                {PROPERTY_STATUSES[detail.status]}
              </p>
              <p className="break-words">
                {detail.street}, {detail.number || "s/n"} {detail.complement}
                <br />
                {detail.district} · {detail.city}/{detail.state}
                {detail.zip_code && (
                  <>
                    <br />
                    CEP {detail.zip_code}
                  </>
                )}
              </p>
              <p>
                <strong>Proprietário:</strong> {detail.owner_name || "Cadastro indisponível"}
              </p>
              <p>
                <strong>Responsável:</strong> {detail.responsible_name || "Não atribuído"}
              </p>
              {detail.sale_price !== null && (
                <p>
                  <strong>Venda:</strong> {formatCurrency(detail.sale_price)}
                </p>
              )}
              {detail.rent_price !== null && (
                <p>
                  <strong>Aluguel mensal:</strong> {formatCurrency(detail.rent_price)}
                </p>
              )}
              {detail.area_m2 !== null && (
                <p>
                  <strong>Área:</strong> {detail.area_m2} m²
                </p>
              )}
              {detail.notes && <p className="whitespace-pre-wrap break-words">{detail.notes}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link to="/clientes/$clientId" params={{ clientId: detail.owner_client_id }}>
                    Ver proprietário
                  </Link>
                </Button>
                {canWrite && <Button onClick={() => edit(detail)}>Editar imóvel</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing?.version === null ? "Novo imóvel" : "Editar imóvel"}</DialogTitle>
            <DialogDescription>
              Campos com * são obrigatórios. Valores sem separador de milhar: 250000,00.
            </DialogDescription>
          </DialogHeader>
          {options.isLoading ? (
            <p>Carregando proprietários e responsáveis…</p>
          ) : options.isError ? (
            <div role="alert">
              <p>Não foi possível carregar os vínculos.</p>
              <Button variant="outline" onClick={() => void options.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
                <Field id="property-code" label="Código *">
                  <Input
                    id="property-code"
                    value={form.code}
                    maxLength={30}
                    required
                    onChange={(e) => change("code", e.target.value)}
                  />
                </Field>
                <Field id="property-title" label="Título *">
                  <Input
                    id="property-title"
                    value={form.title}
                    maxLength={160}
                    required
                    onChange={(e) => change("title", e.target.value)}
                  />
                </Field>
                <Field id="property-type" label="Tipo *">
                  <select
                    id="property-type"
                    className={selectClass}
                    value={form.property_type}
                    onChange={(e) => change("property_type", e.target.value)}
                  >
                    {enumOptions(PROPERTY_TYPES)}
                  </select>
                </Field>
                <Field id="property-purpose" label="Finalidade *">
                  <select
                    id="property-purpose"
                    className={selectClass}
                    value={form.purpose}
                    onChange={(e) => change("purpose", e.target.value)}
                  >
                    {enumOptions(PROPERTY_PURPOSES)}
                  </select>
                </Field>
                <Field id="property-status" label="Situação *">
                  <select
                    id="property-status"
                    className={selectClass}
                    value={form.status}
                    onChange={(e) => change("status", e.target.value)}
                  >
                    {enumOptions(PROPERTY_STATUSES)}
                  </select>
                </Field>
                <Field id="property-owner" label="Proprietário *">
                  <select
                    id="property-owner"
                    required
                    className={selectClass}
                    value={form.owner_client_id}
                    onChange={(e) => change("owner_client_id", e.target.value)}
                  >
                    <option value="">Selecione um cliente</option>
                    {form.owner_client_id &&
                      !options.data?.owners.some((o) => o.id === form.owner_client_id) && (
                        <option value={form.owner_client_id}>
                          {editing?.ownerName || "Proprietário vinculado"}
                        </option>
                      )}
                    {options.data?.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="text-xs text-muted-foreground sm:col-span-2">
                  O proprietário usa o cadastro de Clientes.{" "}
                  <Link className="underline" to="/clientes/novo">
                    Cadastrar proprietário em Clientes
                  </Link>{" "}
                  (salve ou cancele este formulário antes de sair).
                </div>
                <Field id="property-responsible" label="Responsável">
                  <select
                    id="property-responsible"
                    className={selectClass}
                    value={form.responsible_user_id}
                    onChange={(e) => change("responsible_user_id", e.target.value)}
                  >
                    <option value="">Não atribuído</option>
                    {options.data?.responsibles.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="property-zip" label="CEP">
                  <Input
                    id="property-zip"
                    value={form.zip_code}
                    inputMode="numeric"
                    maxLength={9}
                    onChange={(e) => change("zip_code", e.target.value)}
                  />
                </Field>
                <Field id="property-street" label="Logradouro *">
                  <Input
                    id="property-street"
                    value={form.street}
                    required
                    maxLength={160}
                    onChange={(e) => change("street", e.target.value)}
                  />
                </Field>
                <Field id="property-number" label="Número">
                  <Input
                    id="property-number"
                    value={form.number}
                    maxLength={30}
                    onChange={(e) => change("number", e.target.value)}
                  />
                </Field>
                <Field id="property-complement" label="Complemento">
                  <Input
                    id="property-complement"
                    value={form.complement}
                    maxLength={100}
                    onChange={(e) => change("complement", e.target.value)}
                  />
                </Field>
                <Field id="property-district" label="Bairro">
                  <Input
                    id="property-district"
                    value={form.district}
                    maxLength={100}
                    onChange={(e) => change("district", e.target.value)}
                  />
                </Field>
                <Field id="property-city" label="Cidade *">
                  <Input
                    id="property-city"
                    value={form.city}
                    required
                    maxLength={100}
                    onChange={(e) => change("city", e.target.value)}
                  />
                </Field>
                <Field id="property-state" label="Estado *">
                  <select
                    id="property-state"
                    className={selectClass}
                    value={form.state}
                    onChange={(e) => change("state", e.target.value)}
                  >
                    <option value="">Selecione o estado</option>
                    {BRAZIL_STATES.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </Field>
                {form.purpose !== "locacao" && (
                  <Field id="property-sale" label="Valor de venda (R$) *">
                    <Input
                      id="property-sale"
                      inputMode="decimal"
                      value={form.sale_price}
                      required
                      onChange={(e) => change("sale_price", e.target.value)}
                    />
                  </Field>
                )}
                {form.purpose !== "venda" && (
                  <Field id="property-rent" label="Aluguel mensal (R$) *">
                    <Input
                      id="property-rent"
                      inputMode="decimal"
                      value={form.rent_price}
                      required
                      onChange={(e) => change("rent_price", e.target.value)}
                    />
                  </Field>
                )}
                <Field id="property-area" label="Área (m²)">
                  <Input
                    id="property-area"
                    inputMode="decimal"
                    value={form.area_m2}
                    onChange={(e) => change("area_m2", e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="property-notes" label="Observações">
                    <Textarea
                      id="property-notes"
                      value={form.notes}
                      maxLength={4000}
                      onChange={(e) => change("notes", e.target.value)}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={!options.data?.owners.length && editing?.version === null}
                  >
                    {save.isPending && <Loader2 className="size-4 animate-spin" />}
                    {save.isPending ? "Salvando…" : "Salvar imóvel"}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
