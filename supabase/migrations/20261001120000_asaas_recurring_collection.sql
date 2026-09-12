-- Automated Asaas collections, client-safe payment reminders and auditable
-- reconciliation. Existing recurrence and deadline automations are preserved.

ALTER TABLE public.financial_recurrences
  ADD COLUMN asaas_auto_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN asaas_charge_days_before smallint NOT NULL DEFAULT 0;

ALTER TABLE public.financial_recurrences
  ADD CONSTRAINT financial_recurrences_asaas_lead_days_check
  CHECK (asaas_charge_days_before BETWEEN 0 AND 30),
  ADD CONSTRAINT financial_recurrences_asaas_income_check
  CHECK (NOT asaas_auto_charge OR (type = 'income' AND client_id IS NOT NULL));

CREATE TABLE public.asaas_charge_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','succeeded','failed')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transaction_id),
  FOREIGN KEY (organization_id, transaction_id)
    REFERENCES public.financial_transactions(organization_id, id)
);

CREATE INDEX asaas_charge_jobs_ready_idx
  ON public.asaas_charge_jobs(status, next_attempt_at, created_at)
  WHERE status IN ('pending','failed');

ALTER TABLE public.asaas_charge_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY asaas_charge_jobs_read ON public.asaas_charge_jobs
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY[
    'superadmin','proprietario','administrador','gestor','financeiro'
  ]::public.app_role[]));
REVOKE ALL ON public.asaas_charge_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.asaas_charge_jobs TO authenticated;
GRANT ALL ON public.asaas_charge_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_asaas_recurring_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF NEW.recurrence_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.financial_recurrences AS recurrence
     WHERE recurrence.id = NEW.recurrence_id
       AND recurrence.organization_id = NEW.organization_id
       AND recurrence.asaas_auto_charge
       AND recurrence.type = 'income'
       AND recurrence.status = 'active'
       AND recurrence.archived_at IS NULL
  ) THEN
    INSERT INTO public.asaas_charge_jobs(organization_id, transaction_id)
    VALUES (NEW.organization_id, NEW.id)
    ON CONFLICT (organization_id, transaction_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER financial_transaction_asaas_queue
  AFTER INSERT ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_asaas_recurring_charge();

CREATE OR REPLACE FUNCTION public.create_financial_recurrence(
  _organization_id uuid, _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  result_id uuid;
  auto_charge boolean := coalesce((_payload->>'asaas_auto_charge')::boolean, false);
  lead_days integer := coalesce(nullif(_payload->>'asaas_charge_days_before','')::integer, 0);
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);
  IF nullif(trim(_payload->>'name'),'') IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF nullif(_payload->>'type','') IS NULL OR _payload->>'type' NOT IN ('income','expense') THEN RAISE EXCEPTION 'INVALID_RECURRENCE_TYPE'; END IF;
  IF nullif(_payload->>'amount','') IS NULL OR nullif(_payload->>'amount','')::numeric <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF nullif(_payload->>'frequency','') IS NULL OR _payload->>'frequency' NOT IN ('weekly','monthly','quarterly','yearly') THEN RAISE EXCEPTION 'INVALID_FREQUENCY'; END IF;
  IF nullif(_payload->>'start_date','') IS NULL THEN RAISE EXCEPTION 'START_DATE_REQUIRED'; END IF;
  IF lead_days NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'INVALID_ASAAS_LEAD_DAYS'; END IF;
  IF auto_charge AND _payload->>'type' <> 'income' THEN RAISE EXCEPTION 'ASAAS_RECURRENCE_REQUIRES_INCOME'; END IF;
  IF auto_charge AND nullif(_payload->>'client_id','') IS NULL THEN RAISE EXCEPTION 'ASAAS_RECURRENCE_REQUIRES_CLIENT'; END IF;

  INSERT INTO public.financial_recurrences(
    organization_id,name,type,amount,category_id,account_id,frequency,
    interval_count,start_date,end_date,next_run_date,client_id,process_id,
    notes,asaas_auto_charge,asaas_charge_days_before,created_by
  ) VALUES (
    _organization_id,_payload->>'name',_payload->>'type',(_payload->>'amount')::numeric,
    nullif(_payload->>'category_id','')::uuid,nullif(_payload->>'account_id','')::uuid,
    _payload->>'frequency',coalesce(nullif(_payload->>'interval_count','')::integer,1),
    (_payload->>'start_date')::date,nullif(_payload->>'end_date','')::date,
    coalesce(nullif(_payload->>'next_run_date','')::date,(_payload->>'start_date')::date),
    nullif(_payload->>'client_id','')::uuid,nullif(_payload->>'process_id','')::uuid,
    _payload->>'notes',auto_charge,lead_days,auth.uid()
  ) RETURNING id INTO result_id;
  PERFORM public.financial_audit(_organization_id,'financial.recurrence.created','financial_recurrence',result_id);
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_financial_recurrence(
  _organization_id uuid, _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  result_id uuid := (_payload->>'id')::uuid;
  current_row public.financial_recurrences%ROWTYPE;
  target_type text;
  target_frequency text;
  target_status text;
  target_amount numeric;
  target_interval integer;
  target_auto boolean;
  target_client uuid;
  target_lead integer;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);
  SELECT * INTO current_row FROM public.financial_recurrences
   WHERE id = result_id AND organization_id = _organization_id
     AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  target_type := coalesce(nullif(_payload->>'type',''),current_row.type);
  target_frequency := coalesce(nullif(_payload->>'frequency',''),current_row.frequency);
  target_status := coalesce(nullif(_payload->>'status',''),current_row.status);
  target_amount := coalesce(nullif(_payload->>'amount','')::numeric,current_row.amount);
  target_interval := coalesce(nullif(_payload->>'interval_count','')::integer,current_row.interval_count);
  target_auto := CASE WHEN _payload ? 'asaas_auto_charge'
    THEN (_payload->>'asaas_auto_charge')::boolean ELSE current_row.asaas_auto_charge END;
  target_client := CASE WHEN _payload ? 'client_id'
    THEN nullif(_payload->>'client_id','')::uuid ELSE current_row.client_id END;
  target_lead := CASE WHEN _payload ? 'asaas_charge_days_before'
    THEN coalesce(nullif(_payload->>'asaas_charge_days_before','')::integer,0)
    ELSE current_row.asaas_charge_days_before END;
  IF target_type NOT IN ('income','expense') THEN RAISE EXCEPTION 'INVALID_RECURRENCE_TYPE'; END IF;
  IF target_frequency NOT IN ('weekly','monthly','quarterly','yearly') THEN RAISE EXCEPTION 'INVALID_FREQUENCY'; END IF;
  IF target_status NOT IN ('active','paused','finished') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF target_amount IS NULL OR target_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF target_interval IS NULL OR target_interval <= 0 THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  IF target_lead NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'INVALID_ASAAS_LEAD_DAYS'; END IF;
  IF target_auto AND target_type <> 'income' THEN RAISE EXCEPTION 'ASAAS_RECURRENCE_REQUIRES_INCOME'; END IF;
  IF target_auto AND target_client IS NULL THEN RAISE EXCEPTION 'ASAAS_RECURRENCE_REQUIRES_CLIENT'; END IF;

  UPDATE public.financial_recurrences SET
    name=coalesce(nullif(trim(_payload->>'name'),''),name),
    type=target_type,
    amount=target_amount,
    status=target_status,
    category_id=CASE WHEN _payload ? 'category_id' THEN nullif(_payload->>'category_id','')::uuid ELSE category_id END,
    account_id=CASE WHEN _payload ? 'account_id' THEN nullif(_payload->>'account_id','')::uuid ELSE account_id END,
    frequency=target_frequency,
    interval_count=target_interval,
    start_date=coalesce(nullif(_payload->>'start_date','')::date,start_date),
    client_id=target_client,
    process_id=CASE WHEN _payload ? 'process_id' THEN nullif(_payload->>'process_id','')::uuid ELSE process_id END,
    end_date=CASE WHEN _payload ? 'end_date' THEN nullif(_payload->>'end_date','')::date ELSE end_date END,
    next_run_date=coalesce(nullif(_payload->>'next_run_date','')::date,next_run_date),
    notes=CASE WHEN _payload ? 'notes' THEN _payload->>'notes' ELSE notes END,
    asaas_auto_charge=target_auto,
    asaas_charge_days_before=target_lead
  WHERE id=result_id AND organization_id=_organization_id;
  IF target_auto THEN
    INSERT INTO public.asaas_charge_jobs(organization_id,transaction_id)
    SELECT transaction.organization_id,transaction.id
    FROM public.financial_transactions transaction
    WHERE transaction.organization_id=_organization_id
      AND transaction.recurrence_id=result_id
      AND transaction.type='income'
      AND transaction.status IN ('pending','partial','overdue')
      AND transaction.archived_at IS NULL
      AND transaction.due_date>=current_date
      AND NOT EXISTS (SELECT 1 FROM public.asaas_charges charge
        WHERE charge.organization_id=transaction.organization_id
          AND charge.transaction_id=transaction.id
          AND charge.status NOT IN ('refunded','chargeback','cancelled','failed'))
    ON CONFLICT (organization_id,transaction_id) DO NOTHING;
  END IF;
  PERFORM public.financial_audit(_organization_id,'financial.recurrence.updated','financial_recurrence',result_id);
  RETURN result_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_asaas_recurring_charge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_asaas_recurring_charge() TO service_role;
REVOKE ALL ON FUNCTION public.create_financial_recurrence(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_financial_recurrence(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_financial_recurrence(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_financial_recurrence(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_recurrence_transactions(
  _organization_id uuid, _payload jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  recurrence_row public.financial_recurrences%ROWTYPE;
  until_date date := coalesce(nullif(_payload->>'until','')::date,current_date);
  horizon_date date;
  run_date date;
  generated integer := 0;
BEGIN
  PERFORM public.financial_assert_editor(_organization_id);
  FOR recurrence_row IN
    SELECT * FROM public.financial_recurrences
     WHERE organization_id=_organization_id AND status='active'
       AND archived_at IS NULL
       AND next_run_date <= until_date + CASE WHEN asaas_auto_charge THEN asaas_charge_days_before ELSE 0 END
     FOR UPDATE
  LOOP
    horizon_date := until_date + CASE WHEN recurrence_row.asaas_auto_charge
      THEN recurrence_row.asaas_charge_days_before ELSE 0 END;
    run_date := recurrence_row.next_run_date;
    WHILE run_date <= horizon_date
      AND (recurrence_row.end_date IS NULL OR run_date <= recurrence_row.end_date)
    LOOP
      INSERT INTO public.financial_transactions(
        organization_id,type,description,amount,category_id,account_id,due_date,
        competence_date,client_id,process_id,notes,recurrence_id,
        recurrence_due_date,created_by
      ) VALUES (
        _organization_id,recurrence_row.type,recurrence_row.name,recurrence_row.amount,
        recurrence_row.category_id,recurrence_row.account_id,run_date,run_date,
        recurrence_row.client_id,recurrence_row.process_id,recurrence_row.notes,
        recurrence_row.id,run_date,auth.uid()
      ) ON CONFLICT(recurrence_id,recurrence_due_date) DO NOTHING;
      IF FOUND THEN generated := generated + 1; END IF;
      run_date := CASE recurrence_row.frequency
        WHEN 'weekly' THEN run_date+(7*recurrence_row.interval_count)
        WHEN 'monthly' THEN run_date+make_interval(months=>recurrence_row.interval_count)
        WHEN 'quarterly' THEN run_date+make_interval(months=>3*recurrence_row.interval_count)
        ELSE run_date+make_interval(years=>recurrence_row.interval_count)
      END;
    END LOOP;
    UPDATE public.financial_recurrences SET
      next_run_date=run_date,
      status=CASE WHEN end_date IS NOT NULL AND run_date>end_date THEN 'finished' ELSE status END
    WHERE id=recurrence_row.id;
  END LOOP;
  PERFORM public.financial_audit(_organization_id,'financial.recurrence.generated',
    'financial_recurrence',NULL,jsonb_build_object('count',generated));
  RETURN generated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_due_financial_recurrences()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  recurrence_record record;
  run_date date;
  horizon_date date;
  generated_for_recurrence integer;
  generated_total integer := 0;
  inserted_count integer;
  iteration_count integer;
BEGIN
  FOR recurrence_record IN
    SELECT recurrence.*,
      (now() AT TIME ZONE CASE
        WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=settings.timezone)
          THEN settings.timezone ELSE 'America/Sao_Paulo' END)::date AS organization_date
    FROM public.financial_recurrences recurrence
    JOIN public.organizations organization ON organization.id=recurrence.organization_id
      AND organization.archived_at IS NULL
    LEFT JOIN public.organization_settings settings ON settings.organization_id=recurrence.organization_id
    WHERE recurrence.status='active' AND recurrence.archived_at IS NULL
      AND recurrence.next_run_date <=
        (now() AT TIME ZONE CASE
          WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=settings.timezone)
            THEN settings.timezone ELSE 'America/Sao_Paulo' END)::date
        + CASE WHEN recurrence.asaas_auto_charge THEN recurrence.asaas_charge_days_before ELSE 0 END
    ORDER BY recurrence.next_run_date,recurrence.id
    FOR UPDATE OF recurrence SKIP LOCKED
  LOOP
    BEGIN
      run_date := recurrence_record.next_run_date;
      horizon_date := recurrence_record.organization_date + CASE
        WHEN recurrence_record.asaas_auto_charge THEN recurrence_record.asaas_charge_days_before ELSE 0 END;
      generated_for_recurrence := 0;
      iteration_count := 0;
      IF recurrence_record.frequency NOT IN ('weekly','monthly','quarterly','yearly') THEN
        RAISE EXCEPTION 'INVALID_FREQUENCY';
      END IF;
      WHILE run_date <= horizon_date
        AND (recurrence_record.end_date IS NULL OR run_date <= recurrence_record.end_date)
        AND iteration_count < 120
      LOOP
        INSERT INTO public.financial_transactions(
          organization_id,type,description,amount,category_id,account_id,due_date,
          competence_date,client_id,process_id,notes,recurrence_id,
          recurrence_due_date,created_by
        ) VALUES (
          recurrence_record.organization_id,recurrence_record.type,recurrence_record.name,
          recurrence_record.amount,recurrence_record.category_id,recurrence_record.account_id,
          run_date,run_date,recurrence_record.client_id,recurrence_record.process_id,
          recurrence_record.notes,recurrence_record.id,run_date,recurrence_record.created_by
        ) ON CONFLICT(recurrence_id,recurrence_due_date) DO NOTHING;
        GET DIAGNOSTICS inserted_count = ROW_COUNT;
        generated_for_recurrence := generated_for_recurrence + inserted_count;
        iteration_count := iteration_count + 1;
        run_date := CASE recurrence_record.frequency
          WHEN 'weekly' THEN run_date+(7*recurrence_record.interval_count)
          WHEN 'monthly' THEN run_date+make_interval(months=>recurrence_record.interval_count)
          WHEN 'quarterly' THEN run_date+make_interval(months=>3*recurrence_record.interval_count)
          WHEN 'yearly' THEN run_date+make_interval(years=>recurrence_record.interval_count)
          ELSE run_date END;
      END LOOP;
      UPDATE public.financial_recurrences SET
        next_run_date=run_date,
        status=CASE WHEN end_date IS NOT NULL AND run_date>end_date THEN 'finished' ELSE status END
      WHERE id=recurrence_record.id AND organization_id=recurrence_record.organization_id;
      IF generated_for_recurrence > 0 THEN
        INSERT INTO public.audit_logs(
          organization_id,actor_id,actor_name,action,entity,entity_id,metadata
        ) VALUES (
          recurrence_record.organization_id,NULL,'Automação','financial.recurrence.generated',
          'financial_recurrence',recurrence_record.id,
          jsonb_build_object('count',generated_for_recurrence,'automatic',true,
            'processed_through',horizon_date)
        );
      END IF;
      generated_total := generated_total + generated_for_recurrence;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'FINANCIAL_RECURRENCE_FAILED: %, %',recurrence_record.id,SQLSTATE;
    END;
  END LOOP;
  RETURN generated_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_recurrence_transactions(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_recurrence_transactions(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.process_due_financial_recurrences()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.process_due_financial_recurrences() TO postgres;

ALTER TABLE public.client_portal_notifications
  DROP CONSTRAINT IF EXISTS client_portal_notifications_kind_check,
  DROP CONSTRAINT IF EXISTS client_portal_notifications_entity_type_check;
ALTER TABLE public.client_portal_notifications
  ADD CONSTRAINT client_portal_notifications_kind_check
    CHECK (kind IN ('process','document','document_request','communication','system','financial')),
  ADD CONSTRAINT client_portal_notifications_entity_type_check
    CHECK (entity_type IS NULL OR entity_type IN (
      'process','document','document_request','communication','asaas_charge'
    ));

CREATE TABLE public.asaas_reminder_push_claims (
  notification_id uuid NOT NULL
    REFERENCES public.client_portal_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, subscription_id)
);
ALTER TABLE public.asaas_reminder_push_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_reminder_push_claims FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.asaas_reminder_push_claims TO service_role;

CREATE OR REPLACE FUNCTION public.create_asaas_client_payment_notifications(
  _as_of timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE created_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT charge.organization_id,charge.client_id,charge.id AS charge_id,
      transaction.description,charge.amount,charge.due_date,
      (charge.due_date-( _as_of AT TIME ZONE CASE
        WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=settings.timezone)
          THEN settings.timezone ELSE 'America/Sao_Paulo' END)::date)::integer AS days_until
    FROM public.asaas_charges charge
    JOIN public.financial_transactions transaction
      ON transaction.id=charge.transaction_id AND transaction.organization_id=charge.organization_id
    JOIN public.organizations organization
      ON organization.id=charge.organization_id AND organization.archived_at IS NULL
    LEFT JOIN public.organization_settings settings ON settings.organization_id=charge.organization_id
    WHERE charge.status IN ('pending','confirmed','overdue')
      AND transaction.status IN ('pending','partial','overdue')
      AND EXISTS (SELECT 1 FROM public.client_portal_access access
        WHERE access.organization_id=charge.organization_id
          AND access.client_id=charge.client_id AND access.is_active)
  ), eligible AS (
    SELECT * FROM candidates WHERE days_until IN (3,1,0,-3,-7)
  ), inserted AS (
    INSERT INTO public.client_portal_notifications(
      organization_id,client_id,kind,title,body,entity_type,entity_id,dedupe_key
    )
    SELECT organization_id,client_id,'financial',
      CASE
        WHEN days_until=3 THEN 'Pagamento vence em 3 dias'
        WHEN days_until=1 THEN 'Pagamento vence amanhã'
        WHEN days_until=0 THEN 'Pagamento vence hoje'
        WHEN days_until=-3 THEN 'Pagamento vencido há 3 dias'
        ELSE 'Pagamento vencido há 7 dias' END,
      format('%s · R$ %s · vencimento %s.',
        left(coalesce(nullif(trim(description),''),'Cobrança'),120),
        amount::text,to_char(due_date,'DD/MM/YYYY')),
      'asaas_charge',charge_id,
      'asaas-payment-reminder:'||charge_id::text||':'||days_until::text
    FROM eligible
    ON CONFLICT DO NOTHING
    RETURNING id
  ) SELECT count(*)::integer INTO created_count FROM inserted;
  RETURN created_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_asaas_charge_jobs(_limit integer DEFAULT 25)
RETURNS TABLE(job_id uuid,organization_id uuid,transaction_id uuid)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH candidates AS (
    SELECT job.id FROM public.asaas_charge_jobs job
    WHERE job.attempts < 8 AND (
      (job.status IN ('pending','failed') AND job.next_attempt_at <= now())
      OR (job.status='processing' AND job.last_attempt_at<=now()-interval '15 minutes')
    )
    ORDER BY job.next_attempt_at,job.created_at
    FOR UPDATE SKIP LOCKED LIMIT least(greatest(_limit,1),100)
  ), claimed AS (
    UPDATE public.asaas_charge_jobs job SET status='processing',
      attempts=job.attempts+1,last_attempt_at=now(),updated_at=now()
    FROM candidates WHERE job.id=candidates.id
    RETURNING job.id,job.organization_id,job.transaction_id
  )
  SELECT id,organization_id,transaction_id FROM claimed
$function$;

CREATE OR REPLACE FUNCTION public.complete_asaas_charge_job(
  _job_id uuid,_succeeded boolean,_error_code text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE job_row public.asaas_charge_jobs%ROWTYPE;
BEGIN
  UPDATE public.asaas_charge_jobs SET
    status=CASE WHEN _succeeded THEN 'succeeded' ELSE 'failed' END,
    completed_at=CASE WHEN _succeeded THEN now() ELSE NULL END,
    last_error_code=CASE WHEN _succeeded THEN NULL ELSE left(coalesce(_error_code,'AUTOMATION_FAILED'),140) END,
    next_attempt_at=CASE WHEN _succeeded THEN next_attempt_at
      ELSE now()+make_interval(mins=>least(1440,greatest(5,(power(2,least(attempts,8))::integer)*5))) END,
    updated_at=now()
  WHERE id=_job_id RETURNING * INTO job_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASAAS_JOB_NOT_FOUND'; END IF;
  IF NOT _succeeded AND job_row.attempts IN (1,3,6,8) THEN
    INSERT INTO public.notifications(
      organization_id,user_id,title,body,kind,entity_type,entity_id,action_url,dedupe_key
    )
    SELECT job_row.organization_id,member.user_id,
      'Cobrança automática precisa de atenção',
      'Não foi possível gerar uma cobrança recorrente. Motivo: '||job_row.last_error_code||'.',
      'warning','financeiro',job_row.transaction_id,'/financeiro',
      'asaas-job-failed:'||job_row.id::text||':'||job_row.attempts::text||':'||member.user_id::text
    FROM public.organization_members member
    WHERE member.organization_id=job_row.organization_id AND member.is_active
      AND member.role IN ('proprietario','administrador','gestor','financeiro')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_asaas_reminder_push_deliveries(_limit integer DEFAULT 100)
RETURNS TABLE(
  notification_id uuid,subscription_id uuid,endpoint text,p256dh text,
  auth_key text,title text,body text,action_url text
)
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH candidate AS (
    SELECT notification.id AS notification_id,subscription.id AS subscription_id,
      subscription.endpoint,subscription.p256dh,subscription.auth_key,
      notification.title,coalesce(notification.body,'') AS body,
      '/meu-portal?tab=pagamentos&charge='||notification.entity_id::text AS action_url
    FROM public.client_portal_notifications notification
    JOIN public.client_portal_access access
      ON access.organization_id=notification.organization_id
      AND access.client_id=notification.client_id AND access.is_active
    JOIN public.push_subscriptions subscription
      ON subscription.organization_id=notification.organization_id
      AND subscription.user_id=access.user_id AND subscription.is_active
    WHERE notification.kind='financial' AND notification.entity_type='asaas_charge'
      AND notification.created_at>=now()-interval '24 hours'
      AND NOT EXISTS (SELECT 1 FROM public.asaas_reminder_push_claims claim
        WHERE claim.notification_id=notification.id AND claim.subscription_id=subscription.id)
    ORDER BY notification.created_at
    LIMIT least(greatest(_limit,1),500)
  ), claimed AS (
    INSERT INTO public.asaas_reminder_push_claims(notification_id,subscription_id)
    SELECT notification_id,subscription_id FROM candidate
    ON CONFLICT DO NOTHING RETURNING notification_id,subscription_id
  )
  SELECT candidate.notification_id,candidate.subscription_id,candidate.endpoint,
    candidate.p256dh,candidate.auth_key,candidate.title,candidate.body,candidate.action_url
  FROM candidate JOIN claimed USING(notification_id,subscription_id)
$function$;

REVOKE ALL ON FUNCTION public.create_asaas_client_payment_notifications(timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_asaas_client_payment_notifications(timestamptz) TO postgres;
REVOKE ALL ON FUNCTION public.claim_asaas_charge_jobs(integer),
  public.complete_asaas_charge_job(uuid,boolean,text),
  public.claim_asaas_reminder_push_deliveries(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_asaas_charge_jobs(integer),
  public.complete_asaas_charge_job(uuid,boolean,text),
  public.claim_asaas_reminder_push_deliveries(integer) TO service_role;

-- Keep the single existing fifteen-minute database clock and preserve the
-- complete stage manifest so database validation can detect accidental drops.
CREATE OR REPLACE FUNCTION public.run_temporal_automation_cycle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  scheduled_count integer;
  critical_count integer := 0;
  unassigned_count integer := 0;
  deadline_count integer := 0;
  overdue_escalation_count integer := 0;
  stale_process_count integer := 0;
  overdue_communication_count integer := 0;
  expired_document_count integer := 0;
  overdue_financial_count integer := 0;
  financial_recurrence_count integer := 0;
  weekly_financial_summary_count integer := 0;
  weekly_data_quality_count integer := 0;
  stale_client_count integer := 0;
  client_birthday_count integer := 0;
  stale_lead_count integer := 0;
  stale_task_count integer := 0;
  daily_operational_close_count integer := 0;
  weekly_productivity_report_count integer := 0;
  kiwify_expiry_count integer := 0;
  commercial_next_action_count integer := 0;
  payment_reminder_count integer := 0;
BEGIN
  scheduled_count := public.process_due_scheduled_automations();

  BEGIN
    kiwify_expiry_count := public.suspend_expired_kiwify_subscriptions();
  EXCEPTION WHEN OTHERS THEN
    kiwify_expiry_count := -1;
    RAISE WARNING 'KIWIFY_SUBSCRIPTION_EXPIRY_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_productivity_report_count :=
      public.create_weekly_productivity_report_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_productivity_report_count := -1;
    RAISE WARNING 'WEEKLY_PRODUCTIVITY_REPORT_FAILED: %', SQLSTATE;
  END;

  BEGIN
    daily_operational_close_count :=
      public.create_daily_operational_close_notifications();
  EXCEPTION WHEN OTHERS THEN
    daily_operational_close_count := -1;
    RAISE WARNING 'DAILY_OPERATIONAL_CLOSE_FAILED: %', SQLSTATE;
  END;

  BEGIN
    financial_recurrence_count := public.process_due_financial_recurrences();
  EXCEPTION WHEN OTHERS THEN
    financial_recurrence_count := -1;
    RAISE WARNING 'FINANCIAL_RECURRENCE_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_financial_summary_count :=
      public.create_weekly_financial_summary_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_financial_summary_count := -1;
    RAISE WARNING 'WEEKLY_FINANCIAL_SUMMARY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    weekly_data_quality_count :=
      public.create_weekly_data_quality_notifications();
  EXCEPTION WHEN OTHERS THEN
    weekly_data_quality_count := -1;
    RAISE WARNING 'WEEKLY_DATA_QUALITY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_client_count := public.create_stale_client_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_client_count := -1;
    RAISE WARNING 'STALE_CLIENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    client_birthday_count := public.create_client_birthday_notifications();
  EXCEPTION WHEN OTHERS THEN
    client_birthday_count := -1;
    RAISE WARNING 'CLIENT_BIRTHDAY_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_lead_count := public.create_stale_lead_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_lead_count := -1;
    RAISE WARNING 'STALE_LEAD_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    critical_count := public.create_critical_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    critical_count := -1;
    RAISE WARNING 'CRITICAL_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    unassigned_count := public.create_unassigned_monitoring_notifications();
  EXCEPTION WHEN OTHERS THEN
    unassigned_count := -1;
    RAISE WARNING 'UNASSIGNED_MONITORING_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    deadline_count := public.create_deadline_reminder_notifications();
  EXCEPTION WHEN OTHERS THEN
    deadline_count := -1;
    RAISE WARNING 'DEADLINE_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_escalation_count :=
      public.create_overdue_task_escalation_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_escalation_count := -1;
    RAISE WARNING 'OVERDUE_TASK_ESCALATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_task_count := public.create_stale_task_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_task_count := -1;
    RAISE WARNING 'STALE_TASK_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    stale_process_count := public.create_stale_process_notifications();
  EXCEPTION WHEN OTHERS THEN
    stale_process_count := -1;
    RAISE WARNING 'STALE_PROCESS_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_communication_count :=
      public.create_overdue_communication_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_communication_count := -1;
    RAISE WARNING 'OVERDUE_COMMUNICATION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    expired_document_count := public.create_expired_document_notifications();
  EXCEPTION WHEN OTHERS THEN
    expired_document_count := -1;
    RAISE WARNING 'EXPIRED_DOCUMENT_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    overdue_financial_count := public.create_overdue_financial_notifications();
  EXCEPTION WHEN OTHERS THEN
    overdue_financial_count := -1;
    RAISE WARNING 'OVERDUE_FINANCIAL_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    commercial_next_action_count :=
      public.create_commercial_next_action_notifications();
  EXCEPTION WHEN OTHERS THEN
    commercial_next_action_count := -1;
    RAISE WARNING 'COMMERCIAL_NEXT_ACTION_SCAN_FAILED: %', SQLSTATE;
  END;

  BEGIN
    payment_reminder_count := public.create_asaas_client_payment_notifications();
  EXCEPTION WHEN OTHERS THEN
    payment_reminder_count := -1;
    RAISE WARNING 'ASAAS_CLIENT_PAYMENT_REMINDER_SCAN_FAILED: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'scheduled_processed', scheduled_count,
    'kiwify_subscriptions_suspended', kiwify_expiry_count,
    'weekly_productivity_reports_created', weekly_productivity_report_count,
    'daily_operational_close_notifications_created',
      daily_operational_close_count,
    'critical_notifications_created', critical_count,
    'unassigned_notifications_created', unassigned_count,
    'deadline_notifications_created', deadline_count,
    'overdue_task_escalations_created', overdue_escalation_count,
    'stale_task_notifications_created', stale_task_count,
    'stale_process_notifications_created', stale_process_count,
    'overdue_communication_notifications_created',
      overdue_communication_count,
    'expired_document_notifications_created', expired_document_count,
    'overdue_financial_notifications_created', overdue_financial_count,
    'financial_recurrence_transactions_created', financial_recurrence_count,
    'weekly_financial_summaries_created', weekly_financial_summary_count,
    'weekly_data_quality_notifications_created', weekly_data_quality_count,
    'stale_client_notifications_created', stale_client_count,
    'client_birthday_notifications_created', client_birthday_count,
    'stale_lead_notifications_created', stale_lead_count,
    'commercial_next_action_notifications_created',
      commercial_next_action_count,
    'asaas_client_payment_reminders_created', payment_reminder_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.run_temporal_automation_cycle()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_temporal_automation_cycle() TO postgres;
