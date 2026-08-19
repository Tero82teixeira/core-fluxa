-- ETAPA 18: final least-privilege pass for client database roles.
-- Existing business RPC grants and service_role privileges are intentionally untouched.

DO $stage18$
DECLARE
  relation regclass;
BEGIN
  FOR relation IN
    SELECT c.oid::regclass
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM anon', relation);
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %s FROM authenticated',
      relation
    );
  END LOOP;
END
$stage18$;

-- Configuration/reference relations are read-only to the browser. Mutations of
-- these relations are either absent from the current client or use reviewed RPCs.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.permissions,
  public.role_permissions,
  public.client_addresses,
  public.client_contacts
FROM authenticated;

-- Browser-managed resources use soft deletion/archiving. Their reviewed direct
-- contracts require SELECT/INSERT/UPDATE, never physical DELETE.
REVOKE DELETE ON TABLE
  public.profiles,
  public.organizations,
  public.clients,
  public.processes,
  public.tasks,
  public.process_checklist_items,
  public.document_types,
  public.documents,
  public.document_versions,
  public.monitoring_items,
  public.monitoring_history,
  public.task_comments,
  public.task_history
FROM authenticated;

-- These write paths were hardened in earlier stages and remain RPC/trigger-only.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.audit_logs,
  public.organization_counters,
  public.organization_invitations,
  public.notifications,
  public.automation_rules,
  public.automation_executions,
  public.monitoring_states,
  public.monitoring_state_history,
  public.communication_threads,
  public.communication_entries,
  public.support_requests,
  public.financial_categories,
  public.financial_accounts,
  public.financial_transactions,
  public.financial_transaction_payments,
  public.financial_recurrences,
  public.financial_account_movements
FROM authenticated;

-- New objects must opt in to their client-facing contract explicitly. PostgreSQL
-- defaults for postgres-owned objects otherwise outlive per-object hardening.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
