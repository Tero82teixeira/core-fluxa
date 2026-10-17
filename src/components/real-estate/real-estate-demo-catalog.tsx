import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building2, Eye, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareCatalogPhoto } from "@/lib/real-estate-catalog";
import {
  buildDemoCatalog,
  demoCatalogSelection,
  demoCatalogUrl,
  filterDemoCatalog,
  type DemoListing,
} from "@/lib/real-estate-demo-catalog";
import { LOCALE_BY_LANGUAGE } from "@/i18n";
import { resolveLanguage } from "@/i18n/language";

const inputClass = "h-10 rounded-md border bg-background px-3 text-sm";
export function RealEstateDemoCatalog({ selection }: { selection?: string }) {
  const { t, i18n } = useTranslation();
  const l = (key: string, values: Record<string, unknown> = {}) =>
    t(`realEstateDemo.catalog.${key}`, values);
  const [items, setItems] = useState(buildDemoCatalog);
  const [selected, setSelected] = useState<string[]>(demoCatalogSelection(selection) ?? []);
  const [client, setClient] = useState(selection !== undefined);
  const [purpose, setPurpose] = useState("");
  const [kind, setKind] = useState("");
  const [budget, setBudget] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [editing, setEditing] = useState<DemoListing | null>(null);
  const [contact, setContact] = useState("");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const objectUrls = useRef<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const title = (p: DemoListing) =>
    p.title || l("sampleTitle", { kind: l(p.kind), district: p.district });
  const description = (p: DemoListing) => p.description || l("sampleDescription");
  const price = (p: DemoListing) =>
    new Intl.NumberFormat(LOCALE_BY_LANGUAGE[resolveLanguage(i18n.resolvedLanguage)], {
      style: "currency",
      currency: "BRL",
    }).format(p.amount);
  const budgetNumber = budget.trim() ? Number(budget.replace(",", ".")) : null;
  const filtered = filterDemoCatalog(
    client ? items.filter((p) => selected.includes(p.id)) : items,
    purpose,
    kind,
    budgetNumber,
    search,
  );
  const visible = client
    ? filtered
    : [
        ...filtered,
        ...items.filter(
          (p) => !p.published && (!search || p.id.toLowerCase().includes(search.toLowerCase())),
        ),
      ];
  const current = items.find((p) => p.id === detail && p.published);
  const chosen = selected.filter((id) => items.some((p) => p.id === id && p.published));
  function shareUrl() {
    return demoCatalogUrl(window.location.origin, chosen);
  }
  async function copy() {
    const url = shareUrl();
    if (!url) return;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(l("copied"));
    } catch {
      /* O endereço permanece selecionável. */
    }
  }
  function request(p: DemoListing, visit: boolean) {
    const url = demoCatalogUrl(window.location.origin, [p.id]);
    setContact(
      `${l(visit ? "requestVisit" : "requestInfo", { title: title(p), id: p.id })}\n${url}`,
    );
  }
  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-slate-950 p-5 text-white sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">
          {l(client ? "client" : "business")}
        </p>
        <h3 className="mt-2 text-2xl font-semibold">{l("title")}</h3>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">{l("intro")}</p>
        <p className="mt-3 text-xs text-amber-200">{l("note")}</p>
      </div>
      <p className="text-sm text-muted-foreground">{l("privacy")}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          aria-label={l("allPurposes")}
          className={inputClass}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        >
          <option value="">{l("allPurposes")}</option>
          <option value="venda">{t("realEstateDemo.purpose.venda")}</option>
          <option value="locacao">{t("realEstateDemo.purpose.locacao")}</option>
        </select>
        <select
          aria-label={l("allKinds")}
          className={inputClass}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">{l("allKinds")}</option>
          <option value="house">{l("house")}</option>
          <option value="apartment">{l("apartment")}</option>
        </select>
        <Input
          type="number"
          min="0"
          aria-label={l("budget")}
          placeholder={l("budget")}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
        <Input
          aria-label={l("search")}
          placeholder={l("search")}
          maxLength={120}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        {client ? (
          <Button variant="outline" onClick={() => setClient(false)}>
            {l("back")}
          </Button>
        ) : (
          <>
            <span className="mr-auto text-sm font-medium">
              {l("selected", { count: chosen.length })}
            </span>
            <Button
              variant="outline"
              disabled={!chosen.length}
              onClick={() => {
                setClient(true);
                setDetail(null);
              }}
            >
              <Eye className="size-4" aria-hidden />
              {l("preview")}
            </Button>
            <Button variant="outline" disabled={!chosen.length} onClick={copy}>
              <Share2 className="size-4" aria-hidden />
              {l("copy")}
            </Button>
            <Button
              disabled={!chosen.length}
              onClick={() => {
                const url = shareUrl();
                if (url)
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(`${l("message")}\n${url}`)}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
              }}
            >
              <MessageCircle className="size-4" aria-hidden />
              {l("share")}
            </Button>
          </>
        )}
      </div>
      {!client && <p className="text-xs text-muted-foreground">{l("shareNote")}</p>}
      {link && !client && (
        <Label className="block space-y-2">
          {l("fallback")}
          <Input value={link} readOnly onFocus={(e) => e.target.select()} />
        </Label>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((p) => (
          <article key={p.id} className="overflow-hidden rounded-2xl border bg-card">
            <div className="relative aspect-[4/3] bg-muted">
              <img
                src={p.photos[0]}
                alt={title(p)}
                className="h-full w-full object-cover"
                loading="lazy"
                width={960}
                height={720}
              />
              <span className="absolute left-3 top-3 rounded-full bg-background/95 px-3 py-1 text-xs font-medium">
                {t(`realEstateDemo.purpose.${p.purpose}`)}
              </span>
            </div>
            <div className="space-y-3 p-4">
              <p className="font-mono text-xs text-muted-foreground">
                {p.id}
                {!client && ` · ${l(p.published ? "published" : "draft")}`}
              </p>
              <h4 className="text-lg font-semibold">{title(p)}</h4>
              <p className="text-sm text-muted-foreground">{p.district} · Anchieta, ES</p>
              <p className="text-xl font-semibold">
                {price(p)}
                <span className="text-xs font-normal text-muted-foreground">
                  {p.purpose === "locacao" ? l("perMonth") : ""}
                </span>
              </p>
              <p className="text-sm">
                {p.area} m² · {p.bedrooms} {l("bedrooms").toLowerCase()} · {p.parking}{" "}
                {l("parking").toLowerCase()}
              </p>
              {!client && (
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!p.published}
                    checked={chosen.includes(p.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...new Set([...ids, p.id])]
                          : ids.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {l("select")}
                </Label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!p.published}
                  onClick={() => {
                    setDetail(p.id);
                    setPhoto(0);
                  }}
                >
                  {l("details")}
                </Button>
                {!client && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditing({ ...p, title: title(p), description: description(p) })
                    }
                  >
                    {l("edit")}
                  </Button>
                )}
                {client && (
                  <Button size="sm" onClick={() => request(p, false)}>
                    {l("info")}
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 size-6" aria-hidden />
          {l("empty")}
        </p>
      )}
      <Dialog
        open={Boolean(current)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{current ? title(current) : l("details")}</DialogTitle>
            <DialogDescription>{l("note")}</DialogDescription>
          </DialogHeader>
          {current && (
            <>
              <img
                src={current.photos[photo] || current.photos[0]}
                alt={l("photo", { number: photo + 1 })}
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              <div className="flex gap-2 overflow-x-auto pb-2">
                {current.photos.map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    aria-label={l("photo", { number: index + 1 })}
                    aria-pressed={photo === index}
                    onClick={() => setPhoto(index)}
                    className={`shrink-0 overflow-hidden rounded-lg border-2 ${photo === index ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={url} alt="" className="h-16 w-24 object-cover" />
                  </button>
                ))}
              </div>
              <p className="text-2xl font-semibold">
                {price(current)}{" "}
                {current.purpose === "locacao" && (
                  <span className="text-sm font-normal">{l("perMonth")}</span>
                )}
              </p>
              <p className="text-sm">
                {current.district} · Anchieta, ES · {current.area} m²
              </p>
              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-3 text-center text-sm">
                {(["bedrooms", "bathrooms", "parking"] as const).map((key) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">{l(key)}</dt>
                    <dd className="font-semibold">{current[key]}</dd>
                  </div>
                ))}
              </dl>
              <p className="whitespace-pre-line text-sm leading-6">{description(current)}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => request(current, false)}>{l("info")}</Button>
                <Button variant="outline" onClick={() => request(current, true)}>
                  {l("visit")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !uploading) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{l("edit")}</DialogTitle>
            <DialogDescription>{t("demo.table.tempChange")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  !editing.title.trim() ||
                  editing.description.trim().length < 10 ||
                  [editing.bedrooms, editing.bathrooms, editing.parking].some(
                    (n) => !Number.isInteger(n) || n < 0 || n > 99,
                  )
                ) {
                  toast.error(l("fieldsError"));
                  return;
                }
                setItems((rows) => rows.map((p) => (p.id === editing.id ? editing : p)));
                if (!editing.published) setSelected((ids) => ids.filter((id) => id !== editing.id));
                setEditing(null);
                toast.success(t("demo.table.tempChange"));
              }}
            >
              <Label className="block space-y-2">
                {l("publicTitle")}
                <Input
                  required
                  maxLength={160}
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </Label>
              <Label className="block space-y-2">
                {l("description")}
                <textarea
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={4}
                  className="w-full rounded-md border bg-background p-3 text-sm"
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {(["bedrooms", "bathrooms", "parking"] as const).map((key) => (
                  <Label key={key} className="space-y-2">
                    {l(key)}
                    <Input
                      required
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      value={editing[key]}
                      onChange={(e) => setEditing({ ...editing, [key]: Number(e.target.value) })}
                    />
                  </Label>
                ))}
              </div>
              <div className="flex gap-2 overflow-x-auto">
                {editing.photos.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt={l("photo", { number: index + 1 })}
                    className="h-20 w-28 shrink-0 rounded-md object-cover"
                  />
                ))}
              </div>
              <Label className="block space-y-2">
                {l("addPhoto")}
                <Input
                  type="file"
                  disabled={uploading || editing.photos.length >= 20}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (editing.photos.length >= 20) {
                      toast.error(l("limit"));
                      return;
                    }
                    const id = editing.id;
                    setUploading(true);
                    try {
                      const blob = await prepareCatalogPhoto(file);
                      if (!alive.current) return;
                      const url = URL.createObjectURL(blob);
                      objectUrls.current.push(url);
                      setEditing((p) => (p?.id === id ? { ...p, photos: [...p.photos, url] } : p));
                    } catch {
                      if (alive.current) toast.error(l("uploadError"));
                    } finally {
                      if (alive.current) setUploading(false);
                    }
                  }}
                />
              </Label>
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                />
                {l("publish")}
              </Label>
              <Button disabled={uploading} type="submit">
                {l("save")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(contact)}
        onOpenChange={(open) => {
          if (!open) setContact("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{l("contactTitle")}</DialogTitle>
            <DialogDescription>{l("contactNote")}</DialogDescription>
          </DialogHeader>
          <p className="break-words whitespace-pre-line rounded-xl bg-muted p-4 text-sm">
            {contact}
          </p>
          <Button onClick={() => setContact("")}>{l("close")}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
