-- Stage 23: one trusted, low-frequency Lovable Cloud job for temporal rules.
-- The executor derives every tenant from locked schedule rows and accepts no
-- organization argument. Reapplying this migration replaces, never duplicates,
-- the named job.

CREATE EXTENSION IF NOT EXISTS pg_cron;

REVOKE ALL ON SCHEMA cron FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA cron FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cron FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cron FROM PUBLIC, anon, authenticated;

DO $scheduler$
DECLARE
  existing_job record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'SCHEDULER_REQUIRES_POSTGRES';
  END IF;

  IF to_regprocedure(
    'public.process_due_scheduled_automations(timestamp with time zone,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'SCHEDULED_EXECUTOR_NOT_FOUND';
  END IF;

  IF NOT has_function_privilege(
    'postgres',
    'public.process_due_scheduled_automations(timestamp with time zone,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SCHEDULED_EXECUTOR_NOT_EXECUTABLE';
  END IF;

  FOR existing_job IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'core-fluxa-process-due-scheduled-automations'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'core-fluxa-process-due-scheduled-automations',
    '*/15 * * * *',
    'SELECT public.process_due_scheduled_automations();'
  );
END;
$scheduler$;
