-- Monthly operational goals are explicit, tenant-safe and auditable. They do
-- not change tasks, clients or processes and remain optional for every tenant.

CREATE TABLE public.organization_performance_goals (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_month date NOT NULL,
  new_clients_target integer NOT NULL DEFAULT 0 CHECK (new_clients_target BETWEEN 0 AND 100000),
  completed_tasks_target integer NOT NULL DEFAULT 0 CHECK (completed_tasks_target BETWEEN 0 AND 100000),
  completed_processes_target integer NOT NULL DEFAULT 0 CHECK (completed_processes_target BETWEEN 0 AND 100000),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, goal_month),
  CHECK (goal_month = date_trunc('month', goal_month)::date)
);

ALTER TABLE public.organization_performance_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY performance_goals_select
ON public.organization_performance_goals
FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

REVOKE ALL ON TABLE public.organization_performance_goals FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.organization_performance_goals FROM authenticated;
GRANT SELECT ON TABLE public.organization_performance_goals TO authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_performance_goals(
  _organization_id uuid,
  _goal_month date,
  _new_clients_target integer,
  _completed_tasks_target integer,
  _completed_processes_target integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  normalized_month date := date_trunc('month', _goal_month)::date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(
    _organization_id,
    ARRAY['proprietario','administrador','gestor']::public.app_role[]
  ) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _goal_month IS NULL THEN RAISE EXCEPTION 'GOAL_MONTH_REQUIRED'; END IF;
  IF _new_clients_target IS NULL OR _completed_tasks_target IS NULL
     OR _completed_processes_target IS NULL
     OR _new_clients_target NOT BETWEEN 0 AND 100000
     OR _completed_tasks_target NOT BETWEEN 0 AND 100000
     OR _completed_processes_target NOT BETWEEN 0 AND 100000
  THEN RAISE EXCEPTION 'INVALID_GOAL_TARGET'; END IF;

  INSERT INTO public.organization_performance_goals(
    organization_id, goal_month, new_clients_target,
    completed_tasks_target, completed_processes_target, created_by, updated_by
  ) VALUES (
    _organization_id, normalized_month, _new_clients_target,
    _completed_tasks_target, _completed_processes_target, auth.uid(), auth.uid()
  )
  ON CONFLICT (organization_id, goal_month) DO UPDATE SET
    new_clients_target = EXCLUDED.new_clients_target,
    completed_tasks_target = EXCLUDED.completed_tasks_target,
    completed_processes_target = EXCLUDED.completed_processes_target,
    updated_by = auth.uid(),
    updated_at = now();

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, metadata
  ) VALUES (
    _organization_id, auth.uid(), 'performance.goals.updated',
    'organization_performance_goals',
    jsonb_build_object(
      'goal_month', normalized_month,
      'new_clients_target', _new_clients_target,
      'completed_tasks_target', _completed_tasks_target,
      'completed_processes_target', _completed_processes_target
    )
  );

  RETURN jsonb_build_object('goal_month', normalized_month);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_organization_performance_goals(uuid,date,integer,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_performance_goals(uuid,date,integer,integer,integer)
  TO authenticated;
