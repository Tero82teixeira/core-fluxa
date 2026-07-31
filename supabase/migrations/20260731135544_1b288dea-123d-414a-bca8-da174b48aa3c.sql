-- 1. Novos campos
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS sample_data_at timestamptz;

-- 2. Unicidade de documento por organização
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_document_unique
  ON public.clients (organization_id, document_digits)
  WHERE document_digits IS NOT NULL AND document_digits <> '' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS processes_org_stage_idx ON public.processes (organization_id, stage);
CREATE INDEX IF NOT EXISTS tasks_org_status_idx ON public.tasks (organization_id, status);
CREATE INDEX IF NOT EXISTS movements_org_created_idx ON public.process_movements (organization_id, created_at DESC);

-- 3. Triggers de updated_at
DROP TRIGGER IF EXISTS set_updated_at_clients ON public.clients;
CREATE TRIGGER set_updated_at_clients BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_processes ON public.processes;
CREATE TRIGGER set_updated_at_processes BEFORE UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_tasks ON public.tasks;
CREATE TRIGGER set_updated_at_tasks BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_orgs ON public.organizations;
CREATE TRIGGER set_updated_at_orgs BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_org_settings ON public.organization_settings;
CREATE TRIGGER set_updated_at_org_settings BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Contador de processos por organização
CREATE TABLE IF NOT EXISTS public.organization_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  process_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organization_counters TO authenticated;
GRANT ALL ON public.organization_counters TO service_role;
ALTER TABLE public.organization_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS counters_select ON public.organization_counters;
CREATE POLICY counters_select ON public.organization_counters
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.next_process_code(_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_org_member(_org) THEN
    RAISE EXCEPTION 'Sem permissão para esta organização.';
  END IF;
  INSERT INTO public.organization_counters (organization_id, process_seq)
  VALUES (_org, 1)
  ON CONFLICT (organization_id)
  DO UPDATE SET process_seq = public.organization_counters.process_seq + 1, updated_at = now()
  RETURNING process_seq INTO n;
  RETURN 'FLX-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
END; $$;
REVOKE ALL ON FUNCTION public.next_process_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_process_code(uuid) TO authenticated, service_role;

-- 5. Notificações internas podem ser criadas por membros
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

-- 6. Novo usuário: apenas perfil, sem organização de demonstração
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;