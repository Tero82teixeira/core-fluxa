/* global Deno */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type PreparedMessage = {
  connection_id: string;
  organization_id: string;
  thread_id: string;
  channel: "whatsapp" | "email";
  provider: "meta_cloud_api" | "resend";
  sender_identifier: string;
  sender_name: string;
  recipient: string;
  subject: string;
  content: string;
};

function errorCode(value: unknown) {
  if (value && typeof value === "object" && "message" in value) {
    return String(value.message).split(" ")[0].slice(0, 120);
  }
  return "CHANNEL_DELIVERY_FAILED";
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
    }
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400);
    }
    if (!uuid(body.threadId) || typeof body.content !== "string" || !body.content.trim()) {
      return json({ error: "INVALID_REQUEST" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anonKey || !serviceRoleKey) return json({ error: "CHANNEL_NOT_CONFIGURED" }, 503);

    const token = authorization.slice(7).trim();
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: identityError } = await authClient.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);

    const service = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const content = body.content.trim().slice(0, 5000);
    const { data, error } = await service.rpc("prepare_communication_channel_send", {
      _thread_id: body.threadId,
      _content: content,
      _actor_id: identity.user.id,
    });
    if (error || !data) {
      const code = errorCode(error);
      return json({ error: code }, code.includes("NOT_FOUND") ? 404 : 403);
    }
    const prepared = data as PreparedMessage;
    let providerMessageId = "";
    let deliveryError = "";

    try {
      if (prepared.channel === "whatsapp") {
        const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") ?? "";
        const graphVersion = Deno.env.get("META_GRAPH_VERSION") ?? "";
        if (!accessToken || !graphVersion) throw new Error("WHATSAPP_SECRETS_MISSING");
        const response = await fetch(
          `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(prepared.sender_identifier)}/messages`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: prepared.recipient,
              type: "text",
              text: { preview_url: false, body: prepared.content },
            }),
          },
        );
        const result = (await response.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string }>;
        };
        if (!response.ok || !result.messages?.[0]?.id)
          throw new Error(`WHATSAPP_${response.status}`);
        providerMessageId = result.messages[0].id ?? "";
      } else {
        const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
        if (!resendKey) throw new Error("RESEND_API_KEY_MISSING");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: `${prepared.sender_name} <${prepared.sender_identifier}>`,
            to: [prepared.recipient],
            subject: prepared.subject,
            text: prepared.content,
            tags: [
              { name: "organization", value: prepared.organization_id },
              { name: "thread", value: prepared.thread_id },
            ],
          }),
        });
        const result = (await response.json().catch(() => ({}))) as { id?: string };
        if (!response.ok || !result.id) throw new Error(`RESEND_${response.status}`);
        providerMessageId = result.id;
      }
    } catch (error) {
      deliveryError = errorCode(error);
    }

    const { error: completionError } = await service.rpc("complete_communication_channel_send", {
      _connection_id: prepared.connection_id,
      _thread_id: prepared.thread_id,
      _actor_id: identity.user.id,
      _content: prepared.content,
      _provider_message_id: providerMessageId,
      _status: deliveryError ? "failed" : "sent",
      _error_code: deliveryError || null,
    });
    if (completionError) return json({ error: "CHANNEL_AUDIT_FAILED" }, 500);
    if (deliveryError) return json({ error: deliveryError }, 502);
    return json({ sent: true, providerMessageId });
  },
};
