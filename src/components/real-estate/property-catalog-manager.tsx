import { useEffect, useState } from "react";
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
import { canWriteProperties } from "@/lib/real-estate";
import { formatCurrency } from "@/lib/format";
import {
  catalogError,
  catalogForm,
  catalogPhone,
  catalogUrl,
  catalogValues,
  type CatalogForm,
} from "@/lib/real-estate-catalog";
import {
  useManagedCatalog,
  useSaveCatalog,
  useUploadCatalogPhoto,
} from "@/hooks/use-real-estate-catalog";
import type { PropertyRow } from "@/hooks/use-real-estate";
import { CatalogGallery } from "./catalog-gallery";
import { BusinessProfileSettings } from "./business-profile-settings";

export function PropertyCatalogManager({
  property,
  onClose,
}: {
  property?: PropertyRow;
  onClose: () => void;
}) {
  const { organizationId, role, membership } = useWorkspace();
  const writable = canWriteProperties(role);
  const [propertyId, setPropertyId] = useState<string | null>(property?.id || null);
  const [page, setPage] = useState(1);
  const query = useManagedCatalog(organizationId, propertyId, page);
  const save = useSaveCatalog(organizationId, propertyId);
  const upload = useUploadCatalogPhoto(organizationId, propertyId, query.data?.listing?.id || null);
  const busy = save.isPending || upload.isPending;
  const [store, setStore] = useState({
    company_name: membership?.organizations?.legal_name || "",
    whatsapp: "",
    is_enabled: false,
  });
  const [form, setForm] = useState<CatalogForm | null>(null);
  const [caption, setCaption] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [link, setLink] = useState("");
  useEffect(() => {
    if (query.data?.store) {
      const s = query.data.store;
      setStore({ company_name: s.company_name, whatsapp: s.whatsapp, is_enabled: s.is_enabled });
    }
  }, [query.data?.store?.updated_at]);
  useEffect(() => {
    if (query.data?.source) setForm(catalogForm(query.data.listing || query.data.source));
  }, [query.data?.source?.id, query.data?.listing?.id]);
  async function mutate(action: string, values: Record<string, unknown>) {
    try {
      const result = await save.mutateAsync({ action, values });
      toast.success("Informações salvas.");
      return result;
    } catch (error) {
      toast.error(catalogError(error));
      return null;
    }
  }
  async function share(ids: string[], whatsapp = false) {
    if (!query.data?.store?.is_enabled) return;
    const url = catalogUrl(window.location.origin, query.data.store.token, ids);
    setLink(url);
    if (whatsapp) {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`Separei estas opções de imóveis para você:\n${url}`)}`,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.info("Selecione e copie o link exibido abaixo.");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {propertyId ? "Fotos e anúncio do imóvel" : "Vitrine e compartilhamento"}
          </DialogTitle>
          <DialogDescription>
            Publique somente os imóveis que deseja apresentar ao público. A página do cliente não
            exige cadastro.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p>Carregando vitrine…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>
              Não foi possível carregar a vitrine. Confira se a ativação do catálogo foi aplicada no
              banco.
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <details className="rounded-xl border p-4" open={!query.data?.store}>
              <summary className="cursor-pointer font-semibold">
                1. Configuração da vitrine e contato da imobiliária
              </summary>
              <form
                className="mt-4 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    if (!store.company_name.trim())
                      throw new Error("Informe o nome público da imobiliária.");
                    await mutate("save_store", {
                      ...store,
                      whatsapp: store.whatsapp.trim() ? catalogPhone(store.whatsapp) : "",
                    });
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                <fieldset disabled={!writable || busy} className="space-y-3">
                  <Label htmlFor="catalog-company">Nome público da imobiliária</Label>
                  <Input
                    id="catalog-company"
                    required
                    maxLength={160}
                    value={store.company_name}
                    onChange={(e) => setStore((s) => ({ ...s, company_name: e.target.value }))}
                  />
                  <Label htmlFor="catalog-whatsapp">WhatsApp comercial com DDD</Label>
                  <Input
                    id="catalog-whatsapp"
                    required={store.is_enabled}
                    maxLength={25}
                    inputMode="tel"
                    placeholder="27 99999-9999"
                    value={store.whatsapp}
                    onChange={(e) => setStore((s) => ({ ...s, whatsapp: e.target.value }))}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={store.is_enabled}
                      onChange={(e) => setStore((s) => ({ ...s, is_enabled: e.target.checked }))}
                    />
                    Ativar vitrine pública
                  </label>
                  {writable && <Button disabled={busy}>Salvar configuração</Button>}
                </fieldset>
                <p className="text-xs text-muted-foreground">
                  O nome e o WhatsApp acima ficam públicos. Desativar a vitrine oculta todos os seus
                  anúncios e seleções.
                </p>
              </form>
            </details>
            {organizationId && query.data?.store && (
              <BusinessProfileSettings
                org={organizationId}
                writable={writable}
                company={query.data.store.company_name}
              />
            )}
            {propertyId && form && query.data?.source ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">2. {query.data.source.code} · Conteúdo público</h3>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setPropertyId(null);
                      setForm(null);
                      setPage(1);
                    }}
                  >
                    Ver todos os anúncios
                  </Button>
                </div>
                <div className="rounded-xl bg-muted p-3 text-sm">
                  {query.data.source.district} · {query.data.source.city}/{query.data.source.state}
                  <br />
                  {query.data.source.sale_price !== null && (
                    <>Venda: {formatCurrency(query.data.source.sale_price)} · </>
                  )}
                  {query.data.source.rent_price !== null && (
                    <>Aluguel: {formatCurrency(query.data.source.rent_price)} · </>
                  )}
                  {query.data.source.area_m2 !== null && <>{query.data.source.area_m2} m²</>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Valores, tipo, área e localização resumida acompanham o cadastro do imóvel. O
                    endereço completo e os dados do proprietário não são publicados.
                  </p>
                </div>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await mutate("save_listing", catalogValues(form));
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                >
                  <fieldset disabled={!writable || busy} className="space-y-3">
                    <Label htmlFor="catalog-title">Título público</Label>
                    <Input
                      id="catalog-title"
                      required
                      maxLength={160}
                      value={form.title}
                      onChange={(e) => setForm((f) => f && { ...f, title: e.target.value })}
                    />
                    <Label htmlFor="catalog-description">Descrição pública</Label>
                    <Textarea
                      id="catalog-description"
                      maxLength={4000}
                      rows={4}
                      placeholder="Descreva o imóvel para o interessado. Não inclua dados do proprietário ou informações internas."
                      value={form.description}
                      onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })}
                    />
                    <div className="grid grid-cols-3 gap-3">
                      {(
                        [
                          ["bedrooms", "Quartos"],
                          ["bathrooms", "Banheiros"],
                          ["parking", "Vagas"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="space-y-1">
                          <Label htmlFor={`catalog-${key}`}>{label}</Label>
                          <Input
                            id={`catalog-${key}`}
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            value={form[key]}
                            onChange={(e) => setForm((f) => f && { ...f, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <Label htmlFor="catalog-features">Diferenciais públicos</Label>
                    <Textarea
                      id="catalog-features"
                      maxLength={1000}
                      placeholder="Varanda, elevador, área de lazer…"
                      value={form.features}
                      onChange={(e) => setForm((f) => f && { ...f, features: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.is_published}
                        onChange={(e) =>
                          setForm((f) => f && { ...f, is_published: e.target.checked })
                        }
                      />
                      Publicar este anúncio na vitrine
                    </label>
                    {writable && (
                      <Button disabled={busy}>
                        {busy
                          ? "Salvando…"
                          : form.is_published
                            ? "Salvar e publicar anúncio"
                            : "Salvar rascunho"}
                      </Button>
                    )}
                  </fieldset>
                </form>
                <p className="text-xs text-muted-foreground">
                  Salve o rascunho, adicione fotos e só então marque a publicação. Imóveis vendidos,
                  alugados ou inativos deixam de aparecer automaticamente.
                </p>
                <h3 className="font-semibold">
                  3. Fotos do anúncio ({query.data.listing?.photos.length || 0}/20)
                </h3>
                <p className="text-xs text-muted-foreground">
                  A primeira foto é a capa. Envie JPG, PNG ou WebP de até 12 MB. As imagens são
                  reduzidas e têm os metadados removidos antes do envio.
                </p>
                {writable && (
                  <div className="space-y-2 rounded-xl border p-3">
                    <Label htmlFor="catalog-caption">Legenda da próxima foto</Label>
                    <Input
                      id="catalog-caption"
                      maxLength={120}
                      value={caption}
                      disabled={busy}
                      onChange={(e) => setCaption(e.target.value)}
                    />
                    <Label htmlFor="catalog-file">Adicionar uma foto</Label>
                    <Input
                      id="catalog-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={
                        busy ||
                        !query.data.listing ||
                        (query.data.listing?.photos.length || 0) >= 20
                      }
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          await upload.mutateAsync({ file, caption });
                          setCaption("");
                          toast.success("Foto adicionada.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error && !("code" in error)
                              ? error.message
                              : catalogError(error),
                          );
                        }
                      }}
                    />
                    {!query.data.listing && (
                      <p className="text-sm">Salve o rascunho para habilitar o envio das fotos.</p>
                    )}
                  </div>
                )}
                {!!query.data.listing?.photos.length && (
                  <CatalogGallery photos={query.data.listing.photos} title={form.title} />
                )}
                {writable && (
                  <div className="flex flex-wrap gap-2">
                    {query.data.listing?.photos.map((photo, index) => (
                      <Button
                        key={photo.id}
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          const result = await mutate("remove_photo", { id: photo.id });
                          if (result?.listing && !result.listing.is_published)
                            setForm((f) => f && { ...f, is_published: false });
                        }}
                      >
                        Remover foto {index + 1}
                      </Button>
                    ))}
                  </div>
                )}
                {query.data.listing?.visible && (
                  <Button variant="outline" onClick={() => void share([query.data!.listing!.id])}>
                    Copiar link deste imóvel
                  </Button>
                )}
              </section>
            ) : (
              <section className="space-y-3">
                <h3 className="font-semibold">Anúncios e seleção para o cliente</h3>
                <p className="text-sm text-muted-foreground">
                  Para criar um anúncio, abra “Fotos e anúncio” no cartão de um imóvel. Selecione
                  até 20 anúncios visíveis para montar um link de opções.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!query.data?.store?.is_enabled}
                    onClick={() => void share([])}
                  >
                    Copiar vitrine completa
                  </Button>
                  <Button
                    disabled={!selection.length || !query.data?.store?.is_enabled}
                    onClick={() => void share(selection)}
                  >
                    Copiar seleção ({selection.length}/20)
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!selection.length || !query.data?.store?.is_enabled}
                    onClick={() => void share(selection, true)}
                  >
                    Compartilhar seleção no WhatsApp
                  </Button>
                  {!!selection.length && (
                    <Button variant="ghost" onClick={() => setSelection([])}>
                      Limpar seleção
                    </Button>
                  )}
                </div>
                {query.data?.items.map((item) => (
                  <article key={item.id} className="flex items-start gap-3 rounded-xl border p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      aria-label={`Selecionar ${item.code}`}
                      disabled={!item.visible}
                      checked={selection.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked && selection.length >= 20) {
                          toast.info("Selecione no máximo 20 imóveis.");
                          return;
                        }
                        setSelection((ids) =>
                          e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                        );
                      }}
                    />
                    {item.photos[0]?.url && (
                      <img
                        src={item.photos[0].url}
                        alt={item.photos[0].caption || item.title}
                        loading="lazy"
                        className="h-16 w-20 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="break-words font-semibold">
                        {item.code} · {item.title}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {item.visible
                          ? "Visível ao público"
                          : item.is_published
                            ? "Oculto pela situação do imóvel ou da vitrine"
                            : "Rascunho"}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => setPropertyId(item.property_id)}
                      >
                        Fotos e anúncio
                      </Button>
                    </div>
                  </article>
                ))}
                {query.data?.total === 0 && (
                  <p className="rounded-xl border border-dashed p-4">
                    Nenhum anúncio criado. Comece pelo botão “Fotos e anúncio” de um imóvel.
                  </p>
                )}
                {(query.data?.total || 0) > 20 && (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={page === 1 || query.isFetching}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    <span>Página {page}</span>
                    <Button
                      variant="outline"
                      disabled={page * 20 >= (query.data?.total || 0) || query.isFetching}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                )}
              </section>
            )}
            {link && (
              <div className="space-y-1">
                <Label htmlFor="catalog-share-link">Link para compartilhar</Label>
                <Input
                  id="catalog-share-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
                <p className="text-xs text-muted-foreground">
                  O cliente só verá os anúncios ainda publicados e disponíveis. A página permite
                  pedir informações ou visita pelo WhatsApp da imobiliária.
                </p>
              </div>
            )}
            <Button
              variant="outline"
              disabled={query.isFetching || busy}
              onClick={() => void query.refetch()}
            >
              Atualizar fotos e anúncios
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
