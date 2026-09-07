import { useEffect, useState } from "react";
import { BookmarkPlus, X } from "lucide-react";
import { toast } from "sonner";

import {
  addSavedCommunicationFilter,
  readSavedCommunicationFilters,
  writeSavedCommunicationFilters,
  type CommunicationFilterPreset,
  type SavedCommunicationFilter,
} from "@/lib/communication-saved-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CommunicationSavedFilters({
  organizationId,
  current,
  onApply,
}: {
  organizationId: string | null;
  current: CommunicationFilterPreset;
  onApply: (filters: CommunicationFilterPreset) => void;
}) {
  const [items, setItems] = useState<SavedCommunicationFilter[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setItems(
      organizationId ? readSavedCommunicationFilters(window.localStorage, organizationId) : [],
    );
  }, [organizationId]);

  function persist(next: SavedCommunicationFilter[]) {
    setItems(next);
    if (organizationId) {
      writeSavedCommunicationFilters(window.localStorage, organizationId, next);
    }
  }

  function save() {
    const next = addSavedCommunicationFilter(items, name, current);
    if (next === items) return toast.error("Informe um nome para o filtro.");
    persist(next);
    setName("");
    setOpen(false);
    toast.success("Filtro salvo neste dispositivo.");
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <BookmarkPlus className="mr-2 size-4" />
        Salvar filtro
      </Button>
      {items.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          Salve combinações usadas com frequência.
        </span>
      ) : (
        items.map((item) => (
          <div key={item.id} className="inline-flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-r-none border"
              onClick={() => onApply(item.filters)}
            >
              {item.name}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 rounded-l-none border border-l-0"
              aria-label={`Excluir filtro ${item.name}`}
              onClick={() => persist(items.filter((saved) => saved.id !== item.id))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))
      )}
      {items.length > 0 && (
        <Badge variant="outline" className="ml-auto">
          {items.length}/8 salvos
        </Badge>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar combinação de filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="communication-filter-name">Nome do filtro</Label>
            <Input
              id="communication-filter-name"
              autoFocus
              maxLength={40}
              placeholder="Ex.: Urgentes sem responsável"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={save}>
              Salvar filtro
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
