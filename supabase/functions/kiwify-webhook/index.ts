/* global Deno */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@1";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { asRecord, extractKiwifyOrder, type JsonRecord } from "./payload.ts";

const ACTIVE_EVENTS = new Set(["order_approved", "paid", "subscription_renewed"]);
const PAST_DUE_EVENTS = new Set([
  "subscription_late",
  "subscription_delayed",
  "subscription_overdue",
]);
const CANCELED_EVENTS = new Set(["subscription_canceled", "subscription_cancelled"]);
const REFUNDED_EVENTS = new Set(["order_refunded", "refunded"]);
const CHARGEBACK_EVENTS = new Set(["order_chargedback", "chargeback"]);

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function reject(code: string, status: number): Response {
  console.warn(JSON.stringify({ source: "kiwify-webhook", code, status }));
  return json({ error: code }, status);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function secureEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function validUuid(value: string | null): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

function eventStatus(eventType: string): string | null {
  if (ACTIVE_EVENTS.has(eventType)) return "active";
  if (PAST_DUE_EVENTS.has(eventType)) return "past_due";
  if (CANCELED_EVENTS.has(eventType)) return "canceled";
  if (REFUNDED_EVENTS.has(eventType)) return "refunded";
  if (CHARGEBACK_EVENTS.has(eventType)) return "chargeback";
  return null;
}

function trackingOrganization(payload: JsonRecord): string | null {
  const candidates = [
    asRecord(payload.TrackingParameters),
    asRecord(payload.tracking_parameters),
    asRecord(payload.trackingParameters),
    asRecord(payload.Tracking),
  ];
  for (const candidate of candidates) {
    const organizationId = text(candidate.s1);
    if (organizationId) return organizationId;
  }
  return text(payload.s1);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  fetch: withSupabase({ auth: "none" }, async (request: Request) => {
    if (request.method !== "POST") return reject("METHOD_NOT_ALLOWED", 405);

    const webhookSecret = Deno.env.get("KIWIFY_WEBHOOK_SECRET") ?? "";
    const expectedProductId = Deno.env.get("KIWIFY_PRODUCT_ID") ?? "";
    const suppliedSecret = new URL(request.url).searchParams.get("token") ?? "";
    if (!webhookSecret || !secureEquals(suppliedSecret, webhookSecret)) {
      return reject("UNAUTHORIZED", 401);
    }
    if (!expectedProductId) return reject("PRODUCT_NOT_CONFIGURED", 503);

    const rawBody = await request.text();
    let envelope: JsonRecord;
    try {
      envelope = asRecord(JSON.parse(rawBody));
    } catch {
      return reject("INVALID_JSON", 400);
    }
    const payload = extractKiwifyOrder(envelope);

    const product = asRecord(payload.Product);
    const customer = asRecord(payload.Customer);
    const subscription = asRecord(payload.Subscription);
    const customerAccess = asRecord(subscription.customer_access);
    const productId = text(product.product_id) ?? text(payload.product_id);
    if (!productId || !secureEquals(productId, expectedProductId)) {
      return reject("PRODUCT_MISMATCH", 403);
    }

    const eventType = (
      text(payload.webhook_event_type) ??
      text(payload.event_type) ??
      text(payload.type) ??
      text(payload.order_status) ??
      "unknown"
    ).toLowerCase();
    const subscriptionStatus = eventStatus(eventType);
    if (!subscriptionStatus) return json({ ok: true, ignored: eventType });

    const organizationId = trackingOrganization(payload);
    if (!validUuid(organizationId)) {
      return reject("ORGANIZATION_TRACKING_REQUIRED", 422);
    }

    const customerEmail = text(customer.email)?.toLowerCase() ?? null;
    const orderId = text(payload.order_id);
    const subscriptionId = text(subscription.id) ?? text(payload.subscription_id);
    const accessUntil =
      text(customerAccess.access_until) ??
      text(subscription.access_until) ??
      text(payload.access_until);
    const nextPaymentAt =
      text(subscription.next_payment) ??
      text(payload.next_payment) ??
      text(payload.next_payment_at);
    const updatedAt = text(payload.updated_at) ?? text(subscription.updated_at);
    const parsedDate = updatedAt ? new Date(updatedAt) : new Date();
    const eventAt = Number.isNaN(parsedDate.getTime())
      ? new Date().toISOString()
      : parsedDate.toISOString();
    const eventKey =
      text(payload.event_id) ??
      `${orderId ?? subscriptionId ?? "event"}:${eventType}:${await sha256(rawBody)}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return reject("SERVER_NOT_CONFIGURED", 503);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: prepared, error: preparedError } = await supabase
      .from("organization_subscriptions")
      .select("organization_id, billing_email")
      .eq("organization_id", organizationId)
      .eq("provider", "kiwify")
      .maybeSingle();

    if (preparedError) return reject("PREPARED_CHECK_FAILED", 500);
    if (!prepared) return reject("CHECKOUT_NOT_PREPARED", 422);
    if (!customerEmail || customerEmail !== prepared.billing_email) {
      return reject("BILLING_EMAIL_MISMATCH", 422);
    }

    const { data: applied, error } = await supabase.rpc("apply_kiwify_subscription_event", {
      _event_key: eventKey,
      _organization: organizationId,
      _event_type: eventType,
      _subscription_status: subscriptionStatus,
      _provider_order_id: orderId,
      _provider_subscription_id: subscriptionId,
      _event_at: eventAt,
      _access_until: accessUntil,
      _next_payment_at: nextPaymentAt,
    });

    if (error) {
      console.error("Falha ao aplicar evento Kiwify", error.message);
      return reject("EVENT_PROCESSING_FAILED", 500);
    }

    return json({ ok: true, applied: Boolean(applied) });
  }),
};
