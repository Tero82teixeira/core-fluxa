-- Trigger helpers are internal implementation details and must not be directly
-- executable through PostgREST-facing roles. Trigger invocation does not depend
-- on the invoking role having EXECUTE on the trigger function.
REVOKE ALL ON FUNCTION public.communication_entry_validate_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.communication_entry_validate_scope() FROM anon;
REVOKE ALL ON FUNCTION public.communication_entry_validate_scope() FROM authenticated;

REVOKE ALL ON FUNCTION public.communication_validate_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.communication_validate_links() FROM anon;
REVOKE ALL ON FUNCTION public.communication_validate_links() FROM authenticated;

REVOKE ALL ON FUNCTION public.financial_guard_immutable_org() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financial_guard_immutable_org() FROM anon;
REVOKE ALL ON FUNCTION public.financial_guard_immutable_org() FROM authenticated;

REVOKE ALL ON FUNCTION public.financial_validate_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financial_validate_links() FROM anon;
REVOKE ALL ON FUNCTION public.financial_validate_links() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.communication_entry_validate_scope() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.communication_validate_links() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.financial_guard_immutable_org() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.financial_validate_links() TO postgres, service_role;
