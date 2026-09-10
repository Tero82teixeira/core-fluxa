-- Auditable commercial stage history and idempotent next-action alerts.

CREATE TABLE public.commercial_opportunity_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.commercial_opportunities(id) ON DELETE CASCADE,
  from_stage text CHECK (from_stage IS NULL OR from_stage IN ('first_contact','qualification','proposal','negotiation','won','lost')),
  to_stage text NOT NULL CHECK (to_stage IN ('first_contact','qualification','proposal','negotiation','won','lost')),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX commercial_opportunity_history_org_idx
  ON public.commercial_opportunity_stage_history(organization_id, changed_at DESC);
CREATE INDEX commercial_opportunity_history_opportunity_idx
  ON public.commercial_opportunity_stage_history(opportunity_id, changed_at);

ALTER TABLE public.commercial_opportunity_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_opportunity_stage_history_select
  ON public.commercial_opportunity_stage_history FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
REVOKE ALL ON TABLE public.commercial_opportunity_stage_history FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.commercial_opportunity_stage_history FROM authenticated;
GRANT SELECT ON TABLE public.commercial_opportunity_stage_history TO authenticated;

-- Existing opportunities start with one truthful baseline at their creation date.
INSERT INTO public.commercial_opportunity_stage_history(
  organization_id, opportunity_id, from_stage, to_stage, changed_by, changed_at
)
SELECT organization_id, id, NULL, stage, created_by, created_at
FROM public.commercial_opportunities;

CREATE OR REPLACE FUNCTION public.upsert_commercial_opportunity(
  _organization_id uuid, _opportunity_id uuid, _title text, _stage text,
  _estimated_value numeric, _probability integer, _client_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _next_action_at timestamptz DEFAULT NULL,
  _lost_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $function$
DECLARE result_id uuid; old_stage text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY['proprietario','administrador','gestor','operacional']::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF length(btrim(coalesce(_title,''))) NOT BETWEEN 3 AND 180 THEN RAISE EXCEPTION 'INVALID_TITLE'; END IF;
  IF _stage NOT IN ('first_contact','qualification','proposal','negotiation','won','lost') THEN RAISE EXCEPTION 'INVALID_STAGE'; END IF;
  IF _estimated_value IS NULL OR _estimated_value NOT BETWEEN 0 AND 999999999999.99 OR _probability IS NULL OR _probability NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'INVALID_VALUE_OR_PROBABILITY'; END IF;
  IF _stage = 'lost' AND length(btrim(coalesce(_lost_reason,''))) < 3 THEN RAISE EXCEPTION 'LOST_REASON_REQUIRED'; END IF;
  IF _client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.organization_id=_organization_id AND c.archived_at IS NULL) THEN RAISE EXCEPTION 'CLIENT_SCOPE_MISMATCH'; END IF;
  IF _owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id=_organization_id AND m.user_id=_owner_id AND m.is_active) THEN RAISE EXCEPTION 'OWNER_SCOPE_MISMATCH'; END IF;

  IF _opportunity_id IS NULL THEN
    INSERT INTO public.commercial_opportunities(organization_id,client_id,title,stage,estimated_value,probability,owner_id,next_action_at,lost_reason,won_at,lost_at,created_by,updated_by)
    VALUES(_organization_id,_client_id,btrim(_title),_stage,_estimated_value,_probability,_owner_id,_next_action_at,nullif(btrim(coalesce(_lost_reason,'')),''),CASE WHEN _stage='won' THEN now() END,CASE WHEN _stage='lost' THEN now() END,auth.uid(),auth.uid()) RETURNING id INTO result_id;
    INSERT INTO public.commercial_opportunity_stage_history(organization_id,opportunity_id,from_stage,to_stage,changed_by)
    VALUES(_organization_id,result_id,NULL,_stage,auth.uid());
  ELSE
    SELECT stage INTO old_stage FROM public.commercial_opportunities WHERE id=_opportunity_id AND organization_id=_organization_id AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OPPORTUNITY_NOT_FOUND'; END IF;
    UPDATE public.commercial_opportunities SET client_id=_client_id,title=btrim(_title),stage=_stage,estimated_value=_estimated_value,probability=_probability,owner_id=_owner_id,next_action_at=_next_action_at,lost_reason=CASE WHEN _stage='lost' THEN btrim(_lost_reason) END,won_at=CASE WHEN _stage='won' THEN coalesce(won_at,now()) END,lost_at=CASE WHEN _stage='lost' THEN coalesce(lost_at,now()) END,updated_by=auth.uid(),updated_at=now() WHERE id=_opportunity_id RETURNING id INTO result_id;
    IF old_stage IS DISTINCT FROM _stage THEN
      INSERT INTO public.commercial_opportunity_stage_history(organization_id,opportunity_id,from_stage,to_stage,changed_by)
      VALUES(_organization_id,result_id,old_stage,_stage,auth.uid());
    END IF;
  END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),CASE WHEN _opportunity_id IS NULL THEN 'commercial.opportunity.created' ELSE 'commercial.opportunity.updated' END,'commercial_opportunity',result_id,jsonb_build_object('stage',_stage,'previous_stage',old_stage,'estimated_value',_estimated_value));
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_commercial_next_action_notifications(
  _as_of timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE created_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT o.*,
      CASE WHEN o.next_action_at <= _as_of THEN 'overdue' ELSE 'upcoming' END AS alert_kind
    FROM public.commercial_opportunities o
    WHERE o.archived_at IS NULL
      AND o.stage NOT IN ('won','lost')
      AND o.next_action_at IS NOT NULL
      AND o.next_action_at <= _as_of + interval '24 hours'
  ), recipients AS (
    SELECT c.*, recipient.user_id AS recipient_id
    FROM candidates c
    CROSS JOIN LATERAL (
      SELECT m.user_id
      FROM public.organization_members m
      WHERE m.organization_id = c.organization_id
        AND m.user_id = c.owner_id
        AND m.is_active
      UNION ALL
      SELECT m.user_id
      FROM public.organization_members m
      WHERE m.organization_id = c.organization_id
        AND m.is_active
        AND m.role IN ('proprietario','administrador','gestor')
        AND NOT EXISTS (
          SELECT 1 FROM public.organization_members owner
          WHERE owner.organization_id = c.organization_id
            AND owner.user_id = c.owner_id
            AND owner.is_active
        )
    ) recipient
  )
  INSERT INTO public.notifications(
    organization_id, user_id, kind, title, body, action_url, dedupe_key
  )
  SELECT
    organization_id,
    recipient_id,
    CASE WHEN alert_kind = 'overdue' THEN 'warning' ELSE 'info' END,
    CASE WHEN alert_kind = 'overdue' THEN 'Ação comercial vencida' ELSE 'Próxima ação comercial' END,
    CASE WHEN alert_kind = 'overdue'
      THEN 'Uma oportunidade comercial precisa de acompanhamento agora.'
      ELSE 'Uma oportunidade comercial tem acompanhamento previsto nas próximas 24 horas.'
    END,
    '/relatorios?tipo=commercial',
    concat('commercial-next-action:', id, ':', recipient_id, ':', next_action_at::text, ':', alert_kind)
  FROM recipients
  ON CONFLICT (organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS created_count = ROW_COUNT;
  RETURN created_count;
END;
$function$;

-- Keep the existing temporal cycle intact and extend it with the commercial scan.
ALTER FUNCTION public.run_temporal_automation_cycle()
  RENAME TO run_temporal_automation_cycle_before_commercial_alerts;

CREATE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  result jsonb;
  commercial_count integer := 0;
BEGIN
  result := public.run_temporal_automation_cycle_before_commercial_alerts();
  BEGIN
    commercial_count := public.create_commercial_next_action_notifications();
  EXCEPTION WHEN OTHERS THEN
    commercial_count := -1;
    RAISE WARNING 'COMMERCIAL_NEXT_ACTION_SCAN_FAILED: %', SQLSTATE;
  END;
  RETURN result || jsonb_build_object('commercial_next_action_notifications_created', commercial_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_commercial_opportunity(uuid,uuid,text,text,numeric,integer,uuid,uuid,timestamptz,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_commercial_opportunity(uuid,uuid,text,text,numeric,integer,uuid,uuid,timestamptz,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.create_commercial_next_action_notifications(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_commercial_next_action_notifications(timestamptz)
  TO postgres;
REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle()
  TO postgres;
