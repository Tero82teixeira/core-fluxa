-- Remove a legacy diagnostic helper from the public schema.
-- It exposes pending invitation/user matching data, is not part of the application RPC contract,
-- and execution is intentionally unavailable to PUBLIC, anon, and authenticated roles.
DROP FUNCTION IF EXISTS public.pending_invitation_diagnostics();
