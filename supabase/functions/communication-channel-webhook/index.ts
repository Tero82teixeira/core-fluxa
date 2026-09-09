/* global Deno */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const encoder = new TextEncoder();

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

async function verifyMeta(raw: string, signature: string, secret: string) {
  if (!signature.startsWith("sha256=") || !secret) return false;
  return safeEqual(signature, `sha256=${await hmacHex(secret, raw)}`);
}

function decodeBase64(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyResend(raw: string, request: Request, secret: string) {
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signatures = (request.headers.get("svix-signature") ?? "").split(" ");
  const seconds = Number(timestamp);
  if (!id || !Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const keyBytes = secret.startsWith("whsec_")
    ? decodeBase64(secret.slice(6))
    : encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${raw}`)),
  );
  const expected = btoa(String.fromCharCode(...signed));
  return signatures.some((signature) => {
    const value = signature.includes(",") ? signature.split(",")[1] : signature;
    return Boolean(value) && safeEqual(value, expected);
  });
}

function textFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function ingest(service: ReturnType<typeof createClient>, values: Record<string, unknown>) {
  const { error } = await service.rpc("ingest_communication_channel_message", values);
  if (error) throw new Error(error.message);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    const provider = requestUrl.searchParams.get("provider") ?? "";

    if (request.method === "GET" && provider === "whatsapp") {
      const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") ?? "";
      const mode = requestUrl.searchParams.get("hub.mode");
      const token = requestUrl.searchParams.get("hub.verify_token");
      const challenge = requestUrl.searchParams.get("hub.challenge");
      if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
        return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
      }
      return json({ error: "WEBHOOK_VERIFICATION_DENIED" }, 403);
    }
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceRoleKey) return json({ error: "WEBHOOK_NOT_CONFIGURED" }, 503);
    const service = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const raw = await request.text();

    try {
      if (provider === "whatsapp") {
        const valid = await verifyMeta(
          raw,
          request.headers.get("x-hub-signature-256") ?? "",
          Deno.env.get("META_WHATSAPP_APP_SECRET") ?? "",
        );
        if (!valid) return json({ error: "INVALID_SIGNATURE" }, 401);
        const payload = asObject(JSON.parse(raw));
        const entries = Array.isArray(payload?.entry) ? payload?.entry : [];
        for (const entry of entries) {
          const changes = Array.isArray(asObject(entry)?.changes)
            ? (asObject(entry)?.changes as unknown[])
            : [];
          for (const change of changes) {
            const value = asObject(asObject(change)?.value);
            const metadata = asObject(value?.metadata);
            const messages = Array.isArray(value?.messages) ? value.messages : [];
            for (const message of messages) {
              const item = asObject(message);
              const text = asObject(item?.text)?.body;
              if (typeof item?.id !== "string" || typeof text !== "string" || !text.trim())
                continue;
              await ingest(service, {
                _provider: "meta_cloud_api",
                _channel: "whatsapp",
                _sender_identifier: String(metadata?.phone_number_id ?? ""),
                _external_message_id: String(item?.id ?? ""),
                _external_sender: String(item?.from ?? ""),
                _external_recipient: String(metadata?.display_phone_number ?? ""),
                _subject: "Conversa pelo WhatsApp",
                _content: text.slice(0, 10000),
                _occurred_at: item?.timestamp
                  ? new Date(Number(item.timestamp) * 1000).toISOString()
                  : new Date().toISOString(),
              });
            }
          }
        }
      } else if (provider === "resend") {
        const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
        if (!secret || !(await verifyResend(raw, request, secret))) {
          return json({ error: "INVALID_SIGNATURE" }, 401);
        }
        const event = asObject(JSON.parse(raw));
        const eventData = asObject(event?.data);
        if (event?.type === "email.received" && typeof eventData?.email_id === "string") {
          const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
          const response = await fetch(
            `https://api.resend.com/emails/receiving/${encodeURIComponent(eventData.email_id)}`,
            { headers: { authorization: `Bearer ${apiKey}` } },
          );
          if (!response.ok) throw new Error(`RESEND_RECEIVING_${response.status}`);
          const email = asObject(await response.json()) ?? {};
          const recipients = Array.isArray(email.to) ? email.to : [];
          const recipient = String(recipients[0] ?? "")
            .replace(/^.*<([^>]+)>.*$/, "$1")
            .trim()
            .toLowerCase();
          const content =
            typeof email.text === "string" && email.text.trim()
              ? email.text
              : typeof email.html === "string"
                ? textFromHtml(email.html)
                : "";
          if (content) {
            await ingest(service, {
              _provider: "resend",
              _channel: "email",
              _sender_identifier: recipient,
              _external_message_id: String(email.message_id ?? email.id ?? eventData.email_id),
              _external_sender: String(email.from ?? eventData.from ?? ""),
              _external_recipient: recipient,
              _subject: String(email.subject ?? eventData.subject ?? "Conversa por e-mail").slice(
                0,
                240,
              ),
              _content: content.slice(0, 10000),
              _occurred_at: String(
                email.created_at ?? event.created_at ?? new Date().toISOString(),
              ),
            });
          }
        }
      } else return json({ error: "PROVIDER_NOT_SUPPORTED" }, 404);
    } catch (error) {
      console.error(
        JSON.stringify({
          source: "communication-channel-webhook",
          code: String(error).slice(0, 160),
        }),
      );
      return json({ error: "WEBHOOK_PROCESSING_FAILED" }, 500);
    }
    return json({ received: true });
  },
};
