import type {
  AsaasAutomationStatus,
  IntegrationCredential,
  IntegrationReportItem,
} from "@/hooks/use-integration-actions";
import type { IntegrationHealthItem } from "@/lib/integration-health";

type IntegrationSupportDiagnosticInput = {
  generatedAt: string;
  health: IntegrationHealthItem[];
  credentials: IntegrationCredential[];
  report: IntegrationReportItem[];
  asaasAutomation: AsaasAutomationStatus | null;
};

export function buildIntegrationSupportDiagnostic({
  generatedAt,
  health,
  credentials,
  report,
  asaasAutomation,
}: IntegrationSupportDiagnosticInput): string {
  return JSON.stringify(
    {
      generated_at: generatedAt,
      health: health.map((item) => ({
        integration_key: item.integration_key,
        category: item.category,
        status: item.status,
        expected_version: item.expected_version,
        reported_version: item.reported_version,
        last_activity_at: item.last_activity_at,
        pending_count: item.pending_count,
        error_count: item.error_count,
        last_error_code: item.last_error_code,
      })),
      credentials: credentials.map((item) => ({
        integration_key: item.integration_key,
        status: item.status,
        last_validated_at: item.last_validated_at,
        days_since_validation: item.days_since_validation,
        diagnostic_code: item.diagnostic_code,
      })),
      report: report.map((item) => ({
        provider: item.provider,
        total_count: item.total_count,
        processed_count: item.processed_count,
        warning_count: item.warning_count,
        failed_count: item.failed_count,
        success_rate: item.success_rate,
        last_event_at: item.last_event_at,
      })),
      asaas_automation: asaasAutomation
        ? {
            last_run_at: asaasAutomation.last_run_at,
            processed_count: asaasAutomation.processed_count,
            succeeded_count: asaasAutomation.succeeded_count,
            failed_count: asaasAutomation.failed_count,
            queued_count: asaasAutomation.queued_count,
            next_attempt_at: asaasAutomation.next_attempt_at,
          }
        : null,
    },
    null,
    2,
  );
}
