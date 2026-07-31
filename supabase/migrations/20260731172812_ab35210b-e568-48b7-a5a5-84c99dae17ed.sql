-- 1. Clientes: endereço e campos adicionais
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS legal_rep_name text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS district text;

-- 2. Processos: observações
ALTER TABLE public.processes ADD COLUMN IF NOT EXISTS notes text;

-- 3. Tipos de serviço: etapas sugeridas e checklist padrão
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS suggested_stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. Documento único por organização
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_document_unique
  ON public.clients (organization_id, document_digits)
  WHERE document_digits IS NOT NULL AND document_digits <> '' AND archived_at IS NULL;

-- 5. Índices de desempenho
CREATE INDEX IF NOT EXISTS clients_organization_id_idx ON public.clients (organization_id);
CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients (organization_id, name);
CREATE INDEX IF NOT EXISTS clients_document_digits_idx ON public.clients (document_digits);
CREATE INDEX IF NOT EXISTS processes_org_stage_idx ON public.processes (organization_id, stage);
CREATE INDEX IF NOT EXISTS processes_client_id_idx ON public.processes (client_id);
CREATE INDEX IF NOT EXISTS processes_due_date_idx ON public.processes (organization_id, due_date);
CREATE INDEX IF NOT EXISTS process_movements_process_id_idx ON public.process_movements (process_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_organization_id_idx ON public.tasks (organization_id);
CREATE INDEX IF NOT EXISTS tasks_process_id_idx ON public.tasks (process_id);
CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON public.tasks (client_id);

-- 6. Checklist do processo
DO $$ BEGIN
  CREATE TYPE public.checklist_status AS ENUM ('pendente','recebido','em_analise','aprovado','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.process_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status public.checklist_status NOT NULL DEFAULT 'pendente',
  required boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  assignee_name text,
  due_date date,
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.process_checklist_items TO authenticated;
GRANT ALL ON public.process_checklist_items TO service_role;

ALTER TABLE public.process_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_select_member" ON public.process_checklist_items;
CREATE POLICY "checklist_select_member" ON public.process_checklist_items
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "checklist_write_editor" ON public.process_checklist_items;
CREATE POLICY "checklist_write_editor" ON public.process_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

DROP POLICY IF EXISTS "checklist_update_editor" ON public.process_checklist_items;
CREATE POLICY "checklist_update_editor" ON public.process_checklist_items
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador','gestor','operacional','atendimento']::app_role[]));

CREATE INDEX IF NOT EXISTS checklist_process_idx ON public.process_checklist_items (process_id, position);

DROP TRIGGER IF EXISTS set_checklist_updated_at ON public.process_checklist_items;
CREATE TRIGGER set_checklist_updated_at BEFORE UPDATE ON public.process_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
