import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ROLE, type AppRole } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/convite/$token")({ ssr: false, component: InvitationPage });
type Preview = { organization_name: string; email: string; role: AppRole; status: string; expires_at: string };
function InvitationPage() {
  const { token } = Route.useParams(); const navigate = useNavigate();
  const [preview,setPreview]=useState<Preview|null>(null); const [loading,setLoading]=useState(true); const [name,setName]=useState(""); const [password,setPassword]=useState(""); const [confirm,setConfirm]=useState(""); const [session,setSession]=useState(false);
  useEffect(()=>{ Promise.all([supabase.rpc("invitation_preview",{_token:token}),supabase.auth.getSession()]).then(([p,s])=>{setPreview(((p.data as Preview[]|null)?.[0])??null);setSession(Boolean(s.data.session));setLoading(false);});},[token]);
  async function accept(){ setLoading(true); try { const current=await supabase.auth.getUser(); if (!current.data.user) { if(password.length<6||password!==confirm) throw new Error("Confira a senha (mínimo de 6 caracteres)."); const signed=await supabase.auth.signUp({email:preview!.email,password,options:{data:{full_name:name}}}); if(signed.error) throw signed.error; if(!signed.data.session){toast.info("Confirme seu e-mail e retorne a este convite.");return;} } const result=await supabase.rpc("accept_invitation",{_token:token}); if(result.error) throw result.error; toast.success("Convite aceito. Bem-vindo à equipe!"); await navigate({to:"/central",replace:true}); } catch(e){toast.error(e instanceof Error?e.message:"Não foi possível aceitar o convite.");} finally{setLoading(false);} }
  if(loading&&!preview)return <div className="grid min-h-dvh place-items-center"><Loader2 className="animate-spin"/></div>;
  const invalid=!preview||preview.status!=="pending"||new Date(preview.expires_at)<new Date();
  return <main className="grid min-h-dvh place-items-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="space-y-5 p-6"><div className="flex items-center gap-2 text-brand"><Building2/><span className="font-display font-semibold">FLUXA</span></div>{invalid?<><h1 className="page-title">Convite indisponível</h1><p className="text-sm text-muted-foreground">Este convite não existe, expirou, foi cancelado ou já foi utilizado.</p><Button asChild variant="outline"><Link to="/entrar">Ir para o login</Link></Button></>:<><div><h1 className="page-title">Entre para {preview.organization_name}</h1><p className="page-subtitle">Convite para {preview.email} como {ROLE[preview.role].label}.</p></div>{!session&&<><div><Label htmlFor="name">Nome</Label><Input id="name" required value={name} onChange={e=>setName(e.target.value)}/></div><div><Label htmlFor="password">Senha</Label><Input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></div><div><Label htmlFor="confirm">Confirmar senha</Label><Input id="confirm" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div></>}<Button className="w-full" disabled={loading||(!session&&!name.trim())} onClick={accept}>{loading&&<Loader2 className="animate-spin"/>}{session?"Aceitar convite":"Criar conta e aceitar"}</Button>{!session&&<p className="text-center text-sm text-muted-foreground">Já tem conta? <Link to="/entrar" className="text-brand underline">Entre e volte pelo link</Link>.</p>}</>}</CardContent></Card></main>;
}
