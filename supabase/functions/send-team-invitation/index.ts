import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "NOT_AUTHENTICATED" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    // The caller's JWT is deliberately forwarded: authorization remains in RLS/RPC.
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return json({ error: "NOT_AUTHENTICATED" }, 401);
    const { organizationId, email, role, origin } = await request.json();
    if (!organizationId || typeof email !== "string" || typeof role !== "string") return json({ error: "INVALID_PAYLOAD" }, 400);
    const { data, error } = await client.rpc("create_invitation", { _org: organizationId, _email: email, _role: role });
    if (error) return json({ error: error.message }, error.message.includes("NOT_ALLOWED") ? 403 : 400);
    const invitation = Array.isArray(data) ? data[0] : data;
    const invitationUrl = `${String(origin || "").replace(/\/$/, "")}/convite/${invitation.token}`;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("INVITATION_FROM_EMAIL");
    let emailSent = false;
    if (resendKey && from) {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [email], subject: "Convite para a FLUXA", html: `<p>Você recebeu um convite para colaborar na FLUXA.</p><p><a href="${invitationUrl}">Aceitar convite</a></p><p>O link expira em 7 dias.</p>` }) });
      emailSent = response.ok;
    }
    return json({ ...invitation, invitation_url: invitationUrl, email_sent: emailSent, message: emailSent ? "Convite enviado." : "Convite criado. Configure o serviço de e-mail para envio automático." });
  } catch { return json({ error: "INTERNAL_ERROR" }, 500); }
});
