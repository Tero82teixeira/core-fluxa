/* global Deno */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==="string"&&value.trim()?value.trim():null;
const encoder=new TextEncoder();
function bytesToBase64(bytes:Uint8Array){let binary="";bytes.forEach((byte)=>binary+=String.fromCharCode(byte));return btoa(binary);}
function base64ToBytes(value:string){const binary=atob(value);return Uint8Array.from(binary,(character)=>character.charCodeAt(0));}
async function encryptionKey(){const configured=Deno.env.get("ASAAS_CREDENTIALS_ENCRYPTION_KEY")??"";if(configured.length<32)throw new Error("ASAAS_ENCRYPTION_KEY_MISSING");const digest=await crypto.subtle.digest("SHA-256",encoder.encode(configured));return crypto.subtle.importKey("raw",digest,"AES-GCM",false,["encrypt","decrypt"]);}
async function encrypt(value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(),encoder.encode(value));return{ciphertext:bytesToBase64(new Uint8Array(encrypted)),iv:bytesToBase64(iv)};}
async function decrypt(ciphertext:string,iv:string){const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(iv)},await encryptionKey(),base64ToBytes(ciphertext));return new TextDecoder().decode(decrypted);}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",encoder.encode(value));return[...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,"0")).join("");}
const apiBase=(environment:string)=>environment==="production"?"https://api.asaas.com/v3":"https://api-sandbox.asaas.com/v3";
async function asaas(apiKey:string,environment:string,path:string,init:RequestInit={}){const response=await fetch(`${apiBase(environment)}${path}`,{...init,headers:{"content-type":"application/json","user-agent":"FLUXA tenant billing",access_token:apiKey,...(init.headers??{})}});const payload=record(await response.json().catch(()=>({})));if(!response.ok){const errors=Array.isArray(payload.errors)?payload.errors.map(record):[];throw new Error(`ASAAS_${text(errors[0]?.code)??`HTTP_${response.status}`}`.slice(0,140));}return payload;}
type Service=ReturnType<typeof createClient>;
async function authorize(service:Service,organizationId:string,userId:string,roles:string[]){const{data}=await service.from("organization_members").select("role,is_active").eq("organization_id",organizationId).eq("user_id",userId).eq("is_active",true).maybeSingle();if(!data||!roles.includes(String(data.role)))throw new Error("NOT_ALLOWED");}
async function credential(service:Service,organizationId:string){const[{data:connection},{data:secret}]=await Promise.all([service.from("asaas_connections").select("*").eq("organization_id",organizationId).eq("status","connected").maybeSingle(),service.from("asaas_connection_secrets").select("api_key_ciphertext,api_key_iv").eq("organization_id",organizationId).maybeSingle()]);if(!connection||!secret)throw new Error("ASAAS_NOT_CONNECTED");return{connection,apiKey:await decrypt(secret.api_key_ciphertext,secret.api_key_iv)};}
const financeRoles=["superadmin","proprietario","administrador","gestor","financeiro"];

export default{async fetch(request:Request):Promise<Response>{
  if(request.method==="OPTIONS")return new Response(null,{headers:cors});
  if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  const authorization=request.headers.get("authorization")??"";
  if(!authorization.toLowerCase().startsWith("bearer "))return json({error:"AUTHENTICATION_REQUIRED"},401);
  let body:Record<string,unknown>;try{body=record(await request.json());}catch{return json({error:"INVALID_JSON"},400);}
  const action=text(body.action)??"";if(!uuid(body.organizationId))return json({error:"ORGANIZATION_REQUIRED"},400);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")??"",anonKey=Deno.env.get("SUPABASE_ANON_KEY")??"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!supabaseUrl||!anonKey||!serviceKey)return json({error:"SERVER_NOT_CONFIGURED"},503);
  const token=authorization.slice(7).trim();
  const auth=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const{data:identity,error:identityError}=await auth.auth.getUser(token);
  if(identityError||!identity.user)return json({error:"AUTHENTICATION_REQUIRED"},401);
  const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    if(action==="connect"){
      await authorize(service,body.organizationId,identity.user.id,["superadmin","proprietario","administrador"]);
      const environment=body.environment==="production"?"production":"sandbox",apiKey=text(body.apiKey);
      if(!apiKey||!uuid(body.settlementAccountId))throw new Error("ASAAS_CONNECTION_FIELDS_REQUIRED");
      const expectedPrefix=environment==="production"?"$aact_prod_":"$aact_hmlg_";
      if(!apiKey.startsWith(expectedPrefix))throw new Error("ASAAS_KEY_ENVIRONMENT_MISMATCH");
      const{data:account}=await service.from("financial_accounts").select("id").eq("id",body.settlementAccountId).eq("organization_id",body.organizationId).eq("is_active",true).is("archived_at",null).maybeSingle();
      if(!account)throw new Error("ASAAS_SETTLEMENT_ACCOUNT_NOT_AVAILABLE");
      const profile=await asaas(apiKey,environment,"/myAccount");
      const{data:current}=await service.from("asaas_connections").select("*").eq("organization_id",body.organizationId).maybeSingle();
      const publicToken=current?.public_token??crypto.randomUUID(),webhookToken=`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-","");
      const{data:organization}=await service.from("organizations").select("email,legal_name,trade_name").eq("id",body.organizationId).single();
      const webhookBody={name:"FLUXA - pagamentos",url:`${supabaseUrl}/functions/v1/asaas-webhook?connection=${publicToken}`,email:organization?.email||identity.user.email,enabled:true,interrupted:false,apiVersion:3,authToken:webhookToken,sendType:"SEQUENTIALLY",events:["PAYMENT_CONFIRMED","PAYMENT_RECEIVED","PAYMENT_OVERDUE","PAYMENT_REFUNDED","PAYMENT_CHARGEBACK_REQUESTED","PAYMENT_DELETED"]};
      let webhook:Record<string,unknown>;
      if(current?.webhook_id){try{webhook=await asaas(apiKey,environment,`/webhooks/${encodeURIComponent(current.webhook_id)}`,{method:"PUT",body:JSON.stringify(webhookBody)});}catch{webhook=await asaas(apiKey,environment,"/webhooks",{method:"POST",body:JSON.stringify(webhookBody)});}}
      else webhook=await asaas(apiKey,environment,"/webhooks",{method:"POST",body:JSON.stringify(webhookBody)});
      const encrypted=await encrypt(apiKey),now=new Date().toISOString();
      if(current){const{error}=await service.from("asaas_connections").update({status:"disconnected",updated_at:now}).eq("id",current.id);if(error)throw error;}
      const{error:secretError}=await service.from("asaas_connection_secrets").upsert({organization_id:body.organizationId,api_key_ciphertext:encrypted.ciphertext,api_key_iv:encrypted.iv,updated_at:now});if(secretError)throw secretError;
      const{data:saved,error:saveError}=await service.from("asaas_connections").upsert({organization_id:body.organizationId,public_token:publicToken,environment,status:"connected",account_id:text(profile.id),account_name:text(profile.name)??organization?.trade_name??organization?.legal_name??"Conta Asaas",settlement_account_id:body.settlementAccountId,webhook_id:text(webhook.id),webhook_token_hash:await sha256(webhookToken),last_checked_at:now,last_error_code:null,created_by:current?.created_by??identity.user.id,updated_by:identity.user.id,updated_at:now},{onConflict:"organization_id"}).select("id,organization_id,environment,status,account_name,last_checked_at,settlement_account_id").single();if(saveError)throw saveError;
      await service.from("audit_logs").insert({organization_id:body.organizationId,actor_id:identity.user.id,action:"asaas.connection.saved",entity:"asaas_connection",entity_id:current?.id??saved.id,metadata:{environment}});return json({connection:saved});
    }
    if(action==="disconnect"){
      await authorize(service,body.organizationId,identity.user.id,["superadmin","proprietario","administrador"]);const{connection,apiKey}=await credential(service,body.organizationId);
      if(connection.webhook_id)await asaas(apiKey,connection.environment,`/webhooks/${encodeURIComponent(connection.webhook_id)}`,{method:"DELETE"}).catch(()=>({}));
      const{error}=await service.from("asaas_connections").update({status:"disconnected",webhook_id:null,webhook_token_hash:null,updated_by:identity.user.id,updated_at:new Date().toISOString()}).eq("organization_id",body.organizationId);if(error)throw error;
      await service.from("asaas_connection_secrets").delete().eq("organization_id",body.organizationId);return json({disconnected:true});
    }
    if(action==="create_charge"){
      await authorize(service,body.organizationId,identity.user.id,financeRoles);if(!uuid(body.transactionId))throw new Error("TRANSACTION_REQUIRED");const{connection,apiKey}=await credential(service,body.organizationId);
      const{data:existingRows}=await service.from("asaas_charges").select("*").eq("organization_id",body.organizationId).eq("transaction_id",body.transactionId).order("created_at",{ascending:false}).limit(5);const existing=existingRows?.find((item)=>!["refunded","chargeback","cancelled","failed"].includes(item.status));if(existing)return json({charge:existing,reused:true});
      const[{data:transaction},{data:payments}]=await Promise.all([service.from("financial_transactions").select("*").eq("id",body.transactionId).eq("organization_id",body.organizationId).maybeSingle(),service.from("financial_transaction_payments").select("amount,reversed_at").eq("transaction_id",body.transactionId)]);
      if(!transaction||transaction.type!=="income"||!transaction.client_id||transaction.archived_at||["paid","cancelled"].includes(transaction.status))throw new Error("ASAAS_TRANSACTION_NOT_ELIGIBLE");
      const paid=(payments??[]).filter((item)=>!item.reversed_at).reduce((sum,item)=>sum+Number(item.amount),0),remaining=Math.round((Number(transaction.amount)-paid)*100)/100;if(remaining<=0)throw new Error("ASAAS_TRANSACTION_ALREADY_PAID");
      const{data:client}=await service.from("clients").select("id,name,document_digits,email,phone,whatsapp").eq("id",transaction.client_id).eq("organization_id",body.organizationId).maybeSingle();if(!client?.document_digits)throw new Error("ASAAS_CLIENT_DOCUMENT_REQUIRED");
      let{data:link}=await service.from("asaas_customers").select("*").eq("organization_id",body.organizationId).eq("client_id",client.id).maybeSingle();
      if(!link){const found=await asaas(apiKey,connection.environment,`/customers?externalReference=${encodeURIComponent(client.id)}&limit=1`),foundCustomer=Array.isArray(found.data)?record(found.data[0]):{};const providerCustomer=text(foundCustomer.id)?foundCustomer:await asaas(apiKey,connection.environment,"/customers",{method:"POST",body:JSON.stringify({name:client.name,cpfCnpj:client.document_digits,email:client.email||undefined,mobilePhone:client.whatsapp||client.phone||undefined,externalReference:client.id})});const{data:savedLink,error}=await service.from("asaas_customers").upsert({organization_id:body.organizationId,client_id:client.id,provider_customer_id:providerCustomer.id,updated_at:new Date().toISOString()},{onConflict:"organization_id,client_id"}).select("*").single();if(error)throw error;link=savedLink;}
      const foundPayments=await asaas(apiKey,connection.environment,`/payments?externalReference=${encodeURIComponent(transaction.id)}&limit=1`),foundPayment=Array.isArray(foundPayments.data)?record(foundPayments.data[0]):{};const providerPayment=text(foundPayment.id)?foundPayment:await asaas(apiKey,connection.environment,"/payments",{method:"POST",body:JSON.stringify({customer:link.provider_customer_id,billingType:"UNDEFINED",value:remaining,dueDate:transaction.due_date,description:String(transaction.description).slice(0,500),externalReference:transaction.id})});
      const providerStatus=String(providerPayment.status??"PENDING").toUpperCase(),status=providerStatus==="RECEIVED"?"received":providerStatus==="CONFIRMED"?"confirmed":providerStatus==="OVERDUE"?"overdue":"pending";
      const{data:charge,error}=await service.from("asaas_charges").upsert({organization_id:body.organizationId,connection_id:connection.id,transaction_id:transaction.id,client_id:client.id,provider_payment_id:providerPayment.id,provider_customer_id:link.provider_customer_id,status,billing_type:providerPayment.billingType??"UNDEFINED",amount:Number(providerPayment.value??remaining),net_value:providerPayment.netValue==null?null:Number(providerPayment.netValue),due_date:providerPayment.dueDate??transaction.due_date,invoice_url:providerPayment.invoiceUrl,bank_slip_url:providerPayment.bankSlipUrl??null,last_event_type:"PAYMENT_CREATED",last_event_at:new Date().toISOString(),created_by:identity.user.id,updated_at:new Date().toISOString()},{onConflict:"organization_id,provider_payment_id"}).select("*").single();if(error||!charge?.invoice_url)throw error??new Error("ASAAS_INVOICE_URL_MISSING");
      if(status==="received"){const{error:reconciliationError}=await service.rpc("apply_asaas_payment_event",{_connection_token:connection.public_token,_event_id:`connector-recovery-${providerPayment.id}`,_event_type:"PAYMENT_RECEIVED",_provider_payment_id:providerPayment.id,_provider_status:providerStatus,_paid_at:null,_amount:Number(providerPayment.value??remaining)});if(reconciliationError)throw new Error("ASAAS_RECONCILIATION_FAILED");}
      await service.from("audit_logs").insert({organization_id:body.organizationId,actor_id:identity.user.id,action:"asaas.charge.created",entity:"asaas_charge",entity_id:charge.id,metadata:{transaction_id:transaction.id,amount:remaining}});return json({charge});
    }
    if(action==="sync_charge"){
      await authorize(service,body.organizationId,identity.user.id,financeRoles);if(!uuid(body.chargeId))throw new Error("CHARGE_REQUIRED");const{connection,apiKey}=await credential(service,body.organizationId);
      const{data:charge}=await service.from("asaas_charges").select("*").eq("id",body.chargeId).eq("organization_id",body.organizationId).maybeSingle();if(!charge)throw new Error("ASAAS_CHARGE_NOT_FOUND");
      const providerPayment=await asaas(apiKey,connection.environment,`/payments/${encodeURIComponent(charge.provider_payment_id)}`),providerStatus=String(providerPayment.status??"PENDING").toUpperCase();
      const eventType=providerStatus==="RECEIVED"?"PAYMENT_RECEIVED":providerStatus==="CONFIRMED"?"PAYMENT_CONFIRMED":providerStatus==="OVERDUE"?"PAYMENT_OVERDUE":providerStatus==="REFUNDED"?"PAYMENT_REFUNDED":providerStatus.includes("CHARGEBACK")?"PAYMENT_CHARGEBACK_REQUESTED":"PAYMENT_SYNC";
      const paidAtValue=text(providerPayment.paymentDate)??text(providerPayment.confirmedDate),paidAt=paidAtValue?new Date(`${paidAtValue}T12:00:00Z`).toISOString():null;
      const{error:syncError}=await service.rpc("apply_asaas_payment_event",{_connection_token:connection.public_token,_event_id:`manual-sync-${charge.provider_payment_id}-${providerStatus}`,_event_type:eventType,_provider_payment_id:charge.provider_payment_id,_provider_status:providerStatus,_paid_at:paidAt,_amount:Number(providerPayment.value??charge.amount)});if(syncError)throw new Error("ASAAS_RECONCILIATION_FAILED");
      await service.from("asaas_connections").update({last_checked_at:new Date().toISOString(),last_error_code:null,updated_by:identity.user.id,updated_at:new Date().toISOString()}).eq("id",connection.id);
      const{data:synced}=await service.from("asaas_charges").select("*").eq("id",charge.id).single();return json({charge:synced});
    }
    if(action==="retry_charge_job"){
      await authorize(service,body.organizationId,identity.user.id,financeRoles);if(!uuid(body.jobId))throw new Error("ASAAS_JOB_REQUIRED");const now=new Date().toISOString();
      const{data:job,error}=await service.from("asaas_charge_jobs").update({status:"pending",attempts:0,next_attempt_at:now,completed_at:null,last_error_code:null,updated_at:now}).eq("id",body.jobId).eq("organization_id",body.organizationId).eq("status","failed").select("id").maybeSingle();if(error)throw error;if(!job)throw new Error("ASAAS_JOB_NOT_RETRYABLE");
      await service.from("audit_logs").insert({organization_id:body.organizationId,actor_id:identity.user.id,action:"asaas.charge.retry_requested",entity:"asaas_charge_job",entity_id:job.id,metadata:{}});return json({job});
    }
    if(action==="cancel_charge"){
      await authorize(service,body.organizationId,identity.user.id,financeRoles);if(!uuid(body.chargeId))throw new Error("CHARGE_REQUIRED");const{connection,apiKey}=await credential(service,body.organizationId);const{data:charge}=await service.from("asaas_charges").select("id,provider_payment_id,status").eq("id",body.chargeId).eq("organization_id",body.organizationId).maybeSingle();if(!charge)throw new Error("ASAAS_CHARGE_NOT_FOUND");if(!["pending","confirmed","overdue"].includes(charge.status))throw new Error("ASAAS_CHARGE_NOT_CANCELLABLE");
      await asaas(apiKey,connection.environment,`/payments/${encodeURIComponent(charge.provider_payment_id)}`,{method:"DELETE"});const{error}=await service.from("asaas_charges").update({status:"cancelled",last_event_type:"PAYMENT_DELETED_BY_USER",last_event_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",charge.id).eq("organization_id",body.organizationId);if(error)throw error;await service.from("audit_logs").insert({organization_id:body.organizationId,actor_id:identity.user.id,action:"asaas.charge.cancelled",entity:"asaas_charge",entity_id:charge.id,metadata:{}});return json({cancelled:true});
    }
    return json({error:"ACTION_NOT_SUPPORTED"},404);
  }catch(error){const code=error instanceof Error?error.message.split(" ")[0].slice(0,140):"ASAAS_OPERATION_FAILED";console.error(JSON.stringify({source:"asaas-connector",action,code}));return json({error:code},code==="NOT_ALLOWED"?403:code.includes("REQUIRED")||code.includes("ELIGIBLE")?422:502);}
}};
