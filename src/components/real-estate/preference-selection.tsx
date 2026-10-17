import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import {
  validatePreferences,
  type PropertyPreferences,
  type PreferenceMatch,
} from "@/lib/real-estate-preferences";
export function PreferencesForm({
  initial,
  writable,
  busy,
  onSave,
  children,
  submitLabel,
}: {
  children?: ReactNode;
  submitLabel?: string;
  initial: PropertyPreferences;
  writable: boolean;
  busy: boolean;
  onSave: (p: PropertyPreferences) => Promise<void>;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.preferences.${k}`);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [kind, setKind] = useState(initial.property_type);
  const [districts, setDistricts] = useState(initial.districts.join(", "));
  const [max, setMax] = useState(String(initial.max_price ?? ""));
  const [bedrooms, setBedrooms] = useState(String(initial.bedrooms ?? ""));
  const [parking, setParking] = useState(String(initial.parking ?? ""));
  const field = "min-h-11 w-full rounded-md border bg-background px-3 text-base";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const number = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);
          await onSave(
            validatePreferences({
              purpose,
              property_type: kind,
              districts: districts.trim() ? districts.split(",") : [],
              max_price: number(max),
              bedrooms: number(bedrooms),
              parking: number(parking),
            }),
          );
        } catch {
          toast.error(l("invalid"));
        }
      }}
      className="min-w-0 space-y-3"
    >
      <fieldset disabled={!writable || busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {children}
        <Label className="block min-w-0 space-y-2">
          {l("purpose")}
          <select
            className={field}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as PropertyPreferences["purpose"])}
          >
            <option value="venda">{l("sale")}</option>
            <option value="locacao">{l("rent")}</option>
          </select>
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("property_type")}
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
            {["", "casa", "apartamento", "terreno", "comercial", "rural", "outro"].map((k) => (
              <option key={k} value={k}>
                {l(k || "any")}
              </option>
            ))}
          </select>
        </Label>
        <Label className="block min-w-0 space-y-2 sm:col-span-2">
          {l("districts")}
          <Input
            maxLength={809}
            value={districts}
            onChange={(e) => setDistricts(e.target.value)}
            placeholder={l("districtHint")}
          />
          <span className="block text-xs font-normal text-muted-foreground">
            {l("districtNote")}
          </span>
        </Label>
        <Label className="block min-w-0 space-y-2">
          {l("max_price")}
          <Input
            inputMode="decimal"
            maxLength={16}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder={l("optional")}
          />
          <span className="block text-xs font-normal text-muted-foreground">
            {l(purpose === "locacao" ? "monthly" : "saleBudget")}
          </span>
        </Label>
        <div className="grid min-w-0 grid-cols-2 gap-3">
          {(["bedrooms", "parking"] as const).map((key) => (
            <Label key={key} className="block min-w-0 space-y-2">
              {l(key)}
              <Input
                type="number"
                min={0}
                max={99}
                step={1}
                value={key === "bedrooms" ? bedrooms : parking}
                onChange={(e) => (key === "bedrooms" ? setBedrooms : setParking)(e.target.value)}
                placeholder={l("optional")}
              />
            </Label>
          ))}
        </div>
        {writable && (
          <Button type="submit" disabled={busy} className="sm:col-span-2">
            {busy ? l("saving") : submitLabel || l("save")}
          </Button>
        )}
      </fieldset>
    </form>
  );
}
export function PreferenceSelection({
  items,
  total,
  page,
  onPage,
  only,
  onOnly,
  selected,
  onSelect,
  link,
  onGenerate,
  busy,
  purpose,
  phone = "",
  demo = false,
}: {
  items: PreferenceMatch[];
  total: number;
  page: number;
  onPage: (page: number) => void;
  only: boolean;
  onOnly: (only: boolean) => void;
  selected: string[];
  onSelect: (ids: string[]) => void;
  link: string;
  onGenerate: () => Promise<void>;
  busy: boolean;
  purpose: string;
  phone?: string;
  demo?: boolean;
}) {
  const { t } = useTranslation(undefined, { i18n });
  const l = (k: string) => t(`realEstateDemo.preferences.${k}`);
  return (
    <section className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">{l("matches")}</h3>
      <p className="text-sm text-muted-foreground">{l("resultsSaved")}</p>
      <Label className="flex items-center gap-2">
        <input type="checkbox" checked={only} onChange={(e) => onOnly(e.target.checked)} />
        {l("only")}
      </Label>
      <p className="text-sm">
        {total} {l("options")}
      </p>
      {!items.length && <p className="rounded-xl border border-dashed p-4 text-sm">{l("empty")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const amount = purpose === "venda" ? item.sale_price : item.rent_price;
          return (
            <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border">
              {item.photos[0]?.url && (
                <img
                  src={item.photos[0].url}
                  alt={item.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
              )}
              <div className="space-y-2 p-3">
                <p className="text-xs text-muted-foreground">
                  {item.code} · {item.district} · {item.city}
                </p>
                <h4 className="font-semibold">{item.title}</h4>
                <p>
                  {amount === null ? l("price_unknown") : formatCurrency(amount)}
                  {purpose === "locacao" && amount !== null && ` ${l("perMonth")}`}
                </p>
                <p className="text-sm">
                  {l("bedrooms")}: {item.bedrooms ?? "—"} · {l("parking")}: {item.parking ?? "—"}
                </p>
                <p
                  className={`text-sm ${item.issues.length ? "text-muted-foreground" : "font-semibold text-primary"}`}
                >
                  {item.issues.length
                    ? `${l("outside")}: ${item.issues.map((k) => l(`issue_${k}`)).join("; ")}`
                    : l("compatible")}
                </p>
                <Label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    disabled={busy || (!selected.includes(item.id) && selected.length >= 20)}
                    onChange={(e) =>
                      onSelect(
                        e.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {l("select")}
                </Label>
              </div>
            </article>
          );
        })}
      </div>
      {total > 20 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {l("previous")}
          </Button>
          <span>
            {page} / {Math.ceil(total / 20)}
          </span>
          <Button variant="outline" disabled={page * 20 >= total} onClick={() => onPage(page + 1)}>
            {l("next")}
          </Button>
        </div>
      )}
      <div className="space-y-3 rounded-xl bg-muted p-4">
        <p>
          {selected.length}/20 {l("selected")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!selected.length || busy} onClick={() => void onGenerate()}>
            {l("generate")}
          </Button>
          <Button
            variant="outline"
            disabled={!selected.length || busy}
            onClick={() => onSelect([])}
          >
            {l("clear")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{l(demo ? "demoNote" : "shareNote")}</p>
        {link && (
          <>
            <Label className="block space-y-2">
              {l("link")}
              <Input value={link} readOnly onFocus={(e) => e.target.select()} />
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    toast.success(l("copied"));
                  } catch {
                    toast.info(l("copyFallback"));
                  }
                }}
              >
                {l("copy")}
              </Button>
              <Button asChild variant="outline">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  {l("preview")}
                </a>
              </Button>
              <Button asChild>
                <a
                  href={`https://wa.me/${demo ? "" : phone}?text=${encodeURIComponent(`${l("message")}\n${link}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l("whatsapp")}
                </a>
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
