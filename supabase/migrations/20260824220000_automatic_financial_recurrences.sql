-- Stage 35: generate configured financial recurrences automatically with the
-- existing private fifteen-minute clock. Users retain control through each
-- recurrence's active/paused/finished status and the existing manual RPC.

CREATE OR REPLACE FUNCTION public.process_due_financial_recurrences()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recurrence_record record;
  run_date date;
  generated_for_recurrence integer;
  generated_total integer := 0;
  inserted_count integer;
  iteration_count integer;
BEGIN
  FOR recurrence_record IN
    SELECT
      recurrence.*,
      (
        now() AT TIME ZONE CASE
          WHEN EXISTS (
            SELECT 1
            FROM pg_catalog.pg_timezone_names AS zone
            WHERE zone.name = settings.timezone
          ) THEN settings.timezone
          ELSE 'America/Sao_Paulo'
        END
      )::date AS organization_date
    FROM public.financial_recurrences AS recurrence
    JOIN public.organizations AS organization
      ON organization.id = recurrence.organization_id
     AND organization.archived_at IS NULL
    LEFT JOIN public.organization_settings AS settings
      ON settings.organization_id = recurrence.organization_id
    WHERE recurrence.status = 'active'
      AND recurrence.archived_at IS NULL
      AND recurrence.next_run_date <= (
        now() AT TIME ZONE CASE
          WHEN EXISTS (
            SELECT 1
            FROM pg_catalog.pg_timezone_names AS zone
            WHERE zone.name = settings.timezone
          ) THEN settings.timezone
          ELSE 'America/Sao_Paulo'
        END
      )::date
    ORDER BY recurrence.next_run_date, recurrence.id
    FOR UPDATE OF recurrence SKIP LOCKED
  LOOP
    BEGIN
      run_date := recurrence_record.next_run_date;
      generated_for_recurrence := 0;
      iteration_count := 0;

      IF recurrence_record.frequency NOT IN (
        'weekly', 'monthly', 'quarterly', 'yearly'
      ) THEN
        RAISE EXCEPTION 'INVALID_FREQUENCY';
      END IF;

      WHILE run_date <= recurrence_record.organization_date
        AND (
          recurrence_record.end_date IS NULL
          OR run_date <= recurrence_record.end_date
        )
        AND iteration_count < 120
      LOOP
        INSERT INTO public.financial_transactions(
          organization_id,
          type,
          description,
          amount,
          category_id,
          account_id,
          due_date,
          competence_date,
          client_id,
          process_id,
          notes,
          recurrence_id,
          recurrence_due_date,
          created_by
        )
        VALUES (
          recurrence_record.organization_id,
          recurrence_record.type,
          recurrence_record.name,
          recurrence_record.amount,
          recurrence_record.category_id,
          recurrence_record.account_id,
          run_date,
          run_date,
          recurrence_record.client_id,
          recurrence_record.process_id,
          recurrence_record.notes,
          recurrence_record.id,
          run_date,
          recurrence_record.created_by
        )
        ON CONFLICT (recurrence_id, recurrence_due_date) DO NOTHING;

        GET DIAGNOSTICS inserted_count = ROW_COUNT;
        generated_for_recurrence :=
          generated_for_recurrence + inserted_count;
        iteration_count := iteration_count + 1;

        run_date := CASE recurrence_record.frequency
          WHEN 'weekly' THEN
            run_date + (7 * recurrence_record.interval_count)
          WHEN 'monthly' THEN
            run_date + make_interval(
              months => recurrence_record.interval_count
            )
          WHEN 'quarterly' THEN
            run_date + make_interval(
              months => 3 * recurrence_record.interval_count
            )
          WHEN 'yearly' THEN
            run_date + make_interval(
              years => recurrence_record.interval_count
            )
          ELSE run_date
        END;
      END LOOP;

      UPDATE public.financial_recurrences
      SET
        next_run_date = run_date,
        status = CASE
          WHEN end_date IS NOT NULL AND run_date > end_date
            THEN 'finished'
          ELSE status
        END
      WHERE id = recurrence_record.id
        AND organization_id = recurrence_record.organization_id;

      IF generated_for_recurrence > 0 THEN
        INSERT INTO public.audit_logs(
          organization_id,
          actor_id,
          actor_name,
          action,
          entity,
          entity_id,
          metadata
        )
        VALUES (
          recurrence_record.organization_id,
          NULL,
          'Automação',
          'financial.recurrence.generated',
          'financial_recurrence',
          recurrence_record.id,
          jsonb_build_object(
            'count', generated_for_recurrence,
            'automatic', true,
            'processed_through', recurrence_record.organization_date
          )
        );
      END IF;

      generated_total :=
        generated_total + generated_for_recurrence;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'FINANCIAL_RECURRENCE_FAILED: %, %',
        recurrence_record.id, SQLSTATE;
    END;
  END LOOP;

  RETURN generated_total;
END;
$$;

-- Preserve every existing temporal scan and isolate recurrence generation. No
-- additional pg_cron job is created by this migration.
CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scheduled_count integer;
  critical_count integer := 0;
  unassigned_count integer := 0;
  deadline_count integer := 0;
  overdue_escalation_count integer := 0;
  stale_process_count integer := 0;
  overdue_communication_count integer := 0;
  expired_document_count integer := 0;
  overdue_financial_count integer := 0;
  financial_recurrence_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    financial_recurrence_count :=
      public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    critical_count := public.create_critical_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    critical_count := -1;
    RAISE WARNING 'CRITICAL_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    unassigned_count := public.create_unassigned_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    unassigned_count := -1;
    RAISE WARNING 'UNASSIGNED_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    deadline_count := public.create_deadline_reminder_notifications();
  EXCEPTION WHEN OTHERS THEN
    deadline_count := -1;
    RAISE WARNING 'DEADLINE_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_escalation_count :=
      public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_communication_count :=
      public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    expired_document_count :=
      public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_financial_count :=
      public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created',
      financial_recurrence_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_financial_recurrences()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_due_financial_recurrences()
  TO postgres;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
