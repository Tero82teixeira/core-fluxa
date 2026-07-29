
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('superadmin','proprietario','administrador','gestor','operacional','atendimento','financeiro','visualizador','cliente_externo');
CREATE TYPE public.client_status AS ENUM ('lead','em_cadastro','ativo','com_pendencia','inativo','arquivado');
CREATE TYPE public.person_type AS ENUM ('pf','pj');
CREATE TYPE public.process_stage AS ENUM ('novo','aguardando_documentos','documentos_conferencia','montagem','pronto_protocolo','protocolado','em_analise','exigencia','deferido','finalizado','arquivado','cancelado');
CREATE TYPE public.priority_level AS ENUM ('baixa','media','alta','critica');
CREATE TYPE public.task_status AS ENUM ('pendente','em_andamento','concluida','cancelada');
CREATE TYPE public.financial_status AS ENUM ('nao_aplicavel','pendente','parcial','pago','atrasado');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text,
  document text,
  document_digits text,
  email text,
  phone text,
  whatsapp text,
  website text,
  slug text UNIQUE,
  onboarding_completed boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  avatar_url text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'operacional',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- helper functions (security definer, avoid recursion)
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.is_active);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.is_active AND m.role = ANY(_roles));
$$;

CREATE TABLE public.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text DEFAULT '#1D4ED8',
  theme_preference text NOT NULL DEFAULT 'system',
  portal_name text,
  zip_code text, street text, number text, complement text,
  district text, city text, state text,
  clients_range text, employees_range text, main_services text, current_control text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  label text NOT NULL,
  module text NOT NULL
);

CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_type public.person_type NOT NULL DEFAULT 'pf',
  name text NOT NULL,
  trade_name text,
  document text,
  document_digits text,
  email text,
  phone text,
  whatsapp text,
  city text,
  state text,
  status public.client_status NOT NULL DEFAULT 'ativo',
  owner_id uuid,
  owner_name text,
  notes text,
  last_interaction_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE UNIQUE INDEX clients_org_document_uniq ON public.clients(organization_id, document_digits) WHERE document_digits IS NOT NULL AND archived_at IS NULL;
CREATE INDEX clients_org_idx ON public.clients(organization_id);
CREATE INDEX clients_name_idx ON public.clients(organization_id, name);
CREATE INDEX clients_status_idx ON public.clients(organization_id, status);
CREATE INDEX clients_created_idx ON public.clients(created_at);

CREATE TABLE public.client_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text, zip_code text, street text, number text, complement text,
  district text, city text, state text, is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_addresses_org_idx ON public.client_addresses(organization_id, client_id);

CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL, role text, email text, phone text, whatsapp text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_contacts_org_idx ON public.client_contacts(organization_id, client_id);

-- ============ PROCESSES ============
CREATE TABLE public.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  default_days integer,
  default_value numeric(12,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_types_org_idx ON public.service_types(organization_id);

CREATE TABLE public.process_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key public.process_stage NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE public.processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL,
  title text,
  stage public.process_stage NOT NULL DEFAULT 'novo',
  priority public.priority_level NOT NULL DEFAULT 'media',
  owner_id uuid,
  owner_name text,
  opened_at date NOT NULL DEFAULT current_date,
  due_date date,
  protocol text,
  last_movement_at timestamptz DEFAULT now(),
  documents_total integer NOT NULL DEFAULT 0,
  documents_received integer NOT NULL DEFAULT 0,
  value numeric(12,2) DEFAULT 0,
  financial_status public.financial_status NOT NULL DEFAULT 'nao_aplicavel',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE INDEX processes_org_idx ON public.processes(organization_id);
CREATE INDEX processes_stage_idx ON public.processes(organization_id, stage);
CREATE INDEX processes_due_idx ON public.processes(organization_id, due_date);
CREATE INDEX processes_protocol_idx ON public.processes(organization_id, protocol);
CREATE INDEX processes_client_idx ON public.processes(client_id);

CREATE TABLE public.process_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  from_stage public.process_stage,
  to_stage public.process_stage,
  description text NOT NULL,
  actor_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX process_movements_org_idx ON public.process_movements(organization_id, created_at DESC);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  process_id uuid REFERENCES public.processes(id) ON DELETE SET NULL,
  status public.task_status NOT NULL DEFAULT 'pendente',
  priority public.priority_level NOT NULL DEFAULT 'media',
  due_at timestamptz,
  assignee_id uuid,
  assignee_name text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX tasks_org_idx ON public.tasks(organization_id, due_at);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'info',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_org_idx ON public.notifications(organization_id, created_at DESC);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_idx ON public.audit_logs(organization_id, created_at DESC);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations, public.profiles, public.organization_members,
  public.organization_settings, public.clients, public.client_addresses, public.client_contacts,
  public.service_types, public.process_stages, public.processes, public.process_movements,
  public.tasks, public.notifications, public.audit_logs TO authenticated;
GRANT SELECT ON public.permissions, public.role_permissions TO authenticated;
GRANT ALL ON public.organizations, public.profiles, public.organization_members, public.organization_settings,
  public.permissions, public.role_permissions, public.clients, public.client_addresses, public.client_contacts,
  public.service_types, public.process_stages, public.processes, public.process_movements,
  public.tasks, public.notifications, public.audit_logs TO service_role;

-- ============ RLS ============
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_self_or_org" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.organization_members m1
    JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = public.profiles.id));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "orgs_select_member" ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "orgs_insert_any" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "orgs_update_admin" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['proprietario','administrador']::public.app_role[]))
  WITH CHECK (public.has_org_role(id, ARRAY['proprietario','administrador']::public.app_role[]));

CREATE POLICY "members_select_own_orgs" ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY "members_insert" ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]));
CREATE POLICY "members_update_admin" ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]));
CREATE POLICY "members_delete_admin" ON public.organization_members FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]));

CREATE POLICY "settings_select" ON public.organization_settings FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "settings_write" ON public.organization_settings FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "settings_update" ON public.organization_settings FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['proprietario','administrador']::public.app_role[]));

CREATE POLICY "permissions_read" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_read" ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "client_addresses_all" ON public.client_addresses FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "client_contacts_all" ON public.client_contacts FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "service_types_all" ON public.service_types FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "process_stages_all" ON public.process_stages FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "processes_select" ON public.processes FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "processes_insert" ON public.processes FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "processes_update" ON public.processes FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "movements_select" ON public.process_movements FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "movements_insert" ON public.process_movements FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "tasks_all" ON public.tasks FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "audit_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

-- updated_at triggers
CREATE TRIGGER t1 BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t2 BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t3 BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t4 BEFORE UPDATE ON public.organization_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t5 BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t6 BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t7 BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ NEW USER HANDLER ============
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE demo_org uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (demo_org, NEW.id, 'proprietario') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PERMISSIONS CATALOG ============
INSERT INTO public.permissions (key,label,module) VALUES
 ('clients.view','Visualizar clientes','clientes'),('clients.create','Criar clientes','clientes'),
 ('clients.edit','Editar clientes','clientes'),('clients.delete','Arquivar clientes','clientes'),
 ('processes.view','Visualizar processos','processos'),('processes.create','Criar processos','processos'),
 ('processes.edit','Editar processos','processos'),('processes.delete','Arquivar processos','processos'),
 ('finance.view','Acessar financeiro','financeiro'),('reports.export','Exportar dados','relatorios'),
 ('settings.manage','Gerenciar configurações','configuracoes'),('team.manage','Gerenciar equipe','equipe');

INSERT INTO public.role_permissions (role, permission_key)
SELECT r::public.app_role, p.key FROM public.permissions p,
 unnest(ARRAY['proprietario','administrador']) r;
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'gestor'::public.app_role, key FROM public.permissions WHERE key <> 'settings.manage';
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'operacional'::public.app_role, key FROM public.permissions WHERE key IN ('clients.view','clients.create','clients.edit','processes.view','processes.create','processes.edit');
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'atendimento'::public.app_role, key FROM public.permissions WHERE key IN ('clients.view','clients.create','clients.edit','processes.view');
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'financeiro'::public.app_role, key FROM public.permissions WHERE key IN ('clients.view','processes.view','finance.view','reports.export');
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'visualizador'::public.app_role, key FROM public.permissions WHERE key IN ('clients.view','processes.view');

-- ============ DEMO DATA ============
INSERT INTO public.organizations (id, legal_name, trade_name, document, document_digits, email, phone, whatsapp, website, slug, onboarding_completed)
VALUES ('11111111-1111-4111-8111-111111111111','Vertice Consultoria Regulatória Ltda','Vértice Regulatório','24.918.740/0001-06','24918740000106','contato@verticeregulatorio.com.br','(11) 3555-2100','(11) 98812-4477','https://verticeregulatorio.com.br','vertice', true);

INSERT INTO public.organization_settings (organization_id, portal_name, city, state, zip_code, street, number, district, clients_range, employees_range, main_services, current_control)
VALUES ('11111111-1111-4111-8111-111111111111','Portal Vértice','São Paulo','SP','01310-100','Avenida Paulista','1842','Bela Vista','101 a 500','11 a 30','Licenciamento sanitário, registro de produtos, renovação de alvarás','Planilhas e e-mail');

INSERT INTO public.process_stages (organization_id, key, label, position) VALUES
 ('11111111-1111-4111-8111-111111111111','novo','Entrada',1),
 ('11111111-1111-4111-8111-111111111111','aguardando_documentos','Aguardando documentos',2),
 ('11111111-1111-4111-8111-111111111111','documentos_conferencia','Documentos em conferência',3),
 ('11111111-1111-4111-8111-111111111111','montagem','Montagem',4),
 ('11111111-1111-4111-8111-111111111111','pronto_protocolo','Pronto para protocolo',5),
 ('11111111-1111-4111-8111-111111111111','protocolado','Protocolado',6),
 ('11111111-1111-4111-8111-111111111111','em_analise','Em análise',7),
 ('11111111-1111-4111-8111-111111111111','exigencia','Exigência',8),
 ('11111111-1111-4111-8111-111111111111','deferido','Deferido',9),
 ('11111111-1111-4111-8111-111111111111','finalizado','Finalizado',10),
 ('11111111-1111-4111-8111-111111111111','arquivado','Arquivado',11),
 ('11111111-1111-4111-8111-111111111111','cancelado','Cancelado',12);

INSERT INTO public.service_types (id, organization_id, name, default_days, default_value) VALUES
 ('22222222-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Licença sanitária municipal',45,3800.00),
 ('22222222-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Registro de produto na Anvisa',120,14500.00),
 ('22222222-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Renovação de alvará de funcionamento',30,2200.00),
 ('22222222-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Autorização de funcionamento de empresa',90,9800.00),
 ('22222222-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Licença ambiental de operação',75,11200.00);

INSERT INTO public.clients (id, organization_id, person_type, name, trade_name, document, document_digits, email, phone, whatsapp, city, state, status, owner_name, last_interaction_at) VALUES
 ('33333333-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','pj','Laticínios Serra Azul S.A.','Serra Azul','18.402.771/0001-42','18402771000142','regulatorio@serraazul.com.br','(35) 3721-8800','(35) 99812-3300','Pouso Alegre','MG','ativo','Marina Bocaiúva', now() - interval '2 hours'),
 ('33333333-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','pj','Farmacêutica Ipiranga Ltda','Ipiranga Pharma','09.774.310/0001-88','09774310000188','qualidade@ipirangapharma.com.br','(11) 4002-9915','(11) 98455-7712','São Paulo','SP','com_pendencia','Rafael Andrade', now() - interval '1 day'),
 ('33333333-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','pj','Cosméticos Marambaia Indústria','Marambaia','31.556.902/0001-19','31556902000119','contato@marambaiacosmeticos.com.br','(21) 3322-4410','(21) 99640-1188','Niterói','RJ','ativo','Camila Ferrarini', now() - interval '5 hours'),
 ('33333333-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','pj','Distribuidora Hospitalar Andradina','DHA Saúde','44.209.187/0001-70','44209187000170','compras@dhasaude.com.br','(18) 3721-5566','(18) 99711-2244','Andradina','SP','ativo','Rafael Andrade', now() - interval '3 days'),
 ('33333333-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','pf','Eduarda Vilanova Bastos',NULL,'482.913.770-05','48291377005','eduarda.bastos@clinicavilanova.com.br','(41) 3033-7788','(41) 99822-6644','Curitiba','PR','ativo','Marina Bocaiúva', now() - interval '8 hours'),
 ('33333333-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','pj','Alimentos Peixoto do Vale Ltda','Peixoto do Vale','27.881.455/0001-33','27881455000133','regulatorio@peixotodovale.com.br','(16) 3512-9900','(16) 99433-8877','Ribeirão Preto','SP','com_pendencia','Tiago Rezende', now() - interval '6 days'),
 ('33333333-0000-4000-8000-000000000007','11111111-1111-4111-8111-111111111111','pj','Química Boa Esperança S.A.','QBE','55.017.284/0001-51','55017284000151','licencas@qbequimica.com.br','(31) 3444-2211','(31) 99120-4455','Contagem','MG','ativo','Camila Ferrarini', now() - interval '12 hours'),
 ('33333333-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111','pj','Clínica Odontológica Sant Iago','Sant Iago','12.664.903/0001-27','12664903000127','administrativo@santiagoodonto.com.br','(51) 3211-7744','(51) 99677-3322','Porto Alegre','RS','lead','Tiago Rezende', now() - interval '9 days'),
 ('33333333-0000-4000-8000-000000000009','11111111-1111-4111-8111-111111111111','pf','Henrique Salgado Moretti',NULL,'315.774.209-11','31577420911','henrique@moretticomercio.com.br','(62) 3255-1199','(62) 99388-2211','Goiânia','GO','em_cadastro','Marina Bocaiúva', now() - interval '4 days'),
 ('33333333-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111','pj','Bebidas Tramontano Indústria Ltda','Tramontano','66.930.512/0001-04','66930512000104','qualidade@tramontano.ind.br','(19) 3877-4400','(19) 99244-5511','Piracicaba','SP','ativo','Rafael Andrade', now() - interval '1 day'),
 ('33333333-0000-4000-8000-000000000011','11111111-1111-4111-8111-111111111111','pj','Laboratório Cravinhos Análises','Cravinhos Lab','78.114.660/0001-95','78114660000195','diretoria@cravinhoslab.com.br','(16) 3961-2200','(16) 99155-7733','Cravinhos','SP','inativo','Camila Ferrarini', now() - interval '45 days'),
 ('33333333-0000-4000-8000-000000000012','11111111-1111-4111-8111-111111111111','pj','Transportes Refrigerados Aramaçan','Aramaçan Log','83.402.119/0001-60','83402119000160','operacoes@aramacanlog.com.br','(47) 3344-8811','(47) 99411-6622','Itajaí','SC','ativo','Tiago Rezende', now() - interval '20 hours'),
 ('33333333-0000-4000-8000-000000000013','11111111-1111-4111-8111-111111111111','pj','Nutrição Animal Vale do Sol','Vale do Sol','91.228.037/0001-14','91228037000114','regulatorio@valedosol.agr.br','(54) 3212-6600','(54) 99700-1188','Passo Fundo','RS','ativo','Marina Bocaiúva', now() - interval '2 days'),
 ('33333333-0000-4000-8000-000000000014','11111111-1111-4111-8111-111111111111','pf','Lorena Aguiar Dantas',NULL,'729.480.116-32','72948011632','lorena.dantas@esteticadantas.com.br','(85) 3266-4477','(85) 99522-3311','Fortaleza','CE','com_pendencia','Rafael Andrade', now() - interval '3 days'),
 ('33333333-0000-4000-8000-000000000015','11111111-1111-4111-8111-111111111111','pj','Embalagens Piraquara Indústria','Piraquara Pack','37.905.641/0001-28','37905641000128','contato@piraquarapack.com.br','(41) 3699-2255','(41) 99833-4400','Piraquara','PR','ativo','Camila Ferrarini', now() - interval '30 hours');

INSERT INTO public.processes (organization_id, code, client_id, service_type_id, title, stage, priority, owner_name, opened_at, due_date, protocol, last_movement_at, documents_total, documents_received, value, financial_status) VALUES
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0001','33333333-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','Licença sanitária - unidade Pouso Alegre','em_analise','alta','Marina Bocaiúva', current_date - 40, current_date + 3,'SP-2026-114452', now() - interval '2 days',12,12,3800.00,'pago'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0002','33333333-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000002','Registro de produto - linha dermatológica','exigencia','critica','Rafael Andrade', current_date - 95, current_date,'ANV-2026-88231', now() - interval '9 days',24,19,14500.00,'parcial'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0003','33333333-0000-4000-8000-000000000003','22222222-0000-4000-8000-000000000004','Autorização de funcionamento','montagem','media','Camila Ferrarini', current_date - 22, current_date + 18, NULL, now() - interval '1 day',18,11,9800.00,'pendente'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0004','33333333-0000-4000-8000-000000000004','22222222-0000-4000-8000-000000000003','Renovação de alvará 2026','aguardando_documentos','alta','Rafael Andrade', current_date - 15, current_date + 1, NULL, now() - interval '6 days',8,3,2200.00,'pendente'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0005','33333333-0000-4000-8000-000000000005','22222222-0000-4000-8000-000000000001','Licença sanitária - consultório','protocolado','media','Marina Bocaiúva', current_date - 30, current_date + 12,'PR-2026-33119', now() - interval '3 days',10,10,3800.00,'pago'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0006','33333333-0000-4000-8000-000000000006','22222222-0000-4000-8000-000000000002','Registro de novo alimento funcional','aguardando_documentos','critica','Tiago Rezende', current_date - 55, current_date - 2, NULL, now() - interval '14 days',24,9,14500.00,'atrasado'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0007','33333333-0000-4000-8000-000000000007','22222222-0000-4000-8000-000000000005','Licença ambiental de operação','em_analise','alta','Camila Ferrarini', current_date - 60, current_date + 6,'MG-2026-77201', now() - interval '4 days',20,20,11200.00,'parcial'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0008','33333333-0000-4000-8000-000000000008','22222222-0000-4000-8000-000000000003','Renovação de alvará - unidade central','novo','baixa','Tiago Rezende', current_date - 3, current_date + 27, NULL, now() - interval '3 days',8,0,2200.00,'nao_aplicavel'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0009','33333333-0000-4000-8000-000000000009','22222222-0000-4000-8000-000000000001','Licença sanitária - comércio atacadista','documentos_conferencia','media','Marina Bocaiúva', current_date - 12, current_date + 20, NULL, now() - interval '2 days',12,8,3800.00,'pendente'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0010','33333333-0000-4000-8000-000000000010','22222222-0000-4000-8000-000000000004','Autorização de funcionamento - engarrafamento','pronto_protocolo','alta','Rafael Andrade', current_date - 48, current_date + 2, NULL, now() - interval '1 day',18,18,9800.00,'pago'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0011','33333333-0000-4000-8000-000000000011','22222222-0000-4000-8000-000000000005','Licença ambiental - laboratório','arquivado','baixa','Camila Ferrarini', current_date - 180, current_date - 60,'SP-2025-99001', now() - interval '60 days',20,20,11200.00,'pago'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0012','33333333-0000-4000-8000-000000000012','22222222-0000-4000-8000-000000000001','Licença sanitária - transporte refrigerado','deferido','media','Tiago Rezende', current_date - 70, current_date - 5,'SC-2026-40112', now() - interval '5 days',12,12,3800.00,'pago'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0013','33333333-0000-4000-8000-000000000013','22222222-0000-4000-8000-000000000002','Registro de suplemento animal','em_analise','media','Marina Bocaiúva', current_date - 85, current_date + 25,'MAPA-2026-5521', now() - interval '7 days',24,24,14500.00,'parcial'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0014','33333333-0000-4000-8000-000000000014','22222222-0000-4000-8000-000000000001','Licença sanitária - clínica de estética','exigencia','alta','Rafael Andrade', current_date - 38, current_date + 4,'CE-2026-21874', now() - interval '11 days',12,7,3800.00,'pendente'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0015','33333333-0000-4000-8000-000000000015','22222222-0000-4000-8000-000000000005','Licença ambiental - nova linha','montagem','media','Camila Ferrarini', current_date - 18, current_date + 30, NULL, now() - interval '2 days',20,13,11200.00,'pendente'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0016','33333333-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000003','Renovação de alvará - filial Varginha','finalizado','baixa','Marina Bocaiúva', current_date - 120, current_date - 40,'MG-2025-66210', now() - interval '40 days',8,8,2200.00,'pago'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0017','33333333-0000-4000-8000-000000000003','22222222-0000-4000-8000-000000000002','Registro de linha capilar','aguardando_documentos','alta','Camila Ferrarini', current_date - 26, current_date + 5, NULL, now() - interval '8 days',24,10,14500.00,'pendente'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0018','33333333-0000-4000-8000-000000000007','22222222-0000-4000-8000-000000000004','Autorização de funcionamento - filial Betim','protocolado','media','Tiago Rezende', current_date - 44, current_date + 14,'MG-2026-77890', now() - interval '3 days',18,18,9800.00,'parcial'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0019','33333333-0000-4000-8000-000000000010','22222222-0000-4000-8000-000000000001','Licença sanitária - centro de distribuição','novo','media','Rafael Andrade', current_date - 5, current_date + 40, NULL, now() - interval '5 days',12,2,3800.00,'nao_aplicavel'),
 ('11111111-1111-4111-8111-111111111111','PRC-2026-0020','33333333-0000-4000-8000-000000000013','22222222-0000-4000-8000-000000000005','Licença ambiental - ampliação fabril','pronto_protocolo','critica','Marina Bocaiúva', current_date - 66, current_date + 1, NULL, now() - interval '1 day',20,20,11200.00,'pago');

INSERT INTO public.process_movements (organization_id, process_id, from_stage, to_stage, description, actor_name, created_at)
SELECT '11111111-1111-4111-8111-111111111111', p.id, 'novo', p.stage, 'Processo movido para a etapa atual após conferência interna.', p.owner_name, p.last_movement_at
FROM public.processes p WHERE p.organization_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.tasks (organization_id, title, client_id, process_id, status, priority, due_at, assignee_name)
SELECT '11111111-1111-4111-8111-111111111111', t.title, t.client_id::uuid, p.id, t.status::public.task_status, t.priority::public.priority_level, t.due_at, t.assignee
FROM (VALUES
 ('Solicitar laudo microbiológico atualizado','33333333-0000-4000-8000-000000000001','PRC-2026-0001','pendente','alta', now() + interval '4 hours','Marina Bocaiúva'),
 ('Responder exigência técnica da Anvisa','33333333-0000-4000-8000-000000000002','PRC-2026-0002','em_andamento','critica', now() + interval '7 hours','Rafael Andrade'),
 ('Conferir contrato social atualizado','33333333-0000-4000-8000-000000000003','PRC-2026-0003','pendente','media', now() + interval '1 day','Camila Ferrarini'),
 ('Cobrar documentação pendente do cliente','33333333-0000-4000-8000-000000000004','PRC-2026-0004','pendente','alta', now() + interval '2 hours','Rafael Andrade'),
 ('Agendar reunião de alinhamento regulatório','33333333-0000-4000-8000-000000000006','PRC-2026-0006','pendente','critica', now() - interval '3 hours','Tiago Rezende'),
 ('Revisar memorial descritivo antes do protocolo','33333333-0000-4000-8000-000000000010','PRC-2026-0010','em_andamento','alta', now() + interval '9 hours','Rafael Andrade'),
 ('Emitir guia de recolhimento da taxa','33333333-0000-4000-8000-000000000013','PRC-2026-0020','pendente','media', now() + interval '2 days','Marina Bocaiúva'),
 ('Atualizar cliente sobre andamento do protocolo','33333333-0000-4000-8000-000000000007','PRC-2026-0007','concluida','baixa', now() - interval '1 day','Camila Ferrarini')
) AS t(title, client_id, code, status, priority, due_at, assignee)
JOIN public.processes p ON p.code = t.code AND p.organization_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.notifications (organization_id, title, body, kind) VALUES
 ('11111111-1111-4111-8111-111111111111','Exigência recebida','O processo PRC-2026-0002 recebeu uma exigência técnica com prazo de 15 dias.','alerta'),
 ('11111111-1111-4111-8111-111111111111','Prazo próximo','PRC-2026-0004 vence amanhã e ainda aguarda documentos do cliente.','alerta'),
 ('11111111-1111-4111-8111-111111111111','Protocolo confirmado','PRC-2026-0018 foi protocolado com sucesso.','sucesso');

INSERT INTO public.audit_logs (organization_id, actor_name, action, entity, metadata) VALUES
 ('11111111-1111-4111-8111-111111111111','Camila Ferrarini','criacao','client','{"nome":"Embalagens Piraquara Indústria"}'),
 ('11111111-1111-4111-8111-111111111111','Rafael Andrade','mudanca_etapa','process','{"codigo":"PRC-2026-0010","etapa":"Pronto para protocolo"}'),
 ('11111111-1111-4111-8111-111111111111','Marina Bocaiúva','edicao','process','{"codigo":"PRC-2026-0001"}');
