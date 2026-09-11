-- Cobranças Asaas pertencentes a cada organização. O FLUXA não armazena cartão
-- e não mistura saldos entre empresas.

CREATE UNIQUE INDEX financial_accounts_org_id_asaas_uq
  ON public.financial_accounts(organization_id,id);
CREATE UNIQUE INDEX financial_transactions_org_id_asaas_uq
  ON public.financial_transactions(organization_id,id);
CREATE UNIQUE INDEX financial_payments_org_id_asaas_uq
  ON public.financial_transaction_payments(organization_id,id);
CREATE UNIQUE INDEX clients_org_id_asaas_uq ON public.clients(organization_id,id);

CREATE TABLE public.asaas_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','error','disconnected')),
  account_id text,
  account_name text,
  settlement_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  webhook_id text,
  webhook_token_hash text,
  last_checked_at timestamptz,
  last_error_code text,
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,settlement_account_id)
    REFERENCES public.financial_accounts(organization_id,id)
);
CREATE UNIQUE INDEX asaas_connections_org_id_uq
  ON public.asaas_connections(organization_id,id);

-- Somente ciphertext. A chave AES-GCM fica no secret da Edge Function.
CREATE TABLE public.asaas_connection_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_key_ciphertext text NOT NULL,
  api_key_iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.asaas_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,client_id),
  UNIQUE (organization_id,provider_customer_id),
  FOREIGN KEY (organization_id,client_id) REFERENCES public.clients(organization_id,id)
);

CREATE TABLE public.asaas_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.asaas_connections(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  provider_payment_id text NOT NULL,
  provider_customer_id text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'pending','confirmed','received','overdue','refunded','chargeback','cancelled','failed'
  )),
  billing_type text NOT NULL DEFAULT 'UNDEFINED',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  net_value numeric(14,2),
  due_date date NOT NULL,
  invoice_url text NOT NULL,
  bank_slip_url text,
  financial_payment_id uuid REFERENCES public.financial_transaction_payments(id),
  paid_at timestamptz,
  last_event_type text,
  last_event_at timestamptz,
  failure_code text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,provider_payment_id),
  FOREIGN KEY (organization_id,connection_id)
    REFERENCES public.asaas_connections(organization_id,id),
  FOREIGN KEY (organization_id,transaction_id)
    REFERENCES public.financial_transactions(organization_id,id),
  FOREIGN KEY (organization_id,client_id) REFERENCES public.clients(organization_id,id),
  FOREIGN KEY (organization_id,financial_payment_id)
    REFERENCES public.financial_transaction_payments(organization_id,id)
);
CREATE UNIQUE INDEX asaas_one_open_charge_per_transaction
  ON public.asaas_charges(transaction_id)
  WHERE status NOT IN ('refunded','chargeback','cancelled','failed');
CREATE INDEX asaas_charges_org_status_due_idx
  ON public.asaas_charges(organization_id,status,due_date DESC);
CREATE INDEX asaas_charges_client_idx
  ON public.asaas_charges(organization_id,client_id,created_at DESC);

CREATE TABLE public.asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_type text NOT NULL,
  provider_payment_id text,
  diagnostic_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (organization_id,event_id)
);

ALTER TABLE public.asaas_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY asaas_connections_read ON public.asaas_connections
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','financeiro']::public.app_role[]));
CREATE POLICY asaas_charges_read ON public.asaas_charges
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id,ARRAY['superadmin','proprietario','administrador','gestor','financeiro','visualizador']::public.app_role[]));

REVOKE ALL ON TABLE public.asaas_connections, public.asaas_connection_secrets,
  public.asaas_customers, public.asaas_charges, public.asaas_webhook_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.asaas_connections, public.asaas_charges TO authenticated;
GRANT ALL ON TABLE public.asaas_connections, public.asaas_connection_secrets,
  public.asaas_customers, public.asaas_charges, public.asaas_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.client_portal_asaas_charges()
RETURNS TABLE(
  charge_id uuid, organization_id uuid, client_id uuid, organization_name text,
  description text, amount numeric, status text, billing_type text, due_date date,
  invoice_url text, paid_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
  SELECT charge.id,charge.organization_id,charge.client_id,
    coalesce(nullif(org.trade_name,''),org.legal_name),transaction.description,
    charge.amount,charge.status,charge.billing_type,charge.due_date,charge.invoice_url,charge.paid_at
  FROM public.asaas_charges charge
  JOIN public.financial_transactions transaction ON transaction.id=charge.transaction_id
  JOIN public.organizations org ON org.id=charge.organization_id
  JOIN public.client_portal_access access
    ON access.organization_id=charge.organization_id AND access.client_id=charge.client_id
  WHERE access.user_id=auth.uid() AND access.is_active AND org.archived_at IS NULL
  ORDER BY charge.due_date DESC,charge.created_at DESC
$function$;

CREATE OR REPLACE FUNCTION public.apply_asaas_payment_event(
  _connection_token uuid, _event_id text, _event_type text,
  _provider_payment_id text, _provider_status text,
  _paid_at timestamptz DEFAULT NULL, _amount numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  connection public.asaas_connections;
  charge public.asaas_charges;
  transaction public.financial_transactions;
  account public.financial_accounts;
  payment public.financial_transaction_payments;
  paid_total numeric; applied_amount numeric; new_balance numeric; normalized_status text;
BEGIN
  SELECT * INTO connection FROM public.asaas_connections
  WHERE public_token=_connection_token AND status='connected' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASAAS_CONNECTION_NOT_FOUND'; END IF;

  INSERT INTO public.asaas_webhook_events(organization_id,event_id,event_type,provider_payment_id)
  VALUES(connection.organization_id,_event_id,_event_type,_provider_payment_id)
  ON CONFLICT(organization_id,event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate',true); END IF;

  SELECT * INTO charge FROM public.asaas_charges
  WHERE organization_id=connection.organization_id AND provider_payment_id=_provider_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.asaas_webhook_events SET diagnostic_code='CHARGE_NOT_FOUND',processed_at=now()
    WHERE organization_id=connection.organization_id AND event_id=_event_id;
    RETURN jsonb_build_object('ignored',true);
  END IF;

  normalized_status := CASE
    WHEN _event_type='PAYMENT_RECEIVED' THEN 'received'
    WHEN _event_type='PAYMENT_CONFIRMED' THEN 'confirmed'
    WHEN _event_type='PAYMENT_OVERDUE' THEN 'overdue'
    WHEN _event_type='PAYMENT_REFUNDED' THEN 'refunded'
    WHEN _event_type LIKE 'PAYMENT_CHARGEBACK%' THEN 'chargeback'
    WHEN _event_type='PAYMENT_DELETED' THEN 'cancelled'
    ELSE coalesce(nullif(lower(_provider_status),''),charge.status)
  END;
  UPDATE public.asaas_charges SET status=normalized_status,
    paid_at=CASE WHEN normalized_status='received' THEN coalesce(_paid_at,now()) ELSE paid_at END,
    last_event_type=_event_type,last_event_at=now(),updated_at=now()
  WHERE id=charge.id RETURNING * INTO charge;

  IF normalized_status='received' AND charge.financial_payment_id IS NULL THEN
    SELECT * INTO transaction FROM public.financial_transactions
    WHERE id=charge.transaction_id AND organization_id=connection.organization_id FOR UPDATE;
    SELECT coalesce(sum(amount),0) INTO paid_total FROM public.financial_transaction_payments
    WHERE transaction_id=transaction.id AND reversed_at IS NULL;
    applied_amount := least(greatest(transaction.amount-paid_total,0),coalesce(_amount,charge.amount));
    IF applied_amount > 0 THEN
      SELECT * INTO account FROM public.financial_accounts
      WHERE id=connection.settlement_account_id AND organization_id=connection.organization_id
        AND is_active AND archived_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ASAAS_SETTLEMENT_ACCOUNT_NOT_AVAILABLE'; END IF;
      new_balance := account.current_balance+applied_amount;
      UPDATE public.financial_accounts SET current_balance=new_balance WHERE id=account.id;
      INSERT INTO public.financial_transaction_payments(
        organization_id,transaction_id,amount,paid_at,payment_method,account_id,notes,created_by
      ) VALUES(connection.organization_id,transaction.id,applied_amount,coalesce(_paid_at,now()),
        'Asaas',account.id,'Confirmação automática do Asaas',charge.created_by) RETURNING * INTO payment;
      INSERT INTO public.financial_account_movements(
        organization_id,account_id,transaction_id,payment_id,type,amount,balance_after,description,created_by
      ) VALUES(connection.organization_id,account.id,transaction.id,payment.id,'income',applied_amount,
        new_balance,'Pagamento Asaas: '||transaction.description,charge.created_by);
      paid_total := paid_total+applied_amount;
      UPDATE public.financial_transactions SET
        status=CASE WHEN paid_total>=amount THEN 'paid' ELSE 'partial' END,
        paid_at=CASE WHEN paid_total>=amount THEN coalesce(_paid_at,now()) ELSE NULL END,
        payment_method='Asaas',account_id=account.id,updated_at=now() WHERE id=transaction.id;
      UPDATE public.asaas_charges SET financial_payment_id=payment.id WHERE id=charge.id;
    END IF;
  ELSIF normalized_status IN ('refunded','chargeback') AND charge.financial_payment_id IS NOT NULL THEN
    SELECT * INTO payment FROM public.financial_transaction_payments
    WHERE id=charge.financial_payment_id AND reversed_at IS NULL FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO transaction FROM public.financial_transactions WHERE id=payment.transaction_id FOR UPDATE;
      SELECT * INTO account FROM public.financial_accounts WHERE id=payment.account_id FOR UPDATE;
      new_balance := account.current_balance-payment.amount;
      UPDATE public.financial_accounts SET current_balance=new_balance WHERE id=account.id;
      UPDATE public.financial_transaction_payments SET reversed_at=now(),
        reversal_notes='Estorno automático informado pelo Asaas' WHERE id=payment.id;
      INSERT INTO public.financial_account_movements(
        organization_id,account_id,transaction_id,payment_id,type,amount,balance_after,description,created_by
      ) VALUES(connection.organization_id,account.id,transaction.id,payment.id,'reversal',payment.amount,
        new_balance,'Estorno Asaas: '||transaction.description,charge.created_by);
      SELECT coalesce(sum(amount),0) INTO paid_total FROM public.financial_transaction_payments
      WHERE transaction_id=transaction.id AND reversed_at IS NULL;
      UPDATE public.financial_transactions SET
        status=CASE WHEN paid_total=0 THEN 'pending' ELSE 'partial' END,paid_at=NULL,updated_at=now()
      WHERE id=transaction.id;
    END IF;
  ELSIF normalized_status='overdue' THEN
    UPDATE public.financial_transactions SET status='overdue',updated_at=now()
    WHERE id=charge.transaction_id AND status IN ('pending','partial');
  END IF;

  IF normalized_status IN ('received','overdue','refunded','chargeback') THEN
    INSERT INTO public.notifications(organization_id,user_id,title,body,kind,action_url,dedupe_key)
    SELECT connection.organization_id,member.user_id,
      CASE normalized_status WHEN 'received' THEN 'Pagamento recebido pelo Asaas'
        WHEN 'overdue' THEN 'Cobrança Asaas vencida' ELSE 'Pagamento Asaas estornado' END,
      CASE normalized_status WHEN 'received' THEN 'Uma cobrança foi conciliada automaticamente.'
        WHEN 'overdue' THEN 'Uma cobrança precisa de acompanhamento.'
        ELSE 'Um recebimento foi revertido e o financeiro foi atualizado.' END,
      CASE WHEN normalized_status='received' THEN 'success' ELSE 'warning' END,
      '/financeiro','asaas:'||_event_id||':'||member.user_id
    FROM public.organization_members member
    WHERE member.organization_id=connection.organization_id AND member.is_active
      AND member.role IN ('proprietario','administrador','gestor','financeiro')
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.asaas_webhook_events SET processed_at=now()
  WHERE organization_id=connection.organization_id AND event_id=_event_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,actor_name,action,entity,entity_id,metadata)
  VALUES(connection.organization_id,NULL,'Asaas','asaas.payment.'||normalized_status,
    'asaas_charge',charge.id,jsonb_build_object('event_type',_event_type,'provider_payment_id',_provider_payment_id));
  RETURN jsonb_build_object('processed',true,'status',normalized_status);
END;
$function$;

-- Bloqueia baixa/edição manual enquanto o link ainda pode receber pagamento.
CREATE OR REPLACE FUNCTION public.guard_asaas_financial_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE transaction_key uuid;
BEGIN
  -- service_role applies provider webhooks; user sessions always have auth.uid().
  IF coalesce(auth.role(),'') = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='financial_transactions' THEN
    IF EXISTS(SELECT 1 FROM public.asaas_charges
      WHERE transaction_id=OLD.id AND status IN ('pending','confirmed','overdue')) THEN
      RAISE EXCEPTION 'ACTIVE_ASAAS_CHARGE';
    END IF;
  ELSIF TG_TABLE_NAME='financial_transaction_payments' THEN
    transaction_key := CASE WHEN TG_OP='INSERT' THEN NEW.transaction_id ELSE OLD.transaction_id END;
    IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.asaas_charges
      WHERE financial_payment_id=OLD.id) THEN RAISE EXCEPTION 'ASAAS_PAYMENT_MANAGED_AUTOMATICALLY'; END IF;
    IF EXISTS(SELECT 1 FROM public.asaas_charges
      WHERE transaction_id=transaction_key AND status IN ('pending','confirmed','overdue')) THEN
      RAISE EXCEPTION 'ACTIVE_ASAAS_CHARGE';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER guard_active_asaas_transaction
  BEFORE UPDATE ON public.financial_transactions FOR EACH ROW
  EXECUTE FUNCTION public.guard_asaas_financial_mutation();
CREATE TRIGGER guard_active_asaas_payment
  BEFORE INSERT OR UPDATE ON public.financial_transaction_payments FOR EACH ROW
  EXECUTE FUNCTION public.guard_asaas_financial_mutation();

REVOKE ALL ON FUNCTION public.client_portal_asaas_charges() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.client_portal_asaas_charges() TO authenticated;
REVOKE ALL ON FUNCTION public.apply_asaas_payment_event(uuid,text,text,text,text,timestamptz,numeric)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apply_asaas_payment_event(uuid,text,text,text,text,timestamptz,numeric)
  TO service_role;
REVOKE ALL ON FUNCTION public.guard_asaas_financial_mutation() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_asaas_financial_mutation() TO service_role;
