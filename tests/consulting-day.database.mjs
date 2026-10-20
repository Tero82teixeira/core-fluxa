import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.FLUXA_PGLITE_ROOT||'.','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite(),id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),actor=id(3),viewer=id(4),external=id(5),client=id(6),project=id(7),foreign=id(8);
try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
    CREATE TYPE app_role AS ENUM ('superadmin','proprietario','administrador','gestor','operacional','atendimento','visualizador','financeiro','cliente_externo');
    CREATE TABLE organizations(id uuid PRIMARY KEY);
    CREATE TABLE organization_settings(organization_id uuid,business_segment text,enabled_modules jsonb);
    CREATE TABLE organization_members(organization_id uuid,user_id uuid,role app_role,is_active boolean);
    CREATE FUNCTION has_org_role(org uuid,roles app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active AND role=ANY(roles)) $$;
    CREATE TABLE clients(id uuid PRIMARY KEY,organization_id uuid,name text,archived_at timestamptz);
    CREATE TABLE processes(id uuid PRIMARY KEY,organization_id uuid,client_id uuid,code text,title text,stage text,owner_name text,due_date date,archived_at timestamptz);
    CREATE TABLE process_checklist_items(id uuid PRIMARY KEY,organization_id uuid,process_id uuid,title text,status text,due_date date,deleted_at timestamptz);
    CREATE TABLE tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,process_id uuid,client_id uuid,title text,description text,status text,priority text,due_at timestamptz,assignee_name text,created_by uuid,updated_by uuid,recurrence_type text,deleted_at timestamptz,archived_at timestamptz);
    CREATE TABLE audit_logs(organization_id uuid,actor_id uuid,action text,entity text,entity_id uuid,metadata jsonb);
    INSERT INTO organizations VALUES('${org}'),('${other}');
    INSERT INTO organization_settings VALUES('${org}','consulting_services','["processes"]'),('${other}','consulting_services','[]');
    INSERT INTO organization_members VALUES('${org}','${actor}','proprietario',true),('${org}','${viewer}','visualizador',true),('${org}','${external}','cliente_externo',true);
    INSERT INTO clients VALUES('${client}','${org}','Empresa A',null),('${id(20)}','${other}','SEGREDO',null);
    INSERT INTO processes VALUES('${project}','${org}','${client}','PRJ-1','Projeto A','montagem','Ana',(now() AT TIME ZONE 'America/Sao_Paulo')::date+7,null),('${foreign}','${other}','${id(20)}','SEGREDO','SEGREDO','novo','Equipe',(now() AT TIME ZONE 'America/Sao_Paulo')::date-1,null);
  `);
  await db.exec(readFileSync('supabase/migrations/20261019161140_consulting_monthly_plans.sql','utf8'));
  const sql=readFileSync('supabase/migrations/20261020215124_consulting_day_priorities.sql','utf8');
  await db.exec(sql);await db.exec(sql); // activation is repeatable
  await db.exec(`INSERT INTO process_checklist_items
    SELECT ('00000000-0000-0000-0000-'||lpad((n+100)::text,12,'0'))::uuid,'${org}','${project}','Entrega '||n,'recebido',(now() AT TIME ZONE 'America/Sao_Paulo')::date-1,null FROM generate_series(1,13)n;
    INSERT INTO process_checklist_items VALUES
    ('${id(200)}','${org}','${project}','Concluída','aprovado',current_date-30,null),
    ('${id(201)}','${org}','${project}','Hoje','pendente',(now() AT TIME ZONE 'America/Sao_Paulo')::date,null),
    ('${id(202)}','${org}','${project}','Excluída','pendente',current_date-30,now()),
    ('${id(203)}','${org}','${project}','Sem prazo','pendente',null,null),
    ('${id(204)}','${other}','${project}','ORG_ERRADA','pendente',current_date-30,null),
    ('${id(205)}','${other}','${foreign}','SEGREDO','pendente',current_date-30,null),
    ('${id(206)}','${org}','${project}','Em validação','em_analise',(now() AT TIME ZONE 'America/Sao_Paulo')::date-2,null),
    ('${id(207)}','${org}','${project}','Ajustar','rejeitado',(now() AT TIME ZONE 'America/Sao_Paulo')::date-3,null);
    INSERT INTO consulting_monthly_plans(process_id,organization_id,service_name,monthly_amount,starts_on,ends_on,status,return_on,routine,created_by,updated_by)
    VALUES('${project}','${org}','Assessoria',1500,'2026-01-01','2028-01-01','ativo',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'[{"title":"Rotina","day":5}]','${actor}','${actor}');
    SET test.actor='${actor}';SET ROLE authenticated;`);
  const read=async(kind='delivery',page=0,organization=org)=>(await db.query('SELECT public.read_consulting_day($1,$2,$3) AS result',[organization,kind,page])).rows[0].result;
  const first=await read(),second=await read('delivery',1),third=await read('delivery',2);
  assert.deepEqual(first.counts,{delivery:15,followup:1,project:1});
  assert.equal(first.items.length,6);assert.equal(second.items.length,6);assert.equal(third.items.length,3);
  assert.equal(first.items[0].title,'Ajustar');assert.equal(first.items[1].title,'Em validação');
  assert.equal(new Set([...first.items,...second.items,...third.items].map(x=>x.id)).size,15);
  assert.equal(first.items[0].process_id,project);
  assert.doesNotMatch(JSON.stringify([first,second,third]),/SEGREDO|ORG_ERRADA|monthly_amount/);
  assert.equal((await read('followup')).items[0].due_date,first.today);
  assert.equal((await read('project')).items[0].due_date,first.horizon);
  await assert.rejects(()=>read('bad'),/FILTER_INVALID/);await assert.rejects(()=>read(null),/FILTER_INVALID/);
  await assert.rejects(()=>read('delivery',-1),/FILTER_INVALID/);await assert.rejects(()=>read('delivery',1000001),/FILTER_INVALID/);
  await assert.rejects(()=>read('delivery',0,other),/ACCESS_DENIED/);
  for(const status of ['finalizado','arquivado','cancelado']){
    await db.exec(`RESET ROLE;UPDATE processes SET stage='${status}' WHERE id='${project}';SET ROLE authenticated;`);
    assert.deepEqual((await read()).counts,{delivery:0,followup:0,project:0});
  }
  await db.exec(`RESET ROLE;UPDATE processes SET stage='montagem',due_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date+8 WHERE id='${project}';UPDATE consulting_monthly_plans SET return_on=(now() AT TIME ZONE 'America/Sao_Paulo')::date+8;SET ROLE authenticated;`);
  assert.equal((await read('project')).total,0);assert.equal((await read('followup')).total,0);
  for(const status of ['pausado','encerrado']){
    await db.exec(`RESET ROLE;UPDATE consulting_monthly_plans SET status='${status}',return_on=(now() AT TIME ZONE 'America/Sao_Paulo')::date-1;SET ROLE authenticated;`);
    assert.equal((await read('followup')).total,0);
  }
  await db.exec(`RESET ROLE;UPDATE consulting_monthly_plans SET status='ativo';UPDATE clients SET archived_at=now() WHERE id='${client}';SET ROLE authenticated;`);
  assert.deepEqual((await read()).counts,{delivery:0,followup:0,project:0});
  await db.exec(`RESET ROLE;UPDATE clients SET archived_at=null WHERE id='${client}';UPDATE processes SET archived_at=now() WHERE id='${project}';SET ROLE authenticated;`);
  assert.deepEqual((await read()).counts,{delivery:0,followup:0,project:0});
  await db.exec(`RESET ROLE;UPDATE processes SET archived_at=null WHERE id='${project}';SET ROLE authenticated;SET test.actor='${viewer}';`);
  assert.equal((await read()).total,15);
  await db.exec(`SET test.actor='${external}';`);await assert.rejects(()=>read(),/ACCESS_DENIED/);
  await db.exec(`RESET ROLE;UPDATE organization_members SET is_active=false WHERE user_id='${actor}';SET ROLE authenticated;SET test.actor='${actor}';`);await assert.rejects(()=>read(),/ACCESS_DENIED/);
  await db.exec(`RESET ROLE;UPDATE organization_members SET is_active=true WHERE user_id='${actor}';UPDATE organization_settings SET enabled_modules='["tasks"]' WHERE organization_id='${org}';SET ROLE authenticated;`);await assert.rejects(()=>read(),/ACCESS_DENIED/);
  await db.exec(`RESET ROLE;UPDATE organization_settings SET enabled_modules='[]',business_segment='legal' WHERE organization_id='${org}';SET ROLE authenticated;`);await assert.rejects(()=>read(),/ACCESS_DENIED/);
  await db.exec(`RESET ROLE;UPDATE organization_settings SET business_segment='consulting_services' WHERE organization_id='${org}';SET ROLE authenticated;`);assert.equal((await read()).total,15);
  await db.exec(`SET test.actor='';`);await assert.rejects(()=>read(),/ACCESS_DENIED/);
  for(const role of ['anon','service_role']){
    await db.exec(`RESET ROLE;SET ROLE ${role};`);await assert.rejects(()=>read(),/permission denied/);
  }
  console.log('Visão do dia: totais completos, paginação, limites, exclusões, leitura sem sessão e isolamento verificados no SQL real.');
} finally {await db.close();}
