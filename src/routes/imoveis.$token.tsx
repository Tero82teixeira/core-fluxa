import { PublicInquiryForm } from "@/components/real-estate/public-inquiry-form";
import { BusinessProfileCard } from "@/components/real-estate/business-profile";
import { usePublicBusinessProfile } from "@/hooks/use-real-estate-profile";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CatalogGallery } from "@/components/real-estate/catalog-gallery";
import { usePublicCatalog, type PublicCatalogFilters } from "@/hooks/use-real-estate-catalog";
import {
  catalogUrl,
  isCatalogId,
  parseCatalogSelection,
  propertyWhatsapp,
  type CatalogListing,
} from "@/lib/real-estate-catalog";
import { PROPERTY_TYPES, parsePropertyDecimal } from "@/lib/real-estate";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/imoveis/$token")({
  validateSearch: (search: Record<string, unknown>): { imoveis?: string } => ({
    imoveis:
      search.imoveis === undefined
        ? undefined
        : typeof search.imoveis === "string"
          ? search.imoveis
          : "invalid",
  }),
  head: () => ({
    meta: [
      { title: "Imóveis para você — FLUXA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PublicCatalogPage,
});
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
function PublicCatalogPage() {
  const { token } = Route.useParams();
  const ids = parseCatalogSelection(Route.useSearch().imoveis);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [filters, setFilters] = useState<PublicCatalogFilters>({
    purpose: "",
    type: "",
    maxPrice: null,
    search: "",
    page: 1,
  });
  const [form, setForm] = useState({ purpose: "", type: "", price: "", search: "" });
  const [inquiry, setInquiry] = useState<{
    listing: CatalogListing;
    kind: "informacao" | "visita";
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = usePublicCatalog(token, isCatalogId(token) ? ids : null, filters);
  const profile = usePublicBusinessProfile(
    token,
    Boolean(query.data) && isCatalogId(token) && ids !== null,
  );
  const selected = query.data?.items.find((item) => item.id === selectedId) || null;
  const prices = (item: CatalogListing) => (
    <div className="space-y-1 text-sm">
      {item.sale_price !== null && (
        <p>
          Venda <strong>{formatCurrency(item.sale_price)}</strong>
        </p>
      )}
      {item.rent_price !== null && (
        <p>
          Aluguel mensal <strong>{formatCurrency(item.rent_price)}</strong>
        </p>
      )}
    </div>
  );
  const features = (item: CatalogListing) => (
    <p className="text-sm text-muted-foreground">
      {[
        item.bedrooms !== null ? `${item.bedrooms} quarto(s)` : null,
        item.bathrooms !== null ? `${item.bathrooms} banheiro(s)` : null,
        item.parking !== null ? `${item.parking} vaga(s)` : null,
        item.area_m2 !== null ? `${item.area_m2} m²` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    </p>
  );
  const contact = (item: CatalogListing, visit = false) =>
    origin && query.data
      ? propertyWhatsapp(query.data.whatsapp, item, catalogUrl(origin, token, [item.id]), visit)
      : undefined;
  if (!isCatalogId(token) || ids === null)
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Seleção indisponível</h1>
        <p className="mt-3">Confira o link com a imobiliária.</p>
      </main>
    );
  return (
    <main className="mx-auto min-h-dvh max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <p className="flex items-center gap-2 text-sm text-amber-200">
          <Building2 className="size-5" aria-hidden />
          Imóveis para você
        </p>
        <h1 className="mt-3 break-words text-2xl font-semibold sm:text-3xl">
          {query.data?.company_name || "Vitrine de imóveis"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          {ids
            ? "Confira as opções selecionadas para você. Abra um imóvel para ver as fotos e conversar com a imobiliária."
            : "Encontre uma opção para comprar ou alugar. Veja fotos, valores e características sem precisar criar conta."}
        </p>
      </header>
      {query.isPending ? (
        <p role="status">Carregando imóveis…</p>
      ) : query.isError ? (
        <div role="alert" className="space-y-3 rounded-xl border p-5">
          <p>Não foi possível carregar os imóveis.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : !query.data ? (
        <div className="rounded-xl border p-5">
          <h2 className="font-semibold">Vitrine indisponível</h2>
          <p className="mt-2 text-sm">
            Esta vitrine pode ter sido desativada. Solicite um link atualizado à imobiliária.
          </p>
        </div>
      ) : (
        <>
          <BusinessProfileCard
            profile={profile.data || null}
            company={query.data.company_name}
            whatsapp={query.data.whatsapp}
            url={origin ? catalogUrl(origin, token, ids || []) : ""}
          />
          <form
            className="grid items-end gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const maxPrice = parsePropertyDecimal(form.price);
                setFilters({
                  purpose: form.purpose,
                  type: form.type,
                  maxPrice,
                  search: form.search.trim(),
                  page: 1,
                });
                setSelectedId(null);
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="public-purpose">Objetivo</Label>
              <select
                id="public-purpose"
                className={selectClass}
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              >
                <option value="">Comprar ou alugar</option>
                <option value="venda">Comprar</option>
                <option value="locacao">Alugar</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="public-type">Tipo de imóvel</Label>
              <select
                id="public-type"
                className={selectClass}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="">Todos</option>
                {Object.entries(PROPERTY_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="public-price">Valor máximo (R$)</Label>
              <Input
                id="public-price"
                inputMode="decimal"
                placeholder="500000,00"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="public-search">Bairro, cidade ou código</Label>
              <Input
                id="public-search"
                maxLength={100}
                value={form.search}
                onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={query.isFetching}>Filtrar</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm({ purpose: "", type: "", price: "", search: "" });
                  setFilters({ purpose: "", type: "", maxPrice: null, search: "", page: 1 });
                }}
              >
                Limpar
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">
              {query.isFetching ? "Atualizando…" : `${query.data.total} imóvel(is) encontrado(s).`}
            </p>
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Atualizar imóveis e fotos
            </Button>
          </div>
          {!query.data.items.length ? (
            <p className="rounded-xl border border-dashed p-6">
              Nenhum imóvel disponível neste filtro ou seleção. Converse com a imobiliária para
              receber outras opções.
            </p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {query.data.items.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-2xl border bg-card">
                  <button
                    type="button"
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ver fotos de ${item.title}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {item.photos[0]?.url ? (
                      <img
                        src={item.photos[0].url}
                        alt={item.photos[0].caption || item.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="aspect-[4/3] w-full bg-muted object-cover"
                      />
                    ) : (
                      <div className="grid aspect-[4/3] place-items-center bg-muted text-sm">
                        Foto indisponível
                      </div>
                    )}
                  </button>
                  <div className="space-y-3 p-4">
                    <p className="text-xs text-muted-foreground">
                      {item.code} ·{" "}
                      {PROPERTY_TYPES[item.property_type as keyof typeof PROPERTY_TYPES]}
                    </p>
                    <h2 className="break-words font-semibold">{item.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[item.district, `${item.city}/${item.state}`].filter(Boolean).join(" · ")}
                    </p>
                    {features(item)}
                    {prices(item)}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setSelectedId(item.id)}>
                        Ver fotos e detalhes
                      </Button>
                      <Button onClick={() => setInquiry({ listing: item, kind: "informacao" })}>
                        Pedir informações
                      </Button>
                      <Button asChild>
                        <a href={contact(item)} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="size-4" aria-hidden />
                          Tenho interesse
                        </a>
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {query.data.total > 20 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={filters.page === 1 || query.isFetching}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              >
                Anterior
              </Button>
              <span>Página {filters.page}</span>
              <Button
                variant="outline"
                disabled={filters.page * 20 >= query.data.total || query.isFetching}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              >
                Próxima
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Informações fornecidas pela imobiliária. Confirme valores e disponibilidade com a equipe
            antes de contratar. Solicitações e conversas no WhatsApp não confirmam uma reserva ou
            visita automaticamente.
          </p>
        </>
      )}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>
                  {selected.code} ·{" "}
                  {[selected.district, `${selected.city}/${selected.state}`]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>
              <CatalogGallery key={selected.id} photos={selected.photos} title={selected.title} />
              {prices(selected)}
              {features(selected)}
              <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p>
              {selected.features && (
                <div>
                  <h3 className="font-semibold">Diferenciais</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {selected.features}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setInquiry({ listing: selected, kind: "informacao" })}>
                  Enviar pedido de informações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setInquiry({ listing: selected, kind: "visita" })}
                >
                  Solicitar visita
                </Button>
                <Button asChild>
                  <a href={contact(selected)} target="_blank" rel="noopener noreferrer">
                    Quero mais informações
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={contact(selected, true)} target="_blank" rel="noopener noreferrer">
                    Tenho interesse em visitar
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {inquiry && (
        <PublicInquiryForm
          key={`${inquiry.listing.id}-${inquiry.kind}`}
          token={token}
          listing={inquiry.listing}
          kind={inquiry.kind}
          onClose={() => setInquiry(null)}
        />
      )}
      <footer className="border-t pt-5 text-xs text-muted-foreground">
        Vitrine apresentada com FLUXA
      </footer>
    </main>
  );
}
