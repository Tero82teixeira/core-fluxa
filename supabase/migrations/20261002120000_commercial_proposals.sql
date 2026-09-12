-- Commercial proposals with public acceptance and transactional conversion into
-- client, won opportunity, financial revenue and optional Asaas collection.

CREATE UNIQUE INDEX commercial_opportunities_org_id_uq
  ON public.commercial_opportunities(organization_id, id);

CREATE TABLE public.commercial_proposal_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  proposal_year smallint NOT NULL CHECK (proposal_year BETWEEN 2020 AND 2200),
  next_number integer NOT NULL DEFAULT 1 CHECK (next_number BETWEEN 1 AND 999999999),
  PRIMARY KEY (organization_id, proposal_year)
);

CREATE TABLE public.commercial_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  proposal_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','accepted','declined','expired','cancelled')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 180),
  service_description text NOT NULL
    CHECK (length(btrim(service_description)) BETWEEN 3 AND 2000),
  terms text NOT NULL CHECK (length(btrim(terms)) BETWEEN 3 AND 4000),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 2 AND 160),
  customer_email text,
  customer_phone text,
  customer_document text,
  customer_document_digits text,
  amount numeric(14,2) NOT NULL CHECK (amount BETWEEN 0.01 AND 999999999999.99),
  billing_frequency text NOT NULL DEFAULT 'once'
    CHECK (billing_frequency IN ('once','monthly','quarterly','yearly')),
  first_due_date date NOT NULL,
  valid_until date NOT NULL,
  asaas_auto_charge boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  responded_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  accepted_by_name text,
  acceptance_user_agent_hash text,
  converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  converted_opportunity_id uuid REFERENCES public.commercial_opportunities(id) ON DELETE SET NULL,
  recurrence_id uuid REFERENCES public.financial_recurrences(id) ON DELETE SET NULL,
  initial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (organization_id, proposal_number),
  FOREIGN KEY (organization_id, opportunity_id)
    REFERENCES public.commercial_opportunities(organization_id, id),
  CHECK (customer_email IS NULL OR length(customer_email) <= 255),
  CHECK (customer_phone IS NULL OR length(customer_phone) BETWEEN 10 AND 15),
  CHECK (customer_document_digits IS NULL OR length(customer_document_digits) IN (11,14)),
  CHECK (NOT asaas_auto_charge OR customer_document_digits IS NOT NULL)
);

CREATE INDEX commercial_proposals_org_status_idx
  ON public.commercial_proposals(organization_id, status, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX commercial_proposals_opportunity_idx
  ON public.commercial_proposals(organization_id, opportunity_id, created_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN commercial_proposal_id uuid
  REFERENCES public.commercial_proposals(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX financial_transactions_commercial_proposal_uq
  ON public.financial_transactions(commercial_proposal_id)
  WHERE commercial_proposal_id IS NOT NULL;

ALTER TABLE public.commercial_proposal_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_proposals_select ON public.commercial_proposals
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.commercial_proposal_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.commercial_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_proposals TO authenticated;
GRANT ALL ON public.commercial_proposal_counters, public.commercial_proposals TO service_role;

CREATE OR REPLACE FUNCTION public.save_commercial_proposal(
  _organization_id uuid,
  _proposal_id uuid,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  result_id uuid;
  existing public.commercial_proposals;
  normalized_email text := nullif(lower(btrim(coalesce(_payload->>'customer_email',''))), '');
  normalized_phone text := nullif(regexp_replace(coalesce(_payload->>'customer_phone',''), '[^0-9]', '', 'g'), '');
  normalized_document text := nullif(regexp_replace(coalesce(_payload->>'customer_document',''), '[^0-9]', '', 'g'), '');
  target_opportunity uuid := nullif(_payload->>'opportunity_id','')::uuid;
  target_client uuid := nullif(_payload->>'client_id','')::uuid;
  target_auto boolean := coalesce((_payload->>'asaas_auto_charge')::boolean, false);
  target_amount numeric := nullif(_payload->>'amount','')::numeric;
  target_valid_until date := nullif(_payload->>'valid_until','')::date;
  target_due_date date := nullif(_payload->>'first_due_date','')::date;
  target_frequency text := coalesce(nullif(_payload->>'billing_frequency',''), 'once');
  counter_value integer;
  year_value smallint := extract(year FROM current_date)::smallint;
  number_value text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY[
    'superadmin','proprietario','administrador','gestor','operacional'
  ]::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF length(btrim(coalesce(_payload->>'title',''))) NOT BETWEEN 3 AND 180
    THEN RAISE EXCEPTION 'INVALID_PROPOSAL_TITLE'; END IF;
  IF length(btrim(coalesce(_payload->>'service_description',''))) NOT BETWEEN 3 AND 2000
    THEN RAISE EXCEPTION 'INVALID_SERVICE_DESCRIPTION'; END IF;
  IF length(btrim(coalesce(_payload->>'terms',''))) NOT BETWEEN 3 AND 4000
    THEN RAISE EXCEPTION 'INVALID_PROPOSAL_TERMS'; END IF;
  IF length(btrim(coalesce(_payload->>'customer_name',''))) NOT BETWEEN 2 AND 160
    THEN RAISE EXCEPTION 'INVALID_CUSTOMER_NAME'; END IF;
  IF normalized_email IS NOT NULL AND normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'INVALID_CUSTOMER_EMAIL'; END IF;
  IF normalized_phone IS NOT NULL AND length(normalized_phone) NOT BETWEEN 10 AND 15
    THEN RAISE EXCEPTION 'INVALID_CUSTOMER_PHONE'; END IF;
  IF normalized_document IS NOT NULL AND length(normalized_document) NOT IN (11,14)
    THEN RAISE EXCEPTION 'INVALID_CUSTOMER_DOCUMENT'; END IF;
  IF target_auto AND normalized_document IS NULL
    THEN RAISE EXCEPTION 'ASAAS_PROPOSAL_REQUIRES_DOCUMENT'; END IF;
  IF target_amount IS NULL OR target_amount NOT BETWEEN 0.01 AND 999999999999.99
    THEN RAISE EXCEPTION 'INVALID_PROPOSAL_AMOUNT'; END IF;
  IF target_frequency NOT IN ('once','monthly','quarterly','yearly')
    THEN RAISE EXCEPTION 'INVALID_BILLING_FREQUENCY'; END IF;
  IF target_valid_until IS NULL OR target_valid_until < current_date
    THEN RAISE EXCEPTION 'INVALID_PROPOSAL_VALIDITY'; END IF;
  IF target_due_date IS NULL OR target_due_date < current_date
    THEN RAISE EXCEPTION 'INVALID_FIRST_DUE_DATE'; END IF;
  IF target_opportunity IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commercial_opportunities opportunity
    WHERE opportunity.id=target_opportunity AND opportunity.organization_id=_organization_id
      AND opportunity.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'OPPORTUNITY_SCOPE_MISMATCH'; END IF;
  IF target_client IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients client
    WHERE client.id=target_client AND client.organization_id=_organization_id
      AND client.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'CLIENT_SCOPE_MISMATCH'; END IF;

  IF _proposal_id IS NULL THEN
    INSERT INTO public.commercial_proposal_counters(organization_id, proposal_year, next_number)
    VALUES (_organization_id, year_value, 2)
    ON CONFLICT (organization_id, proposal_year) DO UPDATE
      SET next_number = public.commercial_proposal_counters.next_number + 1
    RETURNING next_number - 1 INTO counter_value;
    number_value := 'PROP-' || year_value::text || '-' || lpad(counter_value::text, 4, '0');
    INSERT INTO public.commercial_proposals(
      organization_id, opportunity_id, client_id, proposal_number, title,
      service_description, terms, customer_name, customer_email, customer_phone,
      customer_document, customer_document_digits, amount, billing_frequency,
      first_due_date, valid_until, asaas_auto_charge, created_by, updated_by
    ) VALUES (
      _organization_id, target_opportunity, target_client, number_value,
      btrim(_payload->>'title'), btrim(_payload->>'service_description'),
      btrim(_payload->>'terms'), btrim(_payload->>'customer_name'), normalized_email,
      normalized_phone, nullif(btrim(coalesce(_payload->>'customer_document','')), ''),
      normalized_document, target_amount, target_frequency, target_due_date,
      target_valid_until, target_auto, auth.uid(), auth.uid()
    ) RETURNING id INTO result_id;
  ELSE
    SELECT * INTO existing FROM public.commercial_proposals
    WHERE id=_proposal_id AND organization_id=_organization_id
      AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
    IF existing.status <> 'draft' THEN RAISE EXCEPTION 'PROPOSAL_NOT_EDITABLE'; END IF;
    UPDATE public.commercial_proposals SET
      opportunity_id=target_opportunity, client_id=target_client,
      title=btrim(_payload->>'title'), service_description=btrim(_payload->>'service_description'),
      terms=btrim(_payload->>'terms'), customer_name=btrim(_payload->>'customer_name'),
      customer_email=normalized_email, customer_phone=normalized_phone,
      customer_document=nullif(btrim(coalesce(_payload->>'customer_document','')), ''),
      customer_document_digits=normalized_document, amount=target_amount,
      billing_frequency=target_frequency, first_due_date=target_due_date,
      valid_until=target_valid_until, asaas_auto_charge=target_auto,
      updated_by=auth.uid(), updated_at=now()
    WHERE id=existing.id RETURNING id INTO result_id;
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  VALUES(_organization_id,auth.uid(),CASE WHEN _proposal_id IS NULL
    THEN 'commercial.proposal.created' ELSE 'commercial.proposal.updated' END,
    'commercial_proposal',result_id,jsonb_build_object('amount',target_amount,'frequency',target_frequency));
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_commercial_proposal(
  _organization_id uuid,
  _proposal_id uuid,
  _rotate_token boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE proposal public.commercial_proposals;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY[
    'superadmin','proprietario','administrador','gestor','operacional'
  ]::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO proposal FROM public.commercial_proposals
  WHERE id=_proposal_id AND organization_id=_organization_id
    AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND'; END IF;
  IF proposal.status NOT IN ('draft','sent','viewed') THEN RAISE EXCEPTION 'PROPOSAL_NOT_PUBLISHABLE'; END IF;
  IF proposal.valid_until < current_date THEN RAISE EXCEPTION 'PROPOSAL_EXPIRED'; END IF;
  IF proposal.asaas_auto_charge AND NOT EXISTS (
    SELECT 1 FROM public.asaas_connections connection
    WHERE connection.organization_id=_organization_id AND connection.status='connected'
  ) THEN RAISE EXCEPTION 'ASAAS_NOT_CONNECTED'; END IF;
  UPDATE public.commercial_proposals SET status='sent',
    public_token=CASE WHEN _rotate_token THEN gen_random_uuid() ELSE public_token END,
    sent_at=coalesce(sent_at,now()), updated_by=auth.uid(), updated_at=now()
  WHERE id=proposal.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id)
  VALUES(_organization_id,auth.uid(),'commercial.proposal.published','commercial_proposal',proposal.id);
  RETURN proposal.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_commercial_proposal(
  _organization_id uuid,
  _proposal_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY[
    'superadmin','proprietario','administrador','gestor'
  ]::public.app_role[]) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.commercial_proposals SET status='cancelled',updated_by=auth.uid(),updated_at=now()
  WHERE id=_proposal_id AND organization_id=_organization_id
    AND status IN ('draft','sent','viewed') AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROPOSAL_NOT_CANCELLABLE'; END IF;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id)
  VALUES(_organization_id,auth.uid(),'commercial.proposal.cancelled','commercial_proposal',_proposal_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_commercial_proposal(_public_token uuid)
RETURNS TABLE(
  proposal_number text, status text, title text, service_description text,
  terms text, customer_name text, amount numeric, billing_frequency text,
  first_due_date date, valid_until date, organization_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  UPDATE public.commercial_proposals proposal SET
    status=CASE WHEN proposal.valid_until < current_date THEN 'expired' ELSE 'viewed' END,
    first_viewed_at=coalesce(proposal.first_viewed_at,now()), updated_at=now()
  WHERE proposal.public_token=_public_token AND proposal.archived_at IS NULL
    AND proposal.status IN ('sent','viewed');
  RETURN QUERY
  SELECT proposal.proposal_number,proposal.status,proposal.title,
    proposal.service_description,proposal.terms,proposal.customer_name,
    proposal.amount,proposal.billing_frequency,proposal.first_due_date,
    proposal.valid_until,coalesce(organization.trade_name,organization.legal_name)
  FROM public.commercial_proposals proposal
  JOIN public.organizations organization ON organization.id=proposal.organization_id
  WHERE proposal.public_token=_public_token AND proposal.archived_at IS NULL
    AND proposal.status IN ('viewed','accepted','declined','expired');
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_commercial_proposal(
  _public_token uuid,
  _decision text,
  _accepted_by_name text DEFAULT NULL,
  _confirmed boolean DEFAULT false,
  _user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  proposal public.commercial_proposals;
  selected_owner uuid;
  selected_owner_name text;
  result_client_id uuid;
  result_opportunity_id uuid;
  result_recurrence_id uuid;
  result_transaction_id uuid;
  current_stage text;
  next_recurrence_date date;
  recurrence_frequency text;
  normalized_name text := nullif(btrim(coalesce(_accepted_by_name,'')), '');
BEGIN
  IF _decision NOT IN ('accept','decline') THEN RAISE EXCEPTION 'INVALID_PROPOSAL_DECISION'; END IF;
  SELECT * INTO proposal FROM public.commercial_proposals
  WHERE public_token=_public_token AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR proposal.status NOT IN ('sent','viewed','accepted','declined')
    THEN RAISE EXCEPTION 'PROPOSAL_NOT_AVAILABLE'; END IF;
  IF proposal.status='accepted' THEN RETURN jsonb_build_object('accepted',true,'already_processed',true); END IF;
  IF proposal.status='declined' THEN RETURN jsonb_build_object('accepted',false,'already_processed',true); END IF;
  IF proposal.valid_until < current_date THEN
    UPDATE public.commercial_proposals SET status='expired',updated_at=now() WHERE id=proposal.id;
    RAISE EXCEPTION 'PROPOSAL_EXPIRED';
  END IF;
  IF NOT coalesce(_confirmed,false) THEN RAISE EXCEPTION 'PROPOSAL_CONFIRMATION_REQUIRED'; END IF;

  IF _decision='decline' THEN
    UPDATE public.commercial_proposals SET status='declined',responded_at=now(),declined_at=now(),
      updated_at=now() WHERE id=proposal.id;
    INSERT INTO public.notifications(organization_id,user_id,title,body,kind,action_url,dedupe_key)
    SELECT proposal.organization_id,member.user_id,'Proposta recusada',
      proposal.customer_name || ' recusou a proposta ' || proposal.proposal_number || '.',
      'warning','/relatorios?tipo=commercial','proposal-declined:'||proposal.id::text||':'||member.user_id::text
    FROM public.organization_members member WHERE member.organization_id=proposal.organization_id
      AND member.is_active AND member.role IN ('proprietario','administrador','gestor','operacional')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id)
    VALUES(proposal.organization_id,NULL,'Link público','commercial.proposal.declined','commercial_proposal',proposal.id);
    RETURN jsonb_build_object('accepted',false);
  END IF;

  IF normalized_name IS NULL OR length(normalized_name) NOT BETWEEN 2 AND 160
    THEN RAISE EXCEPTION 'ACCEPTED_BY_NAME_REQUIRED'; END IF;
  IF proposal.asaas_auto_charge AND proposal.customer_document_digits IS NULL
    THEN RAISE EXCEPTION 'ASAAS_PROPOSAL_REQUIRES_DOCUMENT'; END IF;

  SELECT coalesce(opportunity.owner_id,client.owner_id) INTO selected_owner
  FROM (SELECT proposal.opportunity_id AS opportunity_id, proposal.client_id AS client_id) source
  LEFT JOIN public.commercial_opportunities opportunity ON opportunity.id=source.opportunity_id
  LEFT JOIN public.clients client ON client.id=source.client_id;
  IF selected_owner IS NULL THEN
    SELECT member.user_id INTO selected_owner FROM public.organization_members member
    WHERE member.organization_id=proposal.organization_id AND member.is_active
      AND member.role IN ('proprietario','administrador','gestor','operacional')
    ORDER BY member.created_at,member.user_id LIMIT 1;
  END IF;
  IF selected_owner IS NULL THEN RAISE EXCEPTION 'ORGANIZATION_WITHOUT_OWNER'; END IF;
  SELECT coalesce(profile.full_name,profile.email) INTO selected_owner_name
  FROM public.profiles profile WHERE profile.id=selected_owner;

  result_client_id := proposal.client_id;
  IF result_client_id IS NULL THEN
    SELECT client.id INTO result_client_id FROM public.clients client
    WHERE client.organization_id=proposal.organization_id AND client.archived_at IS NULL
      AND ((proposal.customer_document_digits IS NOT NULL AND client.document_digits=proposal.customer_document_digits)
        OR (proposal.customer_email IS NOT NULL AND lower(client.email)=proposal.customer_email)
        OR (proposal.customer_phone IS NOT NULL AND (client.phone=proposal.customer_phone OR client.whatsapp=proposal.customer_phone)))
    ORDER BY client.created_at LIMIT 1;
  END IF;
  IF result_client_id IS NULL THEN
    INSERT INTO public.clients(
      organization_id,person_type,name,document,document_digits,email,phone,whatsapp,
      status,owner_id,owner_name,notes,last_interaction_at,created_by,updated_by
    ) VALUES (
      proposal.organization_id,(CASE WHEN length(proposal.customer_document_digits)=14 THEN 'pj' ELSE 'pf' END)::public.person_type,
      proposal.customer_name,proposal.customer_document,proposal.customer_document_digits,
      proposal.customer_email,proposal.customer_phone,proposal.customer_phone,'ativo',
      selected_owner,selected_owner_name,'Cliente convertido pela proposta '||proposal.proposal_number,
      now(),selected_owner,selected_owner
    ) RETURNING id INTO result_client_id;
  ELSE
    UPDATE public.clients SET status='ativo',
      document=coalesce(document,proposal.customer_document),
      document_digits=coalesce(document_digits,proposal.customer_document_digits),
      email=coalesce(email,proposal.customer_email),phone=coalesce(phone,proposal.customer_phone),
      whatsapp=coalesce(whatsapp,proposal.customer_phone),last_interaction_at=now(),
      updated_by=selected_owner,updated_at=now()
    WHERE id=result_client_id AND organization_id=proposal.organization_id;
  END IF;

  result_opportunity_id := proposal.opportunity_id;
  IF result_opportunity_id IS NULL THEN
    INSERT INTO public.commercial_opportunities(
      organization_id,client_id,title,stage,estimated_value,probability,owner_id,
      won_at,created_by,updated_by
    ) VALUES (proposal.organization_id,result_client_id,proposal.title,'won',proposal.amount,
      100,selected_owner,now(),selected_owner,selected_owner)
    RETURNING id INTO result_opportunity_id;
    INSERT INTO public.commercial_opportunity_stage_history(
      organization_id,opportunity_id,from_stage,to_stage,changed_by
    ) VALUES(proposal.organization_id,result_opportunity_id,NULL,'won',selected_owner);
  ELSE
    SELECT stage INTO current_stage FROM public.commercial_opportunities
    WHERE id=result_opportunity_id AND organization_id=proposal.organization_id FOR UPDATE;
    UPDATE public.commercial_opportunities SET client_id=result_client_id,stage='won',
      estimated_value=proposal.amount,probability=100,won_at=coalesce(won_at,now()),
      lost_at=NULL,lost_reason=NULL,updated_by=selected_owner,updated_at=now()
    WHERE id=result_opportunity_id;
    IF current_stage IS DISTINCT FROM 'won' THEN
      INSERT INTO public.commercial_opportunity_stage_history(
        organization_id,opportunity_id,from_stage,to_stage,changed_by
      ) VALUES(proposal.organization_id,result_opportunity_id,current_stage,'won',selected_owner);
    END IF;
  END IF;

  IF proposal.billing_frequency <> 'once' THEN
    recurrence_frequency := proposal.billing_frequency;
    next_recurrence_date := (CASE proposal.billing_frequency
      WHEN 'monthly' THEN proposal.first_due_date + interval '1 month'
      WHEN 'quarterly' THEN proposal.first_due_date + interval '3 months'
      ELSE proposal.first_due_date + interval '1 year' END)::date;
    INSERT INTO public.financial_recurrences(
      organization_id,name,type,amount,frequency,interval_count,start_date,next_run_date,
      status,client_id,notes,asaas_auto_charge,asaas_charge_days_before,created_by
    ) VALUES (proposal.organization_id,proposal.title,'income',proposal.amount,
      recurrence_frequency,1,proposal.first_due_date,next_recurrence_date,'active',
      result_client_id,'Criada pela proposta '||proposal.proposal_number,
      proposal.asaas_auto_charge,0,selected_owner)
    RETURNING id INTO result_recurrence_id;
  END IF;

  INSERT INTO public.financial_transactions(
    organization_id,type,description,amount,status,due_date,competence_date,client_id,
    notes,reference,recurrence_id,recurrence_due_date,commercial_proposal_id,created_by
  ) VALUES (proposal.organization_id,'income',proposal.title,proposal.amount,'pending',
    proposal.first_due_date,proposal.first_due_date,result_client_id,
    'Primeira cobrança da proposta '||proposal.proposal_number,proposal.proposal_number,
    result_recurrence_id,CASE WHEN result_recurrence_id IS NOT NULL THEN proposal.first_due_date END,
    proposal.id,selected_owner)
  RETURNING id INTO result_transaction_id;

  IF proposal.asaas_auto_charge THEN
    INSERT INTO public.asaas_charge_jobs(organization_id,transaction_id)
    VALUES(proposal.organization_id,result_transaction_id) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.commercial_proposals SET status='accepted',responded_at=now(),accepted_at=now(),
    accepted_by_name=normalized_name,
    acceptance_user_agent_hash=CASE WHEN nullif(btrim(coalesce(_user_agent,'')),'') IS NULL
      THEN NULL ELSE encode(extensions.digest(left(_user_agent,500),'sha256'),'hex') END,
    converted_client_id=result_client_id,converted_opportunity_id=result_opportunity_id,
    recurrence_id=result_recurrence_id,initial_transaction_id=result_transaction_id,
    updated_at=now()
  WHERE id=proposal.id;

  INSERT INTO public.notifications(organization_id,user_id,title,body,kind,action_url,dedupe_key)
  SELECT proposal.organization_id,member.user_id,'Proposta aceita',
    proposal.customer_name || ' aceitou a proposta ' || proposal.proposal_number || '.',
    'success','/relatorios?tipo=commercial','proposal-accepted:'||proposal.id::text||':'||member.user_id::text
  FROM public.organization_members member WHERE member.organization_id=proposal.organization_id
    AND member.is_active AND member.role IN ('proprietario','administrador','gestor','operacional','financeiro')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id,metadata)
  VALUES(proposal.organization_id,NULL,'Link público','commercial.proposal.accepted','commercial_proposal',proposal.id,
    jsonb_build_object('client_id',result_client_id,'opportunity_id',result_opportunity_id,
      'recurrence_id',result_recurrence_id,'transaction_id',result_transaction_id));
  RETURN jsonb_build_object('accepted',true,'charge_scheduled',proposal.asaas_auto_charge);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_commercial_proposal(uuid,uuid,jsonb),
  public.publish_commercial_proposal(uuid,uuid,boolean),
  public.cancel_commercial_proposal(uuid,uuid),
  public.get_public_commercial_proposal(uuid),
  public.respond_to_commercial_proposal(uuid,text,text,boolean,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_commercial_proposal(uuid,uuid,jsonb),
  public.publish_commercial_proposal(uuid,uuid,boolean),
  public.cancel_commercial_proposal(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_commercial_proposal(uuid),
  public.respond_to_commercial_proposal(uuid,text,text,boolean,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_commercial_proposal(uuid,uuid,jsonb),
  public.publish_commercial_proposal(uuid,uuid,boolean),
  public.cancel_commercial_proposal(uuid,uuid),
  public.get_public_commercial_proposal(uuid),
  public.respond_to_commercial_proposal(uuid,text,text,boolean,text) TO service_role;
