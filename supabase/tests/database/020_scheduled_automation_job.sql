BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT has_extension('pg_cron', 'pg_cron is installed for the temporal job');

SELECT is(
  (SELECT count(*) FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  1::bigint,
  'exactly one temporal automation job exists'
);
SELECT is(
  (SELECT schedule FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  '*/15 * * * *',
  'temporal automation job runs every fifteen minutes'
);
SELECT is(
  (SELECT command FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'SELECT public.run_temporal_automation_cycle();',
  'job invokes only the private tenant-derived temporal cycle'
);
SELECT ok(
  (SELECT active FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'temporal automation job is active'
);
SELECT is(
  (SELECT database FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  current_database()::text,
  'job targets the current operational database'
);
SELECT is(
  (SELECT username FROM cron.job
   WHERE jobname = 'core-fluxa-process-due-scheduled-automations'),
  'postgres',
  'job executes as the reviewed trusted database role'
);

SELECT ok(
  NOT has_schema_privilege('anon', 'cron', 'USAGE')
  AND NOT has_schema_privilege('authenticated', 'cron', 'USAGE'),
  'client roles cannot access the cron schema'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.process_due_scheduled_automations(timestamptz,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.process_due_scheduled_automations(timestamptz,integer)',
    'EXECUTE'
  ),
  'client roles still cannot invoke the temporal executor'
);

SELECT * FROM finish();
ROLLBACK;
