import { toast } from "sonner";

/**
 * TODO(supabase): enquanto DEMO_MODE estiver ativo, ações que exigem
 * persistência apenas informam o usuário — nada é gravado.
 */
export function notifyDemoAction(context?: string) {
  toast.info("Esta ação será ativada após a conexão com o banco de dados.", {
    description: context,
  });
}

export function notifyDemoSessionChange(context: string) {
  toast.success("Alteração aplicada apenas nesta sessão de demonstração.", {
    description: context,
  });
}
