-- Opt-in automatic assignment for Client Portal conversations. New client
-- messages are balanced across active communication-capable team members.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS auto_assign_portal_communications boolean
  NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_organization_settings(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN RAISE EXCEPTION 'SETTINGS_ORGANIZATION_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'organization_id',o.id,'legal_name',o.legal_name,'trade_name',o.trade_name,'document',o.document,'email',o.email,'phone',o.phone,'website',o.website,
    'created_at',o.created_at,'zip_code',s.zip_code,'street',s.street,'number',s.number,'complement',s.complement,'district',s.district,'city',s.city,'state',s.state,
    'timezone',COALESCE(s.timezone,'America/Sao_Paulo'),'locale',COALESCE(s.locale,'pt-BR'),'date_format',COALESCE(s.date_format,'dd/MM/yyyy'),'currency',COALESCE(s.currency,'BRL'),
    'week_starts_on',COALESCE(s.week_starts_on,1),'business_hours_start',COALESCE(to_char(s.business_hours_start,'HH24:MI'),'08:00'),'business_hours_end',COALESCE(to_char(s.business_hours_end,'HH24:MI'),'18:00'),
    'default_task_due_days',COALESCE(s.default_task_due_days,7),'default_task_priority',COALESCE(s.default_task_priority,'media'),'stale_task_days',COALESCE(s.stale_task_days,5),'stale_process_days',COALESCE(s.stale_process_days,14),
    'default_responsible_id',s.default_responsible_id,'allow_overdue_task_without_reason',COALESCE(s.allow_overdue_task_without_reason,false),
    'default_financial_account_id',s.default_financial_account_id,'default_income_category_id',s.default_income_category_id,'default_expense_category_id',s.default_expense_category_id,
    'financial_alert_days',COALESCE(s.financial_alert_days,7),'monitoring_financial_high_threshold',COALESCE(s.monitoring_financial_high_threshold,10000),'monitoring_financial_critical_threshold',COALESCE(s.monitoring_financial_critical_threshold,50000),
    'default_communication_channel',COALESCE(s.default_communication_channel,'interno'),'default_communication_priority',COALESCE(s.default_communication_priority,'normal'),'default_follow_up_hours',COALESCE(s.default_follow_up_hours,24),'highlight_internal_notes',COALESCE(s.highlight_internal_notes,true),'auto_assign_portal_communications',COALESCE(s.auto_assign_portal_communications,false),
    'monitoring_upcoming_days',COALESCE(s.monitoring_upcoming_days,7),'monitoring_document_expiration_days',COALESCE(s.monitoring_document_expiration_days,30),
    'monitoring_show_financial',COALESCE(s.monitoring_show_financial,true),'monitoring_show_communication',COALESCE(s.monitoring_show_communication,true),'monitoring_show_documents',COALESCE(s.monitoring_show_documents,true),
    'notification_preferences',COALESCE(s.notification_preferences,'{"overdue_tasks":true,"stale_processes":true,"overdue_communications":true,"overdue_accounts":true,"expiring_documents":true,"critical_monitoring":true}'::jsonb),
    'updated_at',s.updated_at,'member_count',(SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id AND m.is_active),
    'client_count',(SELECT count(*) FROM clients c WHERE c.organization_id=o.id AND c.archived_at IS NULL),
    'active_process_count',(SELECT count(*) FROM processes p WHERE p.organization_id=o.id AND p.archived_at IS NULL AND p.stage NOT IN ('finalizado','arquivado','cancelado')),
    'recent_audit',COALESCE((SELECT jsonb_agg(x) FROM (SELECT a.id,a.action,a.metadata,a.created_at,a.actor_name FROM audit_logs a WHERE a.organization_id=o.id AND a.entity='organization_settings' ORDER BY a.created_at DESC LIMIT 10) x),'[]'::jsonb)
  ) INTO result FROM organizations o LEFT JOIN organization_settings s ON s.organization_id=o.id WHERE o.id=_organization_id;
  IF result IS NULL THEN RAISE EXCEPTION 'SETTINGS_ORGANIZATION_NOT_FOUND'; END IF; RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_organization_settings(_organization_id uuid,_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE old_data jsonb; new_data jsonb; key text; old_value jsonb; new_value jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador']::public.app_role[]) THEN RAISE EXCEPTION 'SETTINGS_WRITE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_changes)<>'object' THEN RAISE EXCEPTION 'SETTINGS_INVALID_PAYLOAD'; END IF;
  IF COALESCE((_changes->>'stale_task_days')::integer,5) NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'SETTINGS_STALE_TASK_DAYS_INVALID'; END IF;
  old_data:=public.get_organization_settings(_organization_id);
  IF COALESCE(_changes->>'timezone',old_data->>'timezone') NOT IN ('America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Recife','America/Bahia','America/Belem','America/Cuiaba','America/Porto_Velho','America/Rio_Branco','UTC') THEN RAISE EXCEPTION 'SETTINGS_TIMEZONE_INVALID'; END IF;
  IF COALESCE(_changes->>'locale',old_data->>'locale') NOT IN ('pt-BR','en-US','es-ES') THEN RAISE EXCEPTION 'SETTINGS_LOCALE_INVALID'; END IF;
  IF COALESCE(_changes->>'currency',old_data->>'currency') NOT IN ('BRL','USD','EUR') THEN RAISE EXCEPTION 'SETTINGS_CURRENCY_INVALID'; END IF;
  IF COALESCE(_changes->>'default_communication_channel',old_data->>'default_communication_channel') NOT IN ('whatsapp','telefone','email','presencial','interno','outro') THEN RAISE EXCEPTION 'SETTINGS_COMMUNICATION_CHANNEL_INVALID'; END IF;
  IF COALESCE(_changes->>'default_communication_priority',old_data->>'default_communication_priority') NOT IN ('baixa','normal','alta','urgente') THEN RAISE EXCEPTION 'SETTINGS_COMMUNICATION_PRIORITY_INVALID'; END IF;
  IF COALESCE((_changes->>'monitoring_financial_critical_threshold')::numeric,(old_data->>'monitoring_financial_critical_threshold')::numeric) <= COALESCE((_changes->>'monitoring_financial_high_threshold')::numeric,(old_data->>'monitoring_financial_high_threshold')::numeric) THEN RAISE EXCEPTION 'SETTINGS_CRITICAL_THRESHOLD_MUST_EXCEED_HIGH'; END IF;
  IF NULLIF(_changes->>'default_responsible_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=_organization_id AND user_id=NULLIF(_changes->>'default_responsible_id','')::uuid AND is_active) THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  IF NULLIF(_changes->>'default_financial_account_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_accounts WHERE organization_id=_organization_id AND id=NULLIF(_changes->>'default_financial_account_id','')::uuid) THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  IF NULLIF(_changes->>'default_income_category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_categories WHERE organization_id=_organization_id AND id=NULLIF(_changes->>'default_income_category_id','')::uuid AND type='income') THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  IF NULLIF(_changes->>'default_expense_category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_categories WHERE organization_id=_organization_id AND id=NULLIF(_changes->>'default_expense_category_id','')::uuid AND type='expense') THEN RAISE EXCEPTION 'SETTINGS_RELATED_ID_ORG_MISMATCH'; END IF;
  UPDATE organizations SET legal_name=COALESCE(NULLIF(trim(_changes->>'legal_name'),''),legal_name),trade_name=CASE WHEN _changes?'trade_name' THEN NULLIF(trim(_changes->>'trade_name'),'') ELSE trade_name END,email=CASE WHEN _changes?'email' THEN NULLIF(trim(_changes->>'email'),'') ELSE email END,phone=CASE WHEN _changes?'phone' THEN NULLIF(trim(_changes->>'phone'),'') ELSE phone END,website=CASE WHEN _changes?'website' THEN NULLIF(trim(_changes->>'website'),'') ELSE website END,updated_at=now() WHERE id=_organization_id;
  INSERT INTO organization_settings(organization_id,updated_by) VALUES(_organization_id,auth.uid()) ON CONFLICT(organization_id) DO NOTHING;
  UPDATE organization_settings s SET
    zip_code=CASE WHEN _changes?'zip_code' THEN NULLIF(trim(_changes->>'zip_code'),'') ELSE s.zip_code END,street=CASE WHEN _changes?'street' THEN NULLIF(trim(_changes->>'street'),'') ELSE s.street END,number=CASE WHEN _changes?'number' THEN NULLIF(trim(_changes->>'number'),'') ELSE s.number END,complement=CASE WHEN _changes?'complement' THEN NULLIF(trim(_changes->>'complement'),'') ELSE s.complement END,district=CASE WHEN _changes?'district' THEN NULLIF(trim(_changes->>'district'),'') ELSE s.district END,city=CASE WHEN _changes?'city' THEN NULLIF(trim(_changes->>'city'),'') ELSE s.city END,state=CASE WHEN _changes?'state' THEN NULLIF(trim(_changes->>'state'),'') ELSE s.state END,
    timezone=COALESCE(_changes->>'timezone',s.timezone),locale=COALESCE(_changes->>'locale',s.locale),date_format=COALESCE(_changes->>'date_format',s.date_format),currency=COALESCE(_changes->>'currency',s.currency),week_starts_on=COALESCE((_changes->>'week_starts_on')::smallint,s.week_starts_on),business_hours_start=COALESCE((_changes->>'business_hours_start')::time,s.business_hours_start),business_hours_end=COALESCE((_changes->>'business_hours_end')::time,s.business_hours_end),
    default_task_due_days=COALESCE((_changes->>'default_task_due_days')::int,s.default_task_due_days),default_task_priority=COALESCE((_changes->>'default_task_priority')::priority_level,s.default_task_priority),stale_task_days=COALESCE((_changes->>'stale_task_days')::int,s.stale_task_days),stale_process_days=COALESCE((_changes->>'stale_process_days')::int,s.stale_process_days),default_responsible_id=CASE WHEN _changes?'default_responsible_id' THEN NULLIF(_changes->>'default_responsible_id','')::uuid ELSE s.default_responsible_id END,allow_overdue_task_without_reason=COALESCE((_changes->>'allow_overdue_task_without_reason')::boolean,s.allow_overdue_task_without_reason),
    default_financial_account_id=CASE WHEN _changes?'default_financial_account_id' THEN NULLIF(_changes->>'default_financial_account_id','')::uuid ELSE s.default_financial_account_id END,default_income_category_id=CASE WHEN _changes?'default_income_category_id' THEN NULLIF(_changes->>'default_income_category_id','')::uuid ELSE s.default_income_category_id END,default_expense_category_id=CASE WHEN _changes?'default_expense_category_id' THEN NULLIF(_changes->>'default_expense_category_id','')::uuid ELSE s.default_expense_category_id END,financial_alert_days=COALESCE((_changes->>'financial_alert_days')::int,s.financial_alert_days),monitoring_financial_high_threshold=COALESCE((_changes->>'monitoring_financial_high_threshold')::numeric,s.monitoring_financial_high_threshold),monitoring_financial_critical_threshold=COALESCE((_changes->>'monitoring_financial_critical_threshold')::numeric,s.monitoring_financial_critical_threshold),
    default_communication_channel=COALESCE((_changes->>'default_communication_channel')::public.communication_channel,s.default_communication_channel),default_communication_priority=COALESCE((_changes->>'default_communication_priority')::public.communication_priority,s.default_communication_priority),default_follow_up_hours=COALESCE((_changes->>'default_follow_up_hours')::int,s.default_follow_up_hours),highlight_internal_notes=COALESCE((_changes->>'highlight_internal_notes')::boolean,s.highlight_internal_notes),auto_assign_portal_communications=COALESCE((_changes->>'auto_assign_portal_communications')::boolean,s.auto_assign_portal_communications),monitoring_upcoming_days=COALESCE((_changes->>'monitoring_upcoming_days')::int,s.monitoring_upcoming_days),monitoring_document_expiration_days=COALESCE((_changes->>'monitoring_document_expiration_days')::int,s.monitoring_document_expiration_days),monitoring_show_financial=COALESCE((_changes->>'monitoring_show_financial')::boolean,s.monitoring_show_financial),monitoring_show_communication=COALESCE((_changes->>'monitoring_show_communication')::boolean,s.monitoring_show_communication),monitoring_show_documents=COALESCE((_changes->>'monitoring_show_documents')::boolean,s.monitoring_show_documents),notification_preferences=COALESCE(_changes->'notification_preferences',s.notification_preferences),updated_by=auth.uid(),updated_at=now() WHERE s.organization_id=_organization_id;
  new_data:=public.get_organization_settings(_organization_id);
  FOR key, new_value IN SELECT * FROM jsonb_each(_changes) LOOP old_value:=old_data->key; IF old_value IS DISTINCT FROM new_value THEN INSERT INTO audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'settings.updated','organization_settings',_organization_id,jsonb_build_object('key',key,'old_value',old_value,'new_value',new_value)); END IF; END LOOP;
  RETURN new_data;
END;
$function$;

CREATE OR REPLACE FUNCTION public.select_portal_communication_assignee(
  _organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  selected_user_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.organization_settings AS settings
     WHERE settings.organization_id = _organization_id
       AND settings.auto_assign_portal_communications
  ) THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('portal-communication-assignment:' || _organization_id::text, 0)
  );

  SELECT member.user_id
    INTO selected_user_id
    FROM public.organization_members AS member
    CROSS JOIN LATERAL (
      SELECT
        count(thread.id)::integer AS open_threads,
        max(thread.updated_at) AS last_assigned_at
        FROM public.communication_threads AS thread
       WHERE thread.organization_id = member.organization_id
         AND thread.assigned_to = member.user_id
         AND thread.archived_at IS NULL
         AND thread.status::text IN (
           'aberta', 'aguardando_cliente', 'aguardando_equipe'
         )
    ) AS workload
   WHERE member.organization_id = _organization_id
     AND member.is_active
     AND member.role::text IN (
       'superadmin', 'proprietario', 'administrador', 'gestor', 'operacional'
     )
   ORDER BY
     CASE WHEN member.role::text IN ('gestor', 'operacional') THEN 0 ELSE 1 END,
     workload.open_threads,
     workload.last_assigned_at NULLS FIRST,
     member.user_id
   LIMIT 1;

  RETURN selected_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_client_portal_communication_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  thread_row public.communication_threads%ROWTYPE;
  selected_user_id uuid;
BEGIN
  IF NEW.entry_type::text <> 'mensagem'
     OR NEW.is_internal
     OR NEW.metadata->>'source' <> 'client_portal' THEN
    RETURN NEW;
  END IF;

  SELECT thread.*
    INTO thread_row
    FROM public.communication_threads AS thread
   WHERE thread.id = NEW.thread_id
     AND thread.organization_id = NEW.organization_id
     AND thread.archived_at IS NULL;

  IF NOT FOUND OR thread_row.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  selected_user_id := public.select_portal_communication_assignee(
    thread_row.organization_id
  );
  IF selected_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.communication_threads
     SET assigned_to = selected_user_id,
         updated_at = now()
   WHERE id = thread_row.id
     AND organization_id = thread_row.organization_id
     AND assigned_to IS NULL;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) VALUES (
    thread_row.organization_id,
    NULL,
    'communication.assignee.auto_assigned',
    'communication_thread',
    thread_row.id,
    jsonb_build_object('assigned_to', selected_user_id, 'source', 'client_portal')
  );

  INSERT INTO public.notifications(
    organization_id, user_id, title, body, kind, entity_type, entity_id,
    action_url, dedupe_key
  ) VALUES (
    thread_row.organization_id,
    selected_user_id,
    'Novo atendimento atribuído',
    'Uma conversa do Portal do Cliente foi atribuída automaticamente a você.',
    'communication',
    'comunicacao',
    thread_row.id,
    '/comunicacao',
    'portal-auto-assignment:' || thread_row.id::text || ':' || selected_user_id::text
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS communication_entries_portal_auto_assignment_trg
  ON public.communication_entries;
CREATE TRIGGER communication_entries_portal_auto_assignment_trg
AFTER INSERT ON public.communication_entries
FOR EACH ROW
EXECUTE FUNCTION public.assign_client_portal_communication_on_message();

REVOKE ALL ON FUNCTION public.select_portal_communication_assignee(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_client_portal_communication_on_message()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.select_portal_communication_assignee(uuid)
  TO postgres;
