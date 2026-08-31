BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions, pg_temp;
SELECT no_plan();

SELECT has_column(
  'public', 'organization_subscriptions', 'access_until',
  'paid access end is persisted'
);
SELECT has_column(
  'public', 'organization_subscriptions', 'next_payment_at',
  'next payment is persisted'
);
SELECT has_function(
  'public', 'suspend_expired_kiwify_subscriptions',
  ARRAY['timestamp with time zone', 'integer'],
  'trusted Kiwify expiry processor exists'
);

SELECT ok(
  has_function_privilege(
    'postgres',
    'public.suspend_expired_kiwify_subscriptions(timestamp with time zone,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.suspend_expired_kiwify_subscriptions(timestamp with time zone,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.suspend_expired_kiwify_subscriptions(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'only the trusted scheduler can expire paid access'
);

SELECT is(
  (
    SELECT count(*)::integer
      FROM cron.job AS job
     WHERE job.jobname = 'core-fluxa-process-due-scheduled-automations'
  ),
  1,
  'subscription expiry reuses the single temporal job'
);
SELECT ok(
  EXISTS (
    SELECT 1
      FROM cron.job AS job
     WHERE job.jobname = 'core-fluxa-process-due-scheduled-automations'
       AND job.command = 'SELECT public.run_temporal_automation_cycle();'
  ),
  'the established temporal command remains unchanged'
);
SELECT ok(
  pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%suspend_expired_kiwify_subscriptions()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%kiwify_subscriptions_suspended%',
  'subscription expiry is an isolated stage of the temporal cycle'
);
SELECT ok(
  pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%create_weekly_productivity_report_notifications()%'
  AND pg_get_functiondef(
    'public.run_temporal_automation_cycle()'::regprocedure
  ) LIKE '%weekly_productivity_reports_created%',
  'the latest pre-existing temporal stage remains present'
);

SELECT * FROM finish();
ROLLBACK;
