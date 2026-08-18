-- process_automation_event is an internal automation-engine entry point. Its
-- SECURITY DEFINER trigger callers run as their owner, so client roles do not
-- need direct execution privileges for trigger-driven automations to work.
REVOKE EXECUTE ON FUNCTION public.process_automation_event(uuid, text, text, uuid, jsonb, uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_automation_event(uuid, text, text, uuid, jsonb, uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_automation_event(uuid, text, text, uuid, jsonb, uuid, integer, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.process_automation_event(uuid, text, text, uuid, jsonb, uuid, integer, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.process_automation_event(uuid, text, text, uuid, jsonb, uuid, integer, text) TO service_role;
