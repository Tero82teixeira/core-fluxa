/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";

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

type Delivery = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  title: string;
  body: string;
  action_url: string;
};
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.toLowerCase().startsWith("bearer "))
      return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400);
    }
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "";
    if (!publicKey || !privateKey || !subject) return json({ error: "PUSH_NOT_CONFIGURED" }, 503);
    if (body.mode === "public-key") return json({ publicKey });
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anonKey || !serviceRoleKey) return json({ error: "PUSH_NOT_CONFIGURED" }, 503);
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice(7).trim();
    const { data: identity, error: identityError } = await authClient.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const serviceClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let rpc: "prepare_communication_push" | "prepare_push_test";
    let args: Record<string, string>;
    if (body.mode === "dispatch" && uuid(body.threadId)) {
      rpc = "prepare_communication_push";
      args = { _thread_id: body.threadId, _actor_id: identity.user.id };
    } else if (body.mode === "test" && uuid(body.organizationId)) {
      rpc = "prepare_push_test";
      args = { _organization_id: body.organizationId, _actor_id: identity.user.id };
    } else return json({ error: "INVALID_REQUEST" }, 400);
    const { data, error } = await serviceClient.rpc(rpc, args);
    if (error) {
      console.warn(
        JSON.stringify({ source: "communication-push", code: error.message.split(" ")[0] }),
      );
      return json({ error: "PUSH_CONTEXT_DENIED" }, 403);
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    let delivered = 0;
    for (const item of (data ?? []) as Delivery[]) {
      try {
        await webpush.sendNotification(
          { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth_key } },
          JSON.stringify({
            title: item.title,
            body: item.body,
            url: item.action_url,
            tag: `communication-${item.subscription_id}`,
          }),
          { TTL: 300, urgency: "high" },
        );
        delivered += 1;
      } catch (error) {
        const status =
          typeof error === "object" && error && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
        console.warn(
          JSON.stringify({ source: "communication-push", code: "DELIVERY_FAILED", status }),
        );
      }
    }
    return json({ delivered });
  },
};
