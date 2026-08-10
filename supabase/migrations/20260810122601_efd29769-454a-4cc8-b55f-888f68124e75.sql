-- Central de Administração da organização: amplia a estrutura já existente, sem criar novo papel.
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS date_format text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS week_starts_on smallint,
  ADD COLUMN IF NOT EXISTS business_hours_start time,
  ADD COLUMN IF NOT EXISTS business_hours_end time,
  ADD COLUMN IF NOT EXISTS default_task_due_days integer,
  ADD COLUMN IF NOT EXISTS default_task_priority public.priority_level,
  ADD COLUMN IF NOT EXISTS stale_process_days integer,
  ADD COLUMN IF NOT EXISTS default_responsible_id uuid,
  ADD COLUMN IF NOT EXISTS allow_overdue_task_without_reason boolean,
  ADD COLUMN IF NOT EXISTS default_financial_account_id uuid,
  ADD COLUMN IF NOT EXISTS default_income_category_id uuid,
  ADD COLUMN IF NOT EXISTS default_expense_category_id uuid,
  ADD COLUMN IF NOT EXISTS financial_alert_days integer,
  ADD COLUMN IF NOT EXISTS monitoring_financial_high_threshold numeric(14,2),
  ADD COLUMN IF NOT EXISTS monitoring_financial_critical_threshold numeric(14,2),
  ADD COLUMN IF NOT EXISTS default_communication_channel public.communication_channel,
  ADD COLUMN IF NOT EXISTS default_communication_priority public.communication_priority,
  ADD COLUMN IF NOT EXISTS default_follow_up_hours integer,
  ADD COLUMN IF NOT EXISTS highlight_internal_notes boolean,
  ADD COLUMN IF NOT EXISTS monitoring_upcoming_days integer,
  ADD COLUMN IF NOT EXISTS monitoring_document_expiration_days integer,
  ADD COLUMN IF NOT EXISTS monitoring_show_financial boolean,
  ADD COLUMN IF NOT EXISTS monitoring_show_communication boolean,
  ADD COLUMN IF NOT EXISTS monitoring_show_documents boolean,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.organization_settings DROP CONSTRAINT IF EXISTS organization_settings_admin_values_check;
ALTER TABLE public.organization_settings ADD CONSTRAINT organization_settings_admin_values_check CHECK (
  (timezone IS NULL OR timezone IN ('America/Sao_Paulo','America/Manaus','America/Fortaleza','America/Recife','America/Bahia','America/Belem','America/Cuiaba','America/Porto_Velho','America/Rio_Branco','UTC')) AND
  (locale IS NULL OR locale IN ('pt-BR','en-US','es-ES')) AND (currency IS NULL OR currency IN ('BRL','USD','EUR')) AND
  (week_starts_on IS NULL OR week_starts_on BETWEEN 0 AND 6) AND
  (business_hours_start IS NULL OR business_hours_end IS NULL OR business_hours_start < business_hours_end) AND
  (default_task_due_days IS NULL OR default_task_due_days BETWEEN 1 AND 365) AND
  (stale_process_days IS NULL OR stale_process_days BETWEEN 1 AND 365) AND
  (financial_alert_days IS NULL OR financial_alert_days BETWEEN 1 AND 365) AND
  (monitoring_upcoming_days IS NULL OR monitoring_upcoming_days BETWEEN 1 AND 365) AND
  (monitoring_document_expiration_days IS NULL OR monitoring_document_expiration_days BETWEEN 1 AND 365) AND
  (monitoring_financial_high_threshold IS NULL OR monitoring_financial_high_threshold >= 0) AND
  (monitoring_financial_critical_threshold IS NULL OR monitoring_financial_high_threshold IS NULL OR monitoring_financial_critical_threshold > monitoring_financial_high_threshold)
);

-- Escritas são exclusivamente mediadas pela RPC abaixo; a leitura continua protegida por RLS.
REVOKE INSERT, UPDATE, DELETE ON public.organization_settings FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_organization_settings(_organization_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(_organization_id) THEN RAISE EXCEPTION 'SETTINGS_ORGANIZATION_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object(
    'organization_id',o.id,'legal_name',o.legal_name,'trade_name',o.trade_name,'document',o.document,'email',o.email,'phone',o.phone,'website',o.website,
    'created_at',o.created_at,'zip_code',s.zip_code,'street',s.street,'number',s.number,'complement',s.complement,'district',s.district,'city',s.city,'state',s.state,
    'timezone',COALESCE(s.timezone,'America/Sao_Paulo'),'locale',COALESCE(s.locale,'pt-BR'),'date_format',COALESCE(s.date_format,'dd/MM/yyyy'),'currency',COALESCE(s.currency,'BRL'),
    'week_starts_on',COALESCE(s.week_starts_on,1),'business_hours_start',COALESCE(to_char(s.business_hours_start,'HH24:MI'),'08:00'),'business_hours_end',COALESCE(to_char(s.business_hours_end,'HH24:MI'),'18:00'),
    'default_task_due_days',COALESCE(s.default_task_due_days,7),'default_task_priority',COALESCE(s.default_task_priority,'media'),'stale_process_days',COALESCE(s.stale_process_days,14),
    'default_responsible_id',s.default_responsible_id,'allow_overdue_task_without_reason',COALESCE(s.allow_overdue_task_without_reason,false),
    'default_financial_account_id',s.default_financial_account_id,'default_income_category_id',s.default_income_category_id,'default_expense_category_id',s.default_expense_category_id,
    'financial_alert_days',COALESCE(s.financial_alert_days,7),'monitoring_financial_high_threshold',COALESCE(s.monitoring_financial_high_threshold,10000),'monitoring_financial_critical_threshold',COALESCE(s.monitoring_financial_critical_threshold,50000),
    'default_communication_channel',COALESCE(s.default_communication_channel,'interno'),'default_communication_priority',COALESCE(s.default_communication_priority,'normal'),'default_follow_up_hours',COALESCE(s.default_follow_up_hours,24),'highlight_internal_notes',COALESCE(s.highlight_internal_notes,true),
    'monitoring_upcoming_days',COALESCE(s.monitoring_upcoming_days,7),'monitoring_document_expiration_days',COALESCE(s.monitoring_document_expiration_days,30),
    'monitoring_show_financial',COALESCE(s.monitoring_show_financial,true),'monitoring_show_communication',COALESCE(s.monitoring_show_communication,true),'monitoring_show_documents',COALESCE(s.monitoring_show_documents,true),
    'notification_preferences',COALESCE(s.notification_preferences,'{"overdue_tasks":true,"stale_processes":true,"overdue_communications":true,"overdue_accounts":true,"expiring_documents":true,"critical_monitoring":true}'::jsonb),
    'updated_at',s.updated_at,'member_count',(SELECT count(*) FROM organization_members m WHERE m.organization_id=o.id AND m.is_active),
    'client_count',(SELECT count(*) FROM clients c WHERE c.organization_id=o.id AND c.archived_at IS NULL),
    'active_process_count',(SELECT count(*) FROM processes p WHERE p.organization_id=o.id AND p.archived_at IS NULL AND p.stage NOT IN ('finalizado','arquivado','cancelado')),
    'recent_audit',COALESCE((SELECT jsonb_agg(x) FROM (SELECT a.id,a.action,a.metadata,a.created_at,a.actor_name FROM audit_logs a WHERE a.organization_id=o.id AND a.entity='organization_settings' ORDER BY a.created_at DESC LIMIT 10) x),'[]'::jsonb)
  ) INTO result FROM organizations o LEFT JOIN organization_settings s ON s.organization_id=o.id WHERE o.id=_organization_id;
  IF result IS NULL THEN RAISE EXCEPTION 'SETTINGS_ORGANIZATION_NOT_FOUND'; END IF; RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.update_organization_settings(_organization_id uuid,_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_data jsonb; new_data jsonb; key text; old_value jsonb; new_value jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_org_role(_organization_id,ARRAY['superadmin','proprietario','administrador']::public.app_role[]) THEN RAISE EXCEPTION 'SETTINGS_WRITE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(_changes)<>'object' THEN RAISE EXCEPTION 'SETTINGS_INVALID_PAYLOAD'; END IF;
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
    default_task_due_days=COALESCE((_changes->>'default_task_due_days')::int,s.default_task_due_days),default_task_priority=COALESCE((_changes->>'default_task_priority')::priority_level,s.default_task_priority),stale_process_days=COALESCE((_changes->>'stale_process_days')::int,s.stale_process_days),default_responsible_id=CASE WHEN _changes?'default_responsible_id' THEN NULLIF(_changes->>'default_responsible_id','')::uuid ELSE s.default_responsible_id END,allow_overdue_task_without_reason=COALESCE((_changes->>'allow_overdue_task_without_reason')::boolean,s.allow_overdue_task_without_reason),
    default_financial_account_id=CASE WHEN _changes?'default_financial_account_id' THEN NULLIF(_changes->>'default_financial_account_id','')::uuid ELSE s.default_financial_account_id END,default_income_category_id=CASE WHEN _changes?'default_income_category_id' THEN NULLIF(_changes->>'default_income_category_id','')::uuid ELSE s.default_income_category_id END,default_expense_category_id=CASE WHEN _changes?'default_expense_category_id' THEN NULLIF(_changes->>'default_expense_category_id','')::uuid ELSE s.default_expense_category_id END,financial_alert_days=COALESCE((_changes->>'financial_alert_days')::int,s.financial_alert_days),monitoring_financial_high_threshold=COALESCE((_changes->>'monitoring_financial_high_threshold')::numeric,s.monitoring_financial_high_threshold),monitoring_financial_critical_threshold=COALESCE((_changes->>'monitoring_financial_critical_threshold')::numeric,s.monitoring_financial_critical_threshold),
    default_communication_channel=COALESCE((_changes->>'default_communication_channel')::public.communication_channel,s.default_communication_channel),default_communication_priority=COALESCE((_changes->>'default_communication_priority')::public.communication_priority,s.default_communication_priority),default_follow_up_hours=COALESCE((_changes->>'default_follow_up_hours')::int,s.default_follow_up_hours),highlight_internal_notes=COALESCE((_changes->>'highlight_internal_notes')::boolean,s.highlight_internal_notes),monitoring_upcoming_days=COALESCE((_changes->>'monitoring_upcoming_days')::int,s.monitoring_upcoming_days),monitoring_document_expiration_days=COALESCE((_changes->>'monitoring_document_expiration_days')::int,s.monitoring_document_expiration_days),monitoring_show_financial=COALESCE((_changes->>'monitoring_show_financial')::boolean,s.monitoring_show_financial),monitoring_show_communication=COALESCE((_changes->>'monitoring_show_communication')::boolean,s.monitoring_show_communication),monitoring_show_documents=COALESCE((_changes->>'monitoring_show_documents')::boolean,s.monitoring_show_documents),notification_preferences=COALESCE(_changes->'notification_preferences',s.notification_preferences),updated_by=auth.uid(),updated_at=now() WHERE s.organization_id=_organization_id;
  new_data:=public.get_organization_settings(_organization_id);
  FOR key, new_value IN SELECT * FROM jsonb_each(_changes) LOOP old_value:=old_data->key; IF old_value IS DISTINCT FROM new_value THEN INSERT INTO audit_logs(organization_id,actor_id,action,entity,entity_id,metadata) VALUES(_organization_id,auth.uid(),'settings.updated','organization_settings',_organization_id,jsonb_build_object('key',key,'old_value',old_value,'new_value',new_value)); END IF; END LOOP;
  RETURN new_data;
END $$;
REVOKE ALL ON FUNCTION public.get_organization_settings(uuid),public.update_organization_settings(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_organization_settings(uuid),public.update_organization_settings(uuid,jsonb) TO authenticated;