import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 8_192;
const headers = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  Vary: "Origin",
});
const response = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
})[character]!);

Deno.serve(async (request) => {
  const appUrlValue = Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "";
  let appUrl: URL;
  try {
    appUrl = new URL(appUrlValue);
    const explicitLocal = Deno.env.get("ALLOW_LOCALHOST_INVITES") === "true";
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname);
    if (appUrl.protocol !== "https:" && !(explicitLocal && isLocal && appUrl.protocol === "http:")) throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: "INVITATION_URL_NOT_CONFIGURED" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const requestOrigin = request.headers.get("Origin") ?? "";
  const allowedOrigin = appUrl.origin;
  if (requestOrigin && requestOrigin !== allowedOrigin) {
    return new Response(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }), { status: 403, headers: { "Content-Type": "application/json", Vary: "Origin" } });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(allowedOrigin) });
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405, allowedOrigin);
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return response({ error: "INVALID_CONTENT_TYPE" }, 415, allowedOrigin);
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return response({ error: "PAYLOAD_TOO_LARGE" }, 413, allowedOrigin);

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return response({ error: "PAYLOAD_TOO_LARGE" }, 413, allowedOrigin);
    const authorization = request.headers.get("Authorization");
    if (!authorization) return response({ error: "NOT_AUTHENTICATED" }, 401, allowedOrigin);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return response({ error: "NOT_AUTHENTICATED" }, 401, allowedOrigin);
    const { organizationId, email, role } = JSON.parse(rawBody);
    if (!organizationId || typeof email !== "string" || typeof role !== "string") return response({ error: "INVALID_PAYLOAD" }, 400, allowedOrigin);
    const { data, error } = await client.rpc("create_invitation", { _org: organizationId, _email: email, _role: role });
    if (error) {
      const forbidden = error.message.includes("NOT_ALLOWED");
      return response({ error: forbidden ? "NOT_ALLOWED" : "INVITATION_NOT_CREATED" }, forbidden ? 403 : 400, allowedOrigin);
    }
    const invitation = Array.isArray(data) ? data[0] : data;
    const invitationUrl = new URL(`/convite/${encodeURIComponent(invitation.token)}`, appUrl).toString();
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("INVITATION_FROM_EMAIL");
    let emailSent = false;
    if (resendKey && from) {
      const send = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: "Convite para a FLUXA", html: `<p>Você recebeu um convite para colaborar na FLUXA.</p><p><a href="${escapeHtml(invitationUrl)}">Aceitar convite</a></p><p>O link expira em 7 dias.</p>` }),
      });
      emailSent = send.ok;
    }
    return response({ invitation_id: invitation.invitation_id, expires_at: invitation.expires_at, invitation_url: invitationUrl, email_sent: emailSent, message: emailSent ? "Convite enviado." : "Convite criado. Configure o serviço de e-mail para envio automático." }, 200, allowedOrigin);
  } catch {
    return response({ error: "INTERNAL_ERROR" }, 500, allowedOrigin);
  }
});
