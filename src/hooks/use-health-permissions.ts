import { useWorkspace } from "@/lib/workspace";
import { healthPermissionsFor } from "@/lib/health-access";

export function useHealthPermissions() {
  const { role, membership } = useWorkspace();
  return healthPermissionsFor(role, membership?.organizations?.organization_settings);
}
