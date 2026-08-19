-- Security audit stage 14: keep communication reads behind RLS and writes
-- behind the module's SECURITY DEFINER RPCs.

REVOKE TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.communication_threads, public.communication_entries
  FROM authenticated;

REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.communication_threads, public.communication_entries
  FROM authenticated, anon;

-- Anonymous clients have no communication table surface at all.
REVOKE SELECT, TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.communication_threads, public.communication_entries
  FROM anon;

-- Internal authorization and trigger helpers are not RPC endpoints.
REVOKE ALL ON FUNCTION public.communication_assert_role(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.communication_validate_links()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.communication_entry_validate_scope()
  FROM PUBLIC, anon, authenticated;

-- Reassert the public API contract without replacing any function body.
REVOKE ALL ON FUNCTION
  public.create_communication_thread(uuid,uuid,text,public.communication_channel,uuid,public.communication_priority,uuid,uuid,text,timestamptz),
  public.add_communication_entry(uuid,public.communication_entry_type,text,timestamptz,boolean,boolean,jsonb),
  public.update_communication_thread(uuid,text,public.communication_channel,public.communication_priority,uuid,uuid,timestamptz,boolean,boolean,boolean),
  public.change_communication_thread_status(uuid,public.communication_status),
  public.assign_communication_thread(uuid,uuid),
  public.archive_communication_thread(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.create_communication_thread(uuid,uuid,text,public.communication_channel,uuid,public.communication_priority,uuid,uuid,text,timestamptz),
  public.add_communication_entry(uuid,public.communication_entry_type,text,timestamptz,boolean,boolean,jsonb),
  public.update_communication_thread(uuid,text,public.communication_channel,public.communication_priority,uuid,uuid,timestamptz,boolean,boolean,boolean),
  public.change_communication_thread_status(uuid,public.communication_status),
  public.assign_communication_thread(uuid,uuid),
  public.archive_communication_thread(uuid)
  TO authenticated;
