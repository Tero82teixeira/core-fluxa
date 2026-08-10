BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(13);

SELECT ok(public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{"status":"open"}'), 'equals accepts equal values');
SELECT ok(NOT public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{"status":"closed"}'), 'equals rejects different values');
SELECT ok(public.automation_conditions_match('[{"field":"status","operator":"not_equals","value":"closed"}]', '{"status":"open"}'), 'not_equals accepts different values');
SELECT ok(NOT public.automation_conditions_match('[{"field":"status","operator":"not_equals","value":"open"}]', '{"status":"open"}'), 'not_equals rejects equal values');
SELECT ok(public.automation_conditions_match('[{"field":"title","operator":"contains","value":"flux"}]', '{"title":"Core FLUXA"}'), 'contains is case insensitive');
SELECT ok(NOT public.automation_conditions_match('[{"field":"title","operator":"contains","value":"flux"}]', '{}'), 'contains rejects a missing field');
SELECT ok(public.automation_conditions_match('[{"field":"note","operator":"is_empty"}]', '{"note":""}'), 'is_empty accepts an empty string');
SELECT ok(public.automation_conditions_match('[{"field":"note","operator":"is_not_empty"}]', '{"note":"text"}'), 'is_not_empty accepts text');
SELECT ok(public.automation_conditions_match('[{"field":"due_at","operator":"before","value":"2026-08-11T00:00:00Z"}]', '{"due_at":"2026-08-10T00:00:00Z"}'), 'before accepts an earlier timestamp');
SELECT ok(public.automation_conditions_match('[{"field":"due_at","operator":"after","value":"2026-08-09T00:00:00Z"}]', '{"due_at":"2026-08-10T00:00:00Z"}'), 'after accepts a later timestamp');
SELECT ok(public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"},{"field":"title","operator":"contains","value":"flux"}]', '{"status":"open","title":"Fluxa"}'), 'multiple conditions must all match');
SELECT ok(NOT public.automation_conditions_match('[{"field":"status","operator":"unknown","value":"open"}]', '{"status":"open"}'), 'unknown operators fail closed');
SELECT ok(NOT public.automation_conditions_match('[{"field":"status","operator":"equals","value":"open"}]', '{}'), 'equals rejects a missing payload field');

SELECT * FROM finish();
ROLLBACK;
