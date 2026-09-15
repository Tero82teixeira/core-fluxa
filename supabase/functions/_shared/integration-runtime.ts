import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";

export const EDGE_FUNCTION_RELEASE = "2026.10.08.1";

export async function recordIntegrationHeartbeat(
  service: SupabaseClient,
  functionName: string,
): Promise<void> {
  try {
    const { error } = await service.rpc("record_integration_runtime_heartbeat", {
      _function_name: functionName,
      _release_version: EDGE_FUNCTION_RELEASE,
    });
    if (error && !["PGRST202", "42883"].includes(String(error.code))) {
      console.warn(JSON.stringify({ source: functionName, code: "RUNTIME_HEARTBEAT_FAILED" }));
    }
  } catch {
    // A implantação da função pode acontecer antes da migration. A operação
    // principal não deve falhar somente porque o diagnóstico ainda não existe.
  }
}

export function runtimeHeaders(): Record<string, string> {
  return { "x-fluxa-function-version": EDGE_FUNCTION_RELEASE };
}
