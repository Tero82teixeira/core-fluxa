import { FilterX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ActiveFilters({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
      <Badge variant="secondary">
        {count} {count === 1 ? "filtro ativo" : "filtros ativos"}
      </Badge>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        <FilterX className="mr-2 size-4" aria-hidden />
        Limpar filtros
      </Button>
    </div>
  );
}
