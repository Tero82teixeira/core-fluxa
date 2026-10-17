import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  emptyPreferences,
  preferenceIssues,
  type PropertyPreferences,
  type PreferenceMatch,
} from "@/lib/real-estate-preferences";
import { demoCatalogUrl, type DemoListing } from "@/lib/real-estate-demo-catalog";
import { PreferencesForm, PreferenceSelection } from "./preference-selection";
export function DemoPreferencesDialog({
  name,
  initial,
  purpose,
  items,
  title,
  onSave,
  onClose,
}: {
  name: string;
  initial: PropertyPreferences | null;
  purpose: "venda" | "locacao";
  items: DemoListing[];
  title: (p: DemoListing) => string;
  onSave: (p: PropertyPreferences) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const l = (k: string) => t(`realEstateDemo.preferences.${k}`);
  const [selected, setSelected] = useState<string[]>([]),
    [link, setLink] = useState("");
  const [only, setOnly] = useState(true);
  const matches: PreferenceMatch[] = !initial
    ? []
    : items
        .filter((p) => p.published)
        .map((p) => {
          const listing = {
            id: p.id,
            code: p.id,
            title: title(p),
            description: p.description,
            purpose: p.purpose,
            property_type: p.kind === "house" ? "casa" : "apartamento",
            district: p.district,
            city: "Anchieta",
            state: "ES",
            sale_price: p.purpose === "venda" ? p.amount : null,
            rent_price: p.purpose === "locacao" ? p.amount : null,
            bedrooms: p.bedrooms,
            parking: p.parking,
            bathrooms: p.bathrooms,
            area_m2: p.area,
            features: "",
            photos: p.photos.map((url, i) => ({ id: String(i), path: url, url, caption: "" })),
          };
          return { ...listing, issues: preferenceIssues(initial, listing) };
        })
        .filter((p) => !only || !p.issues.length)
        .sort((a, b) => a.issues.length - b.issues.length || a.code.localeCompare(b.code));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="demo-mobile-dialog max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {l("title")} · {name}
          </DialogTitle>
          <DialogDescription>{l("demoIntro")}</DialogDescription>
        </DialogHeader>
        <PreferencesForm
          initial={initial || emptyPreferences(purpose)}
          writable
          busy={false}
          onSave={async (p) => {
            onSave(p);
            setSelected([]);
            setLink("");
          }}
        />
        {initial && (
          <PreferenceSelection
            items={matches}
            total={matches.length}
            page={1}
            onPage={() => {}}
            only={only}
            onOnly={setOnly}
            selected={selected}
            onSelect={(ids) => {
              setSelected(ids);
              setLink("");
            }}
            link={link}
            busy={false}
            purpose={initial.purpose}
            demo
            onGenerate={async () => {
              const ids = selected.filter((id) => items.some((p) => p.id === id && p.published));
              if (ids.length === selected.length)
                setLink(demoCatalogUrl(window.location.origin, ids) || "");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
