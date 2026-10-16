import { useState } from "react";
import type { CatalogPhoto } from "@/lib/real-estate-catalog";

export function CatalogGallery({ photos, title }: { photos: CatalogPhoto[]; title: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = photos.find((photo) => photo.id === selected) || photos[0];
  return (
    <div className="space-y-3">
      {active?.url ? (
        <img
          src={active.url}
          alt={active.caption || title}
          referrerPolicy="no-referrer"
          className="aspect-[4/3] w-full rounded-xl bg-muted object-contain"
        />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
          Foto indisponível. Atualize para tentar novamente.
        </div>
      )}
      {!!active?.caption && <p className="text-sm text-muted-foreground">{active.caption}</p>}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            aria-label={`Ver foto ${index + 1}`}
            aria-pressed={photo.id === active?.id}
            className="shrink-0 rounded-lg border p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSelected(photo.id)}
          >
            {photo.url ? (
              <img
                src={photo.url}
                alt={photo.caption || `Foto ${index + 1}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-16 w-20 rounded object-cover"
              />
            ) : (
              <span className="block h-16 w-20 text-xs">Foto {index + 1}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
