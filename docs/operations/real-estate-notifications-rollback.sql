BEGIN;
DO $$
DECLARE existing_job record;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'SCHEDULER_REQUIRES_POSTGRES'; END IF;
  FOR existing_job IN SELECT * FROM cron.job
    WHERE jobname='core-fluxa-process-due-scheduled-automations'
      AND command='SELECT fluxa_real_estate_private.run_temporal_with_real_estate();'
  LOOP
    PERFORM cron.alter_job(existing_job.jobid,command := 'SELECT public.run_temporal_automation_cycle();');
  END LOOP;
END;
$$;
DROP FUNCTION IF EXISTS fluxa_real_estate_private.run_temporal_with_real_estate();
DROP FUNCTION IF EXISTS fluxa_real_estate_private.create_operational_notifications(timestamptz);
COMMIT;
