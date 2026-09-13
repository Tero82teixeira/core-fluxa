/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const asaasPhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  const national = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11 ? national : undefined;
};
const encoder = new TextEncoder();
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function encryptionKey() {
  const configured = Deno.env.get("ASAAS_CREDENTIALS_ENCRYPTION_KEY") ?? "";
  if (configured.length < 32) throw new Error("ASAAS_ENCRYPTION_KEY_MISSING");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(configured));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(ciphertext: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}
function safeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}
const apiBase = (environment: string) =>
  environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
async function asaas(apiKey: string, environment: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase(environment)}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "user-agent": "FLUXA recurring billing",
      access_token: apiKey,
      ...(init.headers ?? {}),
    },
  });
  const payload = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    const errors = Array.isArray(payload.errors) ? payload.errors.map(record) : [];
    throw new Error(`ASAAS_${text(errors[0]?.code) ?? `HTTP_${response.status}`}`.slice(0, 140));
  }
  return payload;
}

type Service = ReturnType<typeof createClient>;
type Job = { job_id: string; organization_id: string; transaction_id: string };
type PushDelivery = {
  notification_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  title: string;
  body: string;
  action_url: string;
};

async function processJob(service: Service, job: Job) {
  const [{ data: connection }, { data: secret }, { data: transaction }] = await Promise.all([
    service
      .from("asaas_connections")
      .select("*")
      .eq("organization_id", job.organization_id)
      .eq("status", "connected")
      .maybeSingle(),
    service
      .from("asaas_connection_secrets")
      .select("api_key_ciphertext,api_key_iv")
      .eq("organization_id", job.organization_id)
      .maybeSingle(),
    service
      .from("financial_transactions")
      .select("*")
      .eq("organization_id", job.organization_id)
      .eq("id", job.transaction_id)
      .maybeSingle(),
  ]);
  if (!connection || !secret) throw new Error("ASAAS_NOT_CONNECTED");
  if (
    !transaction ||
    transaction.type !== "income" ||
    !transaction.client_id ||
    transaction.archived_at ||
    ["paid", "cancelled"].includes(transaction.status)
  )
    throw new Error("ASAAS_TRANSACTION_NOT_ELIGIBLE");
  if (transaction.recurrence_id) {
    const { data: recurrence } = await service
      .from("financial_recurrences")
      .select("id,status,asaas_auto_charge,archived_at")
      .eq("organization_id", job.organization_id)
      .eq("id", transaction.recurrence_id)
      .maybeSingle();
    if (
      !recurrence ||
      recurrence.status !== "active" ||
      !recurrence.asaas_auto_charge ||
      recurrence.archived_at
    )
      return;
  } else if (transaction.commercial_proposal_id) {
    const { data: proposal } = await service
      .from("commercial_proposals")
      .select("id,status,asaas_auto_charge,archived_at")
      .eq("organization_id", job.organization_id)
      .eq("id", transaction.commercial_proposal_id)
      .maybeSingle();
    if (!proposal || proposal.status !== "accepted" || !proposal.asaas_auto_charge || proposal.archived_at)
      return;
  } else return;
  const { data: existingRows } = await service
    .from("asaas_charges")
    .select("id,status")
    .eq("organization_id", job.organization_id)
    .eq("transaction_id", job.transaction_id)
    .limit(5);
  if (
    (existingRows ?? []).some(
      (item) => !["refunded", "chargeback", "cancelled", "failed"].includes(item.status),
    )
  )
    return;

  const [{ data: payments }, { data: client }] = await Promise.all([
    service
      .from("financial_transaction_payments")
      .select("amount,reversed_at")
      .eq("transaction_id", transaction.id),
    service
      .from("clients")
      .select("id,name,document_digits,email,phone,whatsapp")
      .eq("organization_id", job.organization_id)
      .eq("id", transaction.client_id)
      .maybeSingle(),
  ]);
  if (!client?.document_digits) throw new Error("ASAAS_CLIENT_DOCUMENT_REQUIRED");
  const paid = (payments ?? [])
    .filter((item) => !item.reversed_at)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const remaining = Math.round((Number(transaction.amount) - paid) * 100) / 100;
  if (remaining <= 0) throw new Error("ASAAS_TRANSACTION_ALREADY_PAID");
  const apiKey = await decrypt(secret.api_key_ciphertext, secret.api_key_iv);

  let { data: link } = await service
    .from("asaas_customers")
    .select("*")
    .eq("organization_id", job.organization_id)
    .eq("client_id", client.id)
    .maybeSingle();
  if (!link) {
    const found = await asaas(
      apiKey,
      connection.environment,
      `/customers?externalReference=${encodeURIComponent(client.id)}&limit=1`,
    );
    const foundCustomer = Array.isArray(found.data) ? record(found.data[0]) : {};
    const providerCustomer = text(foundCustomer.id)
      ? foundCustomer
      : await asaas(apiKey, connection.environment, "/customers", {
          method: "POST",
          body: JSON.stringify({
            name: client.name,
            cpfCnpj: client.document_digits,
            email: client.email || undefined,
            mobilePhone: asaasPhone(client.whatsapp || client.phone),
            externalReference: client.id,
          }),
        });
    const { data: savedLink, error } = await service
      .from("asaas_customers")
      .upsert(
        {
          organization_id: job.organization_id,
          client_id: client.id,
          provider_customer_id: providerCustomer.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,client_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    link = savedLink;
  }

  const foundPayments = await asaas(
    apiKey,
    connection.environment,
    `/payments?externalReference=${encodeURIComponent(transaction.id)}&limit=1`,
  );
  const foundPayment = Array.isArray(foundPayments.data) ? record(foundPayments.data[0]) : {};
  const providerPayment = text(foundPayment.id)
    ? foundPayment
    : await asaas(apiKey, connection.environment, "/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: link.provider_customer_id,
          billingType: "UNDEFINED",
          value: remaining,
          dueDate: transaction.due_date,
          description: String(transaction.description).slice(0, 500),
          externalReference: transaction.id,
        }),
      });
  const providerStatus = String(providerPayment.status ?? "PENDING").toUpperCase();
  const status =
    providerStatus === "RECEIVED"
      ? "received"
      : providerStatus === "CONFIRMED"
        ? "confirmed"
        : providerStatus === "OVERDUE"
          ? "overdue"
          : "pending";
  const { error: chargeError } = await service.from("asaas_charges").upsert(
    {
      organization_id: job.organization_id,
      connection_id: connection.id,
      transaction_id: transaction.id,
      client_id: client.id,
      provider_payment_id: providerPayment.id,
      provider_customer_id: link.provider_customer_id,
      status,
      billing_type: providerPayment.billingType ?? "UNDEFINED",
      amount: Number(providerPayment.value ?? remaining),
      net_value: providerPayment.netValue == null ? null : Number(providerPayment.netValue),
      due_date: providerPayment.dueDate ?? transaction.due_date,
      invoice_url: providerPayment.invoiceUrl,
      bank_slip_url: providerPayment.bankSlipUrl ?? null,
      last_event_type: "PAYMENT_CREATED_AUTOMATICALLY",
      last_event_at: new Date().toISOString(),
      created_by: transaction.created_by,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider_payment_id" },
  );
  if (chargeError || !providerPayment.invoiceUrl)
    throw chargeError ?? new Error("ASAAS_INVOICE_URL_MISSING");
  if (["received", "confirmed", "overdue", "refunded", "chargeback"].includes(status)) {
    const eventType =
      status === "received"
        ? "PAYMENT_RECEIVED"
        : status === "confirmed"
          ? "PAYMENT_CONFIRMED"
          : status === "overdue"
            ? "PAYMENT_OVERDUE"
            : status === "refunded"
              ? "PAYMENT_REFUNDED"
              : "PAYMENT_CHARGEBACK_REQUESTED";
    const paidAtValue = text(providerPayment.paymentDate) ?? text(providerPayment.confirmedDate);
    const { error: reconciliationError } = await service.rpc("apply_asaas_payment_event", {
      _connection_token: connection.public_token,
      _event_id: `automation-recovery-${providerPayment.id}-${providerStatus}`,
      _event_type: eventType,
      _provider_payment_id: providerPayment.id,
      _provider_status: providerStatus,
      _paid_at: paidAtValue ? new Date(`${paidAtValue}T12:00:00Z`).toISOString() : null,
      _amount: Number(providerPayment.value ?? remaining),
    });
    if (reconciliationError) throw new Error("ASAAS_RECONCILIATION_FAILED");
  }
}

async function sendReminderPushes(service: Service) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!publicKey || !privateKey || !subject) return { claimed: 0, delivered: 0 };
  const { data, error } = await service.rpc("claim_asaas_reminder_push_deliveries", {
    _limit: 100,
  });
  if (error) throw error;
  const deliveries = (data ?? []) as PushDelivery[];
  webpush.setVapidDetails(subject, publicKey, privateKey);
  let delivered = 0;
  for (const item of deliveries) {
    try {
      await webpush.sendNotification(
        { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth_key } },
        JSON.stringify({
          title: item.title,
          body: item.body,
          url: item.action_url,
          tag: `asaas-reminder-${item.notification_id}`,
        }),
        { TTL: 3600, urgency: "normal" },
      );
      delivered += 1;
    } catch (error) {
      const status =
        typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      console.warn(
        JSON.stringify({ source: "asaas-billing-automation", code: "PUSH_FAILED", status }),
      );
    }
  }
  return { claimed: deliveries.length, delivered };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "";
    const apiKey = request.headers.get("apikey")?.trim() ?? "";
    const automationKey = Deno.env.get("ASAAS_BILLING_AUTOMATION_KEY")?.trim() ?? "";
    const suppliedAutomationKey = request.headers.get("x-fluxa-automation-key")?.trim() ?? "";
    if (!url || !serviceKey) return json({ error: "SERVER_NOT_CONFIGURED" }, 503);
    const authorized =
      (Boolean(token) && safeEqual(token, serviceKey)) ||
      (Boolean(apiKey) && safeEqual(apiKey, serviceKey)) ||
      (Boolean(automationKey) &&
        Boolean(suppliedAutomationKey) &&
        safeEqual(suppliedAutomationKey, automationKey));
    if (!authorized) return json({ error: "NOT_ALLOWED" }, 403);
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await service.rpc("claim_asaas_charge_jobs", { _limit: 25 });
    if (error) return json({ error: "JOB_CLAIM_FAILED" }, 500);
    let succeeded = 0;
    let failed = 0;
    for (const job of (data ?? []) as Job[]) {
      try {
        await processJob(service, job);
        await service.rpc("complete_asaas_charge_job", {
          _job_id: job.job_id,
          _succeeded: true,
          _error_code: null,
        });
        succeeded += 1;
      } catch (error) {
        const code =
          error instanceof Error ? error.message.split(" ")[0].slice(0, 140) : "AUTOMATION_FAILED";
        console.error(
          JSON.stringify({ source: "asaas-billing-automation", job: job.job_id, code }),
        );
        await service.rpc("complete_asaas_charge_job", {
          _job_id: job.job_id,
          _succeeded: false,
          _error_code: code,
        });
        failed += 1;
      }
    }
    const pushes = await sendReminderPushes(service).catch((error) => {
      console.warn(
        JSON.stringify({
          source: "asaas-billing-automation",
          code: error instanceof Error ? error.message.split(" ")[0] : "PUSH_BATCH_FAILED",
        }),
      );
      return { claimed: 0, delivered: 0 };
    });
    return json({ claimed: (data ?? []).length, succeeded, failed, pushes });
  },
};
