import { WandSparkles } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CommunicationMacro } from "@/hooks/use-communication-macros";

export function CommunicationMacroPicker({
  macros,
  onApply,
  loading = false,
  disabled = false,
}: {
  macros: readonly CommunicationMacro[];
  onApply: (macro: CommunicationMacro) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const active = macros.filter((macro) => macro.is_active);
  if (!loading && active.length === 0) return null;
  return (
    <Select
      value="macro-placeholder"
      disabled={disabled || loading}
      onValueChange={(id) => {
        const macro = active.find((item) => item.id === id);
        if (macro) onApply(macro);
      }}
    >
      <SelectTrigger className="min-w-48" aria-label="Aplicar macro de atendimento">
        <WandSparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <SelectValue placeholder={loading ? "Carregando macros…" : "Aplicar macro"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="macro-placeholder" disabled>
          Escolha uma macro
        </SelectItem>
        {active.map((macro) => (
          <SelectItem key={macro.id} value={macro.id}>
            {macro.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
