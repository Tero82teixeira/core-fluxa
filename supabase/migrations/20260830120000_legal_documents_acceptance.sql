CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms_of_use', 'privacy_policy')),
  document_version text NOT NULL,
  acceptance_source text NOT NULL CHECK (acceptance_source IN ('company_signup', 'invitation')),
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT legal_acceptances_user_document_version_key
    UNIQUE (user_id, document_type, document_version)
);

CREATE INDEX legal_acceptances_user_accepted_idx
  ON public.legal_acceptances(user_id, accepted_at DESC);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_acceptances_select_own
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

CREATE OR REPLACE FUNCTION public.record_signup_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source text := NEW.raw_user_meta_data->>'legal_acceptance_source';
  v_terms_version text := NEW.raw_user_meta_data->>'legal_terms_version';
  v_privacy_version text := NEW.raw_user_meta_data->>'legal_privacy_version';
BEGIN
  IF COALESCE((NEW.raw_user_meta_data->>'legal_accepted')::boolean, false)
     AND v_source IN ('company_signup', 'invitation')
     AND v_terms_version = '2026-08-30'
     AND v_privacy_version = '2026-08-30' THEN
    INSERT INTO public.legal_acceptances(
      user_id, document_type, document_version, acceptance_source
    ) VALUES
      (NEW.id, 'terms_of_use', v_terms_version, v_source),
      (NEW.id, 'privacy_policy', v_privacy_version, v_source)
    ON CONFLICT (user_id, document_type, document_version) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_signup_legal_acceptance() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_record_legal_acceptance
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.record_signup_legal_acceptance();

COMMENT ON TABLE public.legal_acceptances IS
  'Registro imutável da versão dos documentos jurídicos aceita ou reconhecida no cadastro.';
COMMENT ON COLUMN public.legal_acceptances.acceptance_source IS
  'Fluxo em que ocorreu o aceite: cadastro de empresa ou cadastro por convite.';
