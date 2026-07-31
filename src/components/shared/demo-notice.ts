import { toast } from "sonner";

/**
 * TODO(supabase): enquanto DEMO_MODE estiver ativo, ações que exigem
 * persistência apenas informam o usuário — nada é gravado.
 */
export function notifyDemoAction(context?: string) {
  toast.info("Esta ação será ativada após a conexão com o banco de dados.", {
    description: context,
    duration: 4000,
  });
}

export function notifyDemoSessionChange(context: string) {
  toast.success("Alteração aplicada somente nesta demonstração.", {
    description: context,
    duration: 3500,
  });
}

/** Toast específico do Kanban ao mover um card entre etapas. */
export function notifyDemoStageChange(context: string) {
  toast.success("Etapa alterada temporariamente no modo demonstração.", {
    description: context,
    duration: 3500,
  });
}

/** Módulos ainda não desenvolvidos. */
export function notifyFutureModule(moduleName: string) {
  toast.info("Este módulo será ativado nas próximas etapas da FLUXA.", {
    description: moduleName,
    duration: 4000,
  });
}
