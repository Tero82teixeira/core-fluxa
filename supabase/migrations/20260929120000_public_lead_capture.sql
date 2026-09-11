-- Public lead capture for each tenant. Anonymous visitors can only reach two
-- narrow SECURITY DEFINER functions; all stored data remains organization-scoped.

CREATE TABLE public.lead_capture_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Fale com nossa equipe' CHECK (length(btrim(title)) BETWEEN 3 AND 100),
  description text NOT NULL DEFAULT 'Conte um pouco sobre o que você precisa e entraremos em contato.' CHECK (length(btrim(description)) BETWEEN 3 AND 500),
  success_message text NOT NULL DEFAULT 'Recebemos seus dados. Nossa equipe entrará em contato em breve.' CHECK (length(btrim(success_message)) BETWEEN 3 AND 300),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lead_capture_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.lead_capture_forms(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL REFERENCES public.commercial_opportunities(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  email text,
  phone text,
  company text,
  message text,
  source text NOT NULL DEFAULT 'link',
  contact_fingerprint text NOT NULL,
  consent_at timestamptz NOT NULL,
  privacy_notice_version text NOT NULL DEFAULT '1.0',
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (email IS NULL OR length(email) <= 255),
  CHECK (phone IS NULL OR length(phone) BETWEEN 10 AND 15),
  CHECK (company IS NULL OR length(btrim(company)) BETWEEN 2 AND 160),
  CHECK (message IS NULL OR length(btrim(message)) BETWEEN 3 AND 2000),
  CHECK (length(source) BETWEEN 1 AND 80)
);

CREATE INDEX lead_capture_submissions_org_received_idx
  ON public.lead_capture_submissions(organization_id, received_at DESC);
CREATE INDEX lead_capture_submissions_form_fingerprint_idx
  ON public.lead_capture_submissions(form_id, contact_fingerprint, received_at DESC);

ALTER TABLE public.lead_capture_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_capture_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_capture_forms_select ON public.lead_capture_forms
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY lead_capture_submissions_select ON public.lead_capture_submissions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON TABLE public.lead_capture_forms, public.lead_capture_submissions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lead_capture_forms, public.lead_capture_submissions FROM authenticated;
GRANT SELECT ON TABLE public.lead_capture_forms, public.lead_capture_submissions TO authenticated;
GRANT ALL ON TABLE public.lead_capture_forms, public.lead_capture_submissions TO service_role;

CREATE OR REPLACE FUNCTION public.save_lead_capture_form(
  _organization_id uuid,
  _title text,
  _description text,
  _success_message text,
  _is_active boolean,
  _rotate_token boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE result public.lead_capture_forms;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_org_role(_organization_id, ARRAY['superadmin','proprietario','administrador','gestor']::public.app_role[])
    THEN RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations org WHERE org.id = _organization_id AND org.archived_at IS NULL)
    THEN RAISE EXCEPTION 'ORGANIZATION_NOT_AVAILABLE';
  END IF;
  IF length(btrim(coalesce(_title,''))) NOT BETWEEN 3 AND 100
    OR length(btrim(coalesce(_description,''))) NOT BETWEEN 3 AND 500
    OR length(btrim(coalesce(_success_message,''))) NOT BETWEEN 3 AND 300
    THEN RAISE EXCEPTION 'INVALID_LEAD_FORM_CONTENT';
  END IF;

  INSERT INTO public.lead_capture_forms(
    organization_id, title, description, success_message, is_active, created_by, updated_by
  ) VALUES (
    _organization_id, btrim(_title), btrim(_description), btrim(_success_message), coalesce(_is_active,false), auth.uid(), auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    title = excluded.title,
    description = excluded.description,
    success_message = excluded.success_message,
    is_active = excluded.is_active,
    public_token = CASE WHEN _rotate_token THEN gen_random_uuid() ELSE lead_capture_forms.public_token END,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO result;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  VALUES (
    _organization_id, auth.uid(),
    CASE WHEN _rotate_token THEN 'lead.capture_link.rotated' ELSE 'lead.capture_form.saved' END,
    'lead_capture_form', result.id,
    jsonb_build_object('active', result.is_active)
  );
  RETURN to_jsonb(result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_lead_capture_form(_public_token uuid)
RETURNS TABLE(title text, description text, success_message text, organization_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT form.title, form.description, form.success_message,
    coalesce(nullif(org.trade_name,''), org.legal_name) AS organization_name
  FROM public.lead_capture_forms form
  JOIN public.organizations org ON org.id = form.organization_id
  WHERE form.public_token = _public_token
    AND form.is_active
    AND org.archived_at IS NULL
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.submit_public_lead(
  _public_token uuid,
  _name text,
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _company text DEFAULT NULL,
  _message text DEFAULT NULL,
  _source text DEFAULT 'link',
  _website text DEFAULT NULL,
  _consent boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  form public.lead_capture_forms;
  normalized_email text := nullif(lower(btrim(coalesce(_email,''))), '');
  normalized_phone text := nullif(regexp_replace(coalesce(_phone,''), '[^0-9]', '', 'g'), '');
  normalized_company text := nullif(btrim(coalesce(_company,'')), '');
  normalized_message text := nullif(btrim(coalesce(_message,'')), '');
  normalized_source text := left(coalesce(nullif(btrim(_source),''),'link'), 80);
  fingerprint text;
  selected_owner uuid;
  selected_owner_name text;
  client_id_result uuid;
  opportunity_id_result uuid;
  submission_id_result uuid;
BEGIN
  -- Honeypot: answer successfully without storing automated submissions.
  IF nullif(btrim(coalesce(_website,'')), '') IS NOT NULL THEN
    RETURN jsonb_build_object('received', true);
  END IF;

  SELECT * INTO form
  FROM public.lead_capture_forms
  WHERE public_token = _public_token AND is_active
  FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.organizations org
    WHERE org.id = form.organization_id AND org.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'LEAD_FORM_NOT_AVAILABLE'; END IF;

  IF length(btrim(coalesce(_name,''))) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'INVALID_LEAD_NAME'; END IF;
  IF NOT coalesce(_consent, false) THEN RAISE EXCEPTION 'LEAD_CONSENT_REQUIRED'; END IF;
  IF normalized_email IS NULL AND normalized_phone IS NULL THEN RAISE EXCEPTION 'LEAD_CONTACT_REQUIRED'; END IF;
  IF normalized_email IS NOT NULL AND (length(normalized_email) > 255 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'INVALID_LEAD_EMAIL'; END IF;
  IF normalized_phone IS NOT NULL AND length(normalized_phone) NOT BETWEEN 10 AND 15 THEN RAISE EXCEPTION 'INVALID_LEAD_PHONE'; END IF;
  IF normalized_company IS NOT NULL AND length(normalized_company) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'INVALID_LEAD_COMPANY'; END IF;
  IF normalized_message IS NOT NULL AND length(normalized_message) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'INVALID_LEAD_MESSAGE'; END IF;

  fingerprint := md5(coalesce(normalized_email,'') || '|' || coalesce(normalized_phone,''));
  IF EXISTS (
    SELECT 1 FROM public.lead_capture_submissions submission
    WHERE submission.form_id = form.id
      AND submission.contact_fingerprint = fingerprint
      AND submission.received_at >= now() - interval '2 minutes'
  ) THEN RETURN jsonb_build_object('received', true); END IF;
  IF (SELECT count(*) FROM public.lead_capture_submissions submission
      WHERE submission.form_id = form.id AND submission.received_at >= now() - interval '10 minutes') >= 20
    THEN RAISE EXCEPTION 'LEAD_FORM_RATE_LIMIT';
  END IF;

  SELECT member.user_id, coalesce(profile.full_name, profile.email)
  INTO selected_owner, selected_owner_name
  FROM public.organization_members member
  LEFT JOIN public.profiles profile ON profile.id = member.user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS open_count
    FROM public.commercial_opportunities opportunity
    WHERE opportunity.organization_id = form.organization_id
      AND opportunity.owner_id = member.user_id
      AND opportunity.archived_at IS NULL
      AND opportunity.stage NOT IN ('won','lost')
  ) load ON true
  WHERE member.organization_id = form.organization_id
    AND member.is_active
    AND member.role IN ('proprietario','administrador','gestor','operacional')
  ORDER BY load.open_count, member.created_at, member.user_id
  LIMIT 1;
  IF selected_owner IS NULL THEN RAISE EXCEPTION 'LEAD_FORM_WITHOUT_OWNER'; END IF;

  SELECT client.id INTO client_id_result
  FROM public.clients client
  WHERE client.organization_id = form.organization_id
    AND client.archived_at IS NULL
    AND ((normalized_email IS NOT NULL AND lower(client.email) = normalized_email)
      OR (normalized_phone IS NOT NULL AND (client.phone = normalized_phone OR client.whatsapp = normalized_phone)))
  ORDER BY client.created_at
  LIMIT 1;

  IF client_id_result IS NULL THEN
    INSERT INTO public.clients(
      organization_id, person_type, name, trade_name, email, phone, whatsapp,
      status, owner_id, owner_name, notes, last_interaction_at, created_by, updated_by
    ) VALUES (
      form.organization_id, (CASE WHEN normalized_company IS NULL THEN 'pf' ELSE 'pj' END)::public.person_type,
      btrim(_name), normalized_company, normalized_email, normalized_phone, normalized_phone,
      'lead', selected_owner, selected_owner_name,
      concat_ws(E'\n', 'Origem: formulário público (' || normalized_source || ')', normalized_message),
      now(), selected_owner, selected_owner
    ) RETURNING id INTO client_id_result;
  ELSE
    UPDATE public.clients SET last_interaction_at = now(), updated_at = now(), updated_by = selected_owner
    WHERE id = client_id_result;
  END IF;

  INSERT INTO public.commercial_opportunities(
    organization_id, client_id, title, stage, estimated_value, probability,
    owner_id, next_action_at, created_by, updated_by
  ) VALUES (
    form.organization_id, client_id_result,
    left('Novo contato — ' || btrim(_name), 180), 'first_contact', 0, 10,
    selected_owner, now() + interval '1 day', selected_owner, selected_owner
  ) RETURNING id INTO opportunity_id_result;

  INSERT INTO public.commercial_opportunity_stage_history(
    organization_id, opportunity_id, from_stage, to_stage, changed_by
  ) VALUES (form.organization_id, opportunity_id_result, NULL, 'first_contact', selected_owner);

  INSERT INTO public.lead_capture_submissions(
    organization_id, form_id, client_id, opportunity_id, name, email, phone,
    company, message, source, contact_fingerprint, consent_at
  ) VALUES (
    form.organization_id, form.id, client_id_result, opportunity_id_result, btrim(_name),
    normalized_email, normalized_phone, normalized_company, normalized_message,
    normalized_source, fingerprint, now()
  ) RETURNING id INTO submission_id_result;

  INSERT INTO public.notifications(organization_id, user_id, title, body, kind, action_url, dedupe_key)
  SELECT form.organization_id, recipient.user_id, 'Novo lead recebido',
    btrim(_name) || ' enviou os dados pelo formulário público.', 'info',
    '/relatorios?tipo=commercial', 'public-lead:' || submission_id_result::text || ':' || recipient.user_id::text
  FROM (
    SELECT selected_owner AS user_id
    UNION
    SELECT member.user_id FROM public.organization_members member
    WHERE member.organization_id = form.organization_id AND member.is_active
      AND member.role IN ('proprietario','administrador','gestor')
  ) recipient
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs(organization_id, actor_id, actor_name, action, entity, entity_id, metadata)
  VALUES (form.organization_id, NULL, 'Formulário público', 'lead.captured', 'lead_capture_submission', submission_id_result,
    jsonb_build_object('client_id', client_id_result, 'opportunity_id', opportunity_id_result, 'source', normalized_source));

  RETURN jsonb_build_object('received', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_lead_capture_form(uuid,text,text,text,boolean,boolean),
  public.get_public_lead_capture_form(uuid),
  public.submit_public_lead(uuid,text,text,text,text,text,text,text,boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lead_capture_form(uuid,text,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_lead_capture_form(uuid),
  public.submit_public_lead(uuid,text,text,text,text,text,text,text,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_lead_capture_form(uuid,text,text,text,boolean,boolean),
  public.get_public_lead_capture_form(uuid),
  public.submit_public_lead(uuid,text,text,text,text,text,text,text,boolean) TO service_role;
