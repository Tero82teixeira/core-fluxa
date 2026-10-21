import {proposalFromConsultingDiagnostic,consultingProposalInput} from '../src/lib/consulting-proposal.ts';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.FLUXA_PGLITE_ROOT||'.','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),actor=id(3),viewer=id(4),client=id(5),foreign=id(6),newClient=id(7);
const values={focus:'processes',situation:'Pedidos dispersos em canais diferentes',attempts:'Planilha antiga',expected_result:'Centralizar solicitações',priority:'high',target_on:'2026-11-20'};
const sql=readFileSync('supabase/migrations/20261021142356_consulting_client_diagnostics.sql','utf8');
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
 CREATE TYPE app_role AS ENUM ('superadmin','proprietario','administrador','gestor','operacional','atendimento','visualizador','financeiro','cliente_externo');
 CREATE TABLE organizations(id uuid PRIMARY KEY);
 CREATE TABLE organization_settings(organization_id uuid,business_segment text,enabled_modules jsonb);
 CREATE TABLE organization_members(organization_id uuid,user_id uuid,role app_role,is_active boolean);
 CREATE FUNCTION has_org_role(org uuid,roles app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active AND role=ANY(roles)) $$;
 CREATE TABLE clients(id uuid PRIMARY KEY,organization_id uuid NOT NULL,name text,notes text,archived_at timestamptz,owner_id uuid);
 CREATE TABLE processes(organization_id uuid,client_id uuid,owner_id uuid);
 CREATE TABLE tasks(organization_id uuid,client_id uuid,assignee_id uuid);
 CREATE TABLE audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,metadata jsonb);
 INSERT INTO organizations VALUES('${org}'),('${other}');
 INSERT INTO organization_settings VALUES('${org}','consulting_services','["clients"]'),('${other}','consulting_services','[]');
 INSERT INTO organization_members VALUES('${org}','${actor}','proprietario',true),('${org}','${viewer}','visualizador',true);
 INSERT INTO clients VALUES('${client}','${org}','Cliente','Observação preservada',null,'${actor}'),('${foreign}','${other}','SEGREDO','PRIVADO',null,null),('${newClient}','${org}','Novo cliente',null,null,null);
 `);
 await db.exec(sql);await db.exec(sql);
 await db.exec(`SET test.actor='${actor}';SET ROLE authenticated;`);
 const read=async(c=client,o=org)=>(await db.query('SELECT public.read_consulting_client_diagnostic($1,$2) AS result',[o,c])).rows[0].result;
 const save=async(v=values,r=null,c=client,o=org)=>(await db.query('SELECT public.save_consulting_client_diagnostic($1,$2,$3,$4) AS result',[o,c,JSON.stringify(v),r])).rows[0].result;
 assert.equal(await read(),null);
 const first=await save({...values,situation:'  Pedidos dispersos  ',attempts:'  Planilha  '});assert.equal(first.revision,1);assert.equal(first.situation,'Pedidos dispersos');assert.equal(first.attempts,'Planilha');assert.equal(first.created_by,actor);
 assert.deepEqual(await read(),first);
 const second=await save({...values,target_on:'',attempts:''},1);assert.equal(second.revision,2);assert.equal(second.target_on,null);assert.equal(second.attempts,'');assert.equal(second.created_at,first.created_at);
 await assert.rejects(()=>save(),/STALE/);await assert.rejects(()=>save(values,1),/STALE/);await assert.rejects(()=>save(values,3,newClient),/STALE/);
 assert.equal((await read()).revision,2);
 for(const v of [null,[],{}, {...values,priority:null},{...values,focus:'bad'},{...values,priority:'urgent'},{...values,situation:17},{...values,expected_result:'  '},{...values,situation:'x'.repeat(2001)},{...values,attempts:'x'.repeat(2001)},{...values,expected_result:'x'.repeat(2001)},{...values,target_on:'2026-02-30'},{...values,target_on:'2026-1-01'},{...values,target_on:'2101-01-01'},{...values,target_on:null}]) await assert.rejects(()=>save(v,2),/INVALID/);
 const third=await save({...values,situation:'a'.repeat(2000),attempts:'b'.repeat(2000),expected_result:'c'.repeat(2000),target_on:'2000-01-01'},2);assert.equal(third.revision,3);
 const fourth=await save({...values,target_on:'2100-12-31'},3);assert.equal(fourth.revision,4);
 await assert.rejects(()=>read(foreign),/CLIENT_NOT_FOUND/);await assert.rejects(()=>read(foreign,other),/ACCESS_DENIED/);
 await assert.rejects(()=>save(values,null,foreign),/CLIENT_NOT_FOUND/);await assert.rejects(()=>save(values,null,foreign,other),/ACCESS_DENIED/);
 // Every UI role mirrors the database access contract; inactive memberships are denied.
 for(const [role,canRead,canWrite] of [['superadmin',true,true],['proprietario',true,true],['administrador',true,true],['gestor',true,true],['operacional',true,true],['visualizador',true,false],['atendimento',false,false],['financeiro',false,false],['cliente_externo',false,false]]) {
  await db.exec(`RESET ROLE;UPDATE organization_members SET role='${role}' WHERE user_id='${actor}';SET ROLE authenticated;`);
  if(canRead) assert.equal((await read()).revision>=4,true);else await assert.rejects(()=>read(),/ACCESS_DENIED/);
  if(canWrite) await save(values,(await read()).revision);else await assert.rejects(()=>save(values,4),/ACCESS_DENIED/);
 }
 // Operational users retain the client visibility rules of clients_secure.
 await db.exec(`RESET ROLE;UPDATE organization_members SET role='operacional' WHERE user_id='${actor}';SET ROLE authenticated;`);
 await assert.rejects(()=>read(newClient),/CLIENT_NOT_FOUND/);await assert.rejects(()=>save(values,null,newClient),/CLIENT_NOT_FOUND/);
 for(const relation of ['processes','tasks']){
  const owner=relation==='tasks'?'assignee_id':'owner_id';
  await db.exec(`RESET ROLE;INSERT INTO ${relation}(organization_id,client_id,${owner}) VALUES('${other}','${newClient}','${actor}');SET ROLE authenticated;`);
  await assert.rejects(()=>read(newClient),/CLIENT_NOT_FOUND/);
  await db.exec(`RESET ROLE;DELETE FROM ${relation};INSERT INTO ${relation}(organization_id,client_id,${owner}) VALUES('${org}','${newClient}','${actor}');SET ROLE authenticated;`);
  const current=await read(newClient);await save(values,current?.revision??null,newClient);
  await db.exec(`RESET ROLE;DELETE FROM ${relation};SET ROLE authenticated;`);
  await assert.rejects(()=>read(newClient),/CLIENT_NOT_FOUND/);
 }
 await db.exec(`RESET ROLE;DELETE FROM consulting_client_diagnostics WHERE client_id='${newClient}';SET ROLE authenticated;`);
 await db.exec(`RESET ROLE;UPDATE organization_members SET role='proprietario',is_active=false WHERE user_id='${actor}';SET ROLE authenticated;`);
 await assert.rejects(()=>read(),/ACCESS_DENIED/);await assert.rejects(()=>save(),/ACCESS_DENIED/);
 await db.exec(`RESET ROLE;UPDATE organization_members SET is_active=true WHERE user_id='${actor}';UPDATE organization_settings SET enabled_modules='["processes"]' WHERE organization_id='${org}';SET ROLE authenticated;`);
 await assert.rejects(()=>read(),/ACCESS_DENIED/);await assert.rejects(()=>save(),/ACCESS_DENIED/);
 await db.exec(`RESET ROLE;UPDATE organization_settings SET enabled_modules='[]',business_segment='legal' WHERE organization_id='${org}';SET ROLE authenticated;`);
 await assert.rejects(()=>read(),/ACCESS_DENIED/);
 await db.exec(`RESET ROLE;UPDATE organization_settings SET business_segment='consulting_services' WHERE organization_id='${org}';UPDATE clients SET archived_at=now() WHERE id='${client}';SET ROLE authenticated;`);
 assert((await read()).revision>0);await assert.rejects(()=>save(),/CLIENT_NOT_FOUND/);
 await db.exec(`RESET ROLE;UPDATE clients SET archived_at=null WHERE id='${client}';SET ROLE authenticated;`);
 // Audit failure rolls back the diagnostic as part of the same transaction.
 const prior=await read();
 await db.exec(`RESET ROLE;CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDIT_FAILED';END $$;CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit();SET ROLE authenticated;`);
 await assert.rejects(()=>save({...values,situation:'Não pode persistir'},prior.revision),/AUDIT_FAILED/);assert.deepEqual(await read(),prior);
 await db.exec(`RESET ROLE;DROP TRIGGER reject_audit ON audit_logs;SET ROLE authenticated;`);
 await assert.rejects(()=>db.query('SELECT * FROM consulting_client_diagnostics'),/permission denied/);
 await assert.rejects(()=>db.query('SELECT public.consulting_diagnostic_access($1,false)',[org]),/permission denied/);
 await db.exec(`SET test.actor='';`);await assert.rejects(()=>read(),/ACCESS_DENIED/);
 for(const role of ['anon','service_role']) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE ${role};`);
  await assert.rejects(()=>read(),/permission denied/);await assert.rejects(()=>save(),/permission denied/);
  await assert.rejects(()=>db.query('SELECT * FROM consulting_client_diagnostics'),/permission denied/);
 }
 await db.exec('RESET ROLE;');
 const audits=(await db.query('SELECT * FROM audit_logs')).rows;
 assert(audits.length>0);assert(audits.every(a=>a.action==='consulting.diagnostic.saved'&&Object.keys(a.metadata).join()==='revision'));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM consulting_client_diagnostics')).rows[0].n,1);
 assert.equal((await db.query('SELECT notes FROM clients WHERE id=$1',[client])).rows[0].notes,'Observação preservada');
 // Exercise the existing proposal DDL/RPC rather than a replacement save implementation.
 await db.exec(`ALTER TABLE organizations ADD COLUMN trade_name text,ADD COLUMN legal_name text;
 CREATE TABLE commercial_opportunities(id uuid PRIMARY KEY,organization_id uuid NOT NULL,archived_at timestamptz);
 CREATE TABLE financial_recurrences(id uuid PRIMARY KEY);
 CREATE TABLE financial_transactions(id uuid PRIMARY KEY);
 CREATE FUNCTION is_org_member(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active) $$;`);
 await db.exec(readFileSync('supabase/migrations/20261002120000_commercial_proposals.sql','utf8'));
 await db.exec(`SET ROLE authenticated;`);
 const currentDate=(await db.query('SELECT current_date::text AS today')).rows[0].today;
 const input=consultingProposalInput({...proposalFromConsultingDiagnostic(prior.expected_result,'Proposta revisada'),terms:'Condições e prazo revisados',amount:'1600,25',firstDueDate:currentDate,validUntil:currentDate},{id:client,name:'Cliente'},currentDate);
 const payload={client_id:input.clientId,opportunity_id:input.opportunityId,title:input.title,service_description:input.serviceDescription,terms:input.terms,customer_name:input.customerName,amount:input.amount,billing_frequency:input.billingFrequency,first_due_date:input.firstDueDate,valid_until:input.validUntil,asaas_auto_charge:input.asaasAutoCharge};
 const saveProposal=async(p=payload,proposal=null,o=org)=>(await db.query('SELECT public.save_commercial_proposal($1,$2,$3) AS id',[o,proposal,JSON.stringify(p)])).rows[0].id;
 const proposalId=await saveProposal();
 const stored=(await db.query('SELECT * FROM commercial_proposals WHERE id=$1',[proposalId])).rows[0];
 assert.equal(stored.status,'draft');assert.equal(stored.client_id,client);assert.equal(Number(stored.amount),1600.25);assert.equal(stored.service_description,prior.expected_result);assert.equal(stored.asaas_auto_charge,false);assert.equal(stored.sent_at,null);assert.equal(stored.accepted_at,null);assert.equal(stored.initial_transaction_id,null);assert.equal(stored.opportunity_id,null);assert.equal(stored.customer_document,null);
 assert.equal((await db.query('SELECT * FROM public.get_public_commercial_proposal($1)',[stored.public_token])).rows.length,0);
 await saveProposal({...payload,title:'Título editado'},proposalId);assert.equal((await db.query('SELECT title FROM commercial_proposals WHERE id=$1',[proposalId])).rows[0].title,'Título editado');
 await assert.rejects(()=>saveProposal({...payload,client_id:foreign}),/CLIENT_SCOPE_MISMATCH/);
 await assert.rejects(()=>saveProposal(payload,null,other),/NOT_ALLOWED/);
 await assert.rejects(()=>saveProposal({...payload,amount:0}),/INVALID_PROPOSAL_AMOUNT/);
 await db.exec(`RESET ROLE;UPDATE clients SET archived_at=now() WHERE id='${client}';SET ROLE authenticated;`);
 await assert.rejects(()=>saveProposal(),/CLIENT_SCOPE_MISMATCH/);
 await db.exec(`RESET ROLE;UPDATE clients SET archived_at=null WHERE id='${client}';SET ROLE authenticated;SET test.actor='${viewer}';`);
 await assert.rejects(()=>saveProposal(),/NOT_ALLOWED/);
 await db.exec(`SET test.actor='';`);await assert.rejects(()=>saveProposal(),/AUTH_REQUIRED/);
 await db.exec(`RESET ROLE;SET test.actor='${actor}';`);
 assert.deepEqual((await db.query('SELECT public.read_consulting_client_diagnostic($1,$2) AS result',[org,client])).rows[0].result,prior);
 for(const table of ['financial_transactions','financial_recurrences','commercial_opportunities','processes','tasks'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM clients')).rows[0].n,3);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM commercial_proposals')).rows[0].n,1);
 console.log('Proposta existente: rascunho persistido, editável e inacessível pelo token; sem novos clientes, projeto, tarefas ou financeiro.');
 console.log('Diagnóstico: gravação e auditoria atômicas, revisões, validação, isolamento, módulos e nove papéis verificados.');
} finally { await db.close(); }
