import {CONSULTING_TEMPLATE_IDS,consultingTemplate} from "../src/lib/consulting-templates.ts";
import {pt} from "../src/i18n/locales/pt.ts";
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.env.FLUXA_PGLITE_ROOT||'.','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),actor=id(3),viewer=id(4),project=id(5),foreign=id(6),client=id(7),delivery=id(8);
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 GRANT USAGE ON SCHEMA public,auth TO authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
 CREATE TYPE app_role AS ENUM ('proprietario','administrador','gestor','operacional','atendimento','visualizador','financeiro','cliente_externo','superadmin');
 CREATE TABLE organizations(id uuid PRIMARY KEY);CREATE TABLE organization_members(organization_id uuid,user_id uuid,role app_role,is_active boolean);
 CREATE TABLE processes(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES organizations(id),title text,description text,owner_name text,due_date date,client_id uuid DEFAULT '${client}');
 CREATE FUNCTION is_org_member(org uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active) $$;
 CREATE FUNCTION has_org_role(org uuid,roles app_role[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=org AND user_id=auth.uid() AND is_active AND role=ANY(roles)) $$;
 CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
 INSERT INTO organizations VALUES('${org}'),('${other}');
 INSERT INTO organization_members VALUES('${org}','${actor}','proprietario',true),('${org}','${viewer}','visualizador',true);
 INSERT INTO processes VALUES('${project}','${org}','Projeto','Escopo anterior','Equipe','2026-10-20'),('${foreign}','${other}','Outro','Privado','Outra equipe','2026-10-20');
 ALTER TABLE processes ENABLE ROW LEVEL SECURITY;GRANT SELECT,UPDATE ON processes TO authenticated;
 `);
 const base=readFileSync('supabase/migrations/20260729200845_a6d2d33f-8402-4678-be5e-9fc776bbd7ee.sql','utf8');
 await db.exec(base.match(/CREATE POLICY "processes_select"[^;]+;/)[0]);
 const policies=readFileSync('supabase/migrations/20260731172851_dc43122c-1836-4204-892b-a17f4f42ce93.sql','utf8');
 await db.exec(policies.match(/CREATE POLICY "processes_update"[^;]+;/)[0]);
 await db.exec(policies.match(/CREATE POLICY "processes_insert"[^;]+;/)[0]);
 await db.exec("GRANT INSERT ON processes TO authenticated;");
 const checklist=readFileSync('supabase/migrations/20260731172812_ab35210b-e568-48b7-a5a5-84c99dae17ed.sql','utf8');
 await db.exec(checklist.slice(checklist.indexOf('-- 6. Checklist do processo')));
 await db.exec(`SET ROLE authenticated;SET test.actor='${actor}';`);
 const changed=await db.query(`UPDATE processes SET title=$1,description=$2,owner_name=$3,due_date=$4 WHERE id=$5 AND organization_id=$6 RETURNING *`,['Reduzir retrabalho','Diagnóstico e plano','Ana','2026-11-20',project,org]);
 assert.equal(changed.rows.length,1);assert.equal(changed.rows[0].description,'Diagnóstico e plano');assert.equal(changed.rows[0].owner_name,'Ana');
 await db.query(`INSERT INTO process_checklist_items(id,organization_id,process_id,title,description,assignee_name,due_date,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[delivery,org,project,'Plano de ação','Apresentação do plano','Bruno','2026-11-10','recebido']);
 let result=await db.query(`UPDATE process_checklist_items SET status='aprovado',description='Resultado validado' WHERE id=$1 AND organization_id=$2 AND process_id=$3 AND deleted_at IS NULL RETURNING *`,[delivery,org,project]);
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,'aprovado');assert.equal(result.rows[0].assignee_name,'Bruno');
 result=await db.query(`UPDATE process_checklist_items SET title='Errado' WHERE id=$1 AND organization_id=$2 AND process_id=$3 RETURNING id`,[delivery,org,foreign]);assert.equal(result.rows.length,0);
 result=await db.query(`UPDATE processes SET title='Errado' WHERE id=$1 RETURNING id`,[foreign]);assert.equal(result.rows.length,0);
 for(const [index,key] of CONSULTING_TEMPLATE_IDS.entries()){
  const model=consultingTemplate(key,path=>path.split('.').reduce((value,part)=>value[part],pt));
  const projectId=id(30+index);
  await db.query('INSERT INTO processes(id,organization_id,title,description,owner_name,due_date) VALUES($1,$2,$3,$4,$5,$6)',[projectId,org,model.title,model.description,'Ana','2026-12-20']);
  await db.query(`INSERT INTO process_checklist_items(organization_id,process_id,title,position) SELECT $1,$2,title,position FROM jsonb_to_recordset($3::jsonb) AS x(title text,position integer)`,[org,projectId,JSON.stringify(model.deliveries.map((title,position)=>({title,position})))]);
  const saved=(await db.query('SELECT title,status,required,due_date,assignee_name FROM process_checklist_items WHERE process_id=$1 ORDER BY position',[projectId])).rows;
  assert.deepEqual(saved.map(item=>item.title),model.deliveries);
  assert(saved.every(item=>item.status==='pendente'&&item.required&&item.due_date===null&&item.assignee_name===null));
 }
 await db.exec(`SET test.actor='${viewer}';`);
 result=await db.query(`SELECT title FROM processes WHERE id=$1`,[project]);assert.equal(result.rows[0].title,'Reduzir retrabalho');
 result=await db.query(`UPDATE processes SET title='Sem permissão' WHERE id=$1 RETURNING id`,[project]);assert.equal(result.rows.length,0);
 result=await db.query(`UPDATE process_checklist_items SET status='pendente' WHERE id=$1 RETURNING id`,[delivery]);assert.equal(result.rows.length,0);
 await assert.rejects(()=>db.query(`INSERT INTO process_checklist_items(organization_id,process_id,title) VALUES($1,$2,'Sem permissão')`,[org,project]));
 await db.exec(`RESET ROLE;
 CREATE TABLE clients(id uuid PRIMARY KEY,organization_id uuid,name text,archived_at timestamptz);
 CREATE TABLE organization_settings(organization_id uuid,business_segment text,enabled_modules jsonb);
 CREATE TABLE commercial_proposals(id uuid PRIMARY KEY,organization_id uuid,client_id uuid,converted_client_id uuid,status text,archived_at timestamptz,title text,service_description text,terms text);
 INSERT INTO clients VALUES('${client}','${org}','Cliente',null),('${id(20)}','${other}','Outro',null),('${id(21)}','${org}','Segundo',null);
 INSERT INTO organization_settings VALUES('${org}','consulting_services','[]'),('${other}','consulting_services','[]');
 INSERT INTO commercial_proposals VALUES
 ('${id(100)}','${org}','${client}',null,'accepted',null,'Aprovado','Escopo aprovado','Condições'),
 ('${id(101)}','${org}','${client}',null,'draft',null,'Rascunho','Outro escopo','Condições'),
 ('${id(102)}','${org}','${client}',null,'accepted',now(),'Arquivado','Outro escopo','Condições'),
 ('${id(103)}','${other}','${id(20)}',null,'accepted',null,'OUTRA EMPRESA','SEGREDO','PRIVADO'),
 ('${id(104)}','${org}',null,'${client}','accepted',null,'Cliente convertido','Escopo convertido','Condições');
 GRANT SELECT ON clients,organization_settings,commercial_proposals TO authenticated;
 ALTER TABLE commercial_proposals ENABLE ROW LEVEL SECURITY;ALTER TABLE clients ENABLE ROW LEVEL SECURITY;ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
 CREATE POLICY clients_select ON clients FOR SELECT TO authenticated USING(is_org_member(organization_id));
 CREATE POLICY settings_select ON organization_settings FOR SELECT TO authenticated USING(is_org_member(organization_id));
 `);
 const proposalsSql=readFileSync('supabase/migrations/20261002120000_commercial_proposals.sql','utf8');
 await db.exec(proposalsSql.match(/CREATE POLICY commercial_proposals_select[\s\S]*?;/)[0]);
 const sourceSql=readFileSync('supabase/migrations/20261021200209_consulting_project_proposal_source.sql','utf8');
 await db.exec(sourceSql);await db.exec(sourceSql);
 await db.exec(`SET ROLE authenticated;SET test.actor='${actor}';`);
 const insertSource=async(n,proposal=id(100),person=client,organization=org)=>(await db.query('INSERT INTO processes(id,organization_id,client_id,title,description,source_commercial_proposal_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id(n),organization,person,'Nome revisado','Escopo revisado',proposal])).rows[0];
 const sourced=await insertSource(110);assert.equal(sourced.source_commercial_proposal_id,id(100));assert.equal(sourced.title,'Nome revisado');assert.equal(sourced.description,'Escopo revisado');assert.equal(sourced.due_date,null);
 const converted=await insertSource(111,id(104));assert.equal(converted.client_id,client);assert.equal(converted.source_commercial_proposal_id,id(104));
 for(const bad of [101,102,103,999])await assert.rejects(()=>insertSource(112,id(bad)),/SOURCE_INVALID/);
 await assert.rejects(()=>insertSource(112,id(100),id(21)),/SOURCE_INVALID/);
 await assert.rejects(()=>insertSource(112,id(100),id(20),other),/SOURCE_ACCESS_DENIED/);
 await assert.rejects(()=>db.query('UPDATE processes SET source_commercial_proposal_id=null WHERE id=$1',[id(110)]),/SOURCE_IMMUTABLE/);
 await assert.rejects(()=>db.query('UPDATE processes SET source_commercial_proposal_id=$1 WHERE id=$2',[id(104),id(110)]),/SOURCE_IMMUTABLE/);
 await assert.rejects(()=>db.query('UPDATE processes SET client_id=$1 WHERE id=$2',[id(21),id(110)]),/SOURCE_IMMUTABLE/);
 await assert.rejects(()=>db.query('UPDATE processes SET organization_id=$1 WHERE id=$2',[other,id(110)]),/SOURCE_IMMUTABLE/);
 await assert.rejects(()=>db.query('UPDATE processes SET source_commercial_proposal_id=$1 WHERE id=$2',[id(100),project]),/SOURCE_IMMUTABLE/);
 await db.exec(`RESET ROLE;UPDATE clients SET archived_at=now() WHERE id='${client}';SET ROLE authenticated;`);
 await assert.rejects(()=>insertSource(112),/SOURCE_INVALID/);
 await db.exec(`RESET ROLE;UPDATE clients SET archived_at=null WHERE id='${client}';UPDATE organization_settings SET enabled_modules='["processes"]' WHERE organization_id='${org}';SET ROLE authenticated;`);
 await assert.rejects(()=>insertSource(112),/SOURCE_ACCESS_DENIED/);
 await db.exec(`RESET ROLE;UPDATE organization_settings SET enabled_modules='["reports"]' WHERE organization_id='${org}';SET ROLE authenticated;`);
 await assert.rejects(()=>insertSource(112),/SOURCE_ACCESS_DENIED/);
 await db.exec(`RESET ROLE;UPDATE organization_settings SET enabled_modules='[]',business_segment='legal' WHERE organization_id='${org}';SET ROLE authenticated;`);
 await assert.rejects(()=>insertSource(112),/SOURCE_ACCESS_DENIED/);
 // Unsourced legacy creation remains unchanged in another area.
 await insertSource(113,null);
 await db.exec(`RESET ROLE;UPDATE organization_settings SET business_segment='consulting_services' WHERE organization_id='${org}';SET ROLE authenticated;`);
 for(const role of ['proprietario','administrador','gestor','operacional']){
  await db.exec(`RESET ROLE;UPDATE organization_members SET role='${role}' WHERE user_id='${actor}';SET ROLE authenticated;`);
  const row=await insertSource(120+['proprietario','administrador','gestor','operacional'].indexOf(role));assert.equal(row.source_commercial_proposal_id,id(100));
 }
 for(const role of ['superadmin','visualizador','atendimento','financeiro','cliente_externo']){
  await db.exec(`RESET ROLE;UPDATE organization_members SET role='${role}' WHERE user_id='${actor}';SET ROLE authenticated;`);
  await assert.rejects(()=>insertSource(130),/SOURCE_ACCESS_DENIED|row-level security/);
 }
 await db.exec(`RESET ROLE;UPDATE organization_members SET role='proprietario',is_active=false WHERE user_id='${actor}';SET ROLE authenticated;`);
 await assert.rejects(()=>insertSource(130),/SOURCE_ACCESS_DENIED/);
 await db.exec(`RESET ROLE;UPDATE organization_members SET is_active=true WHERE user_id='${actor}';UPDATE commercial_proposals SET archived_at=now() WHERE id='${id(100)}';SET ROLE authenticated;`);
 assert.equal((await db.query('UPDATE processes SET title=$1,due_date=$2 WHERE id=$3 RETURNING title,source_commercial_proposal_id',['Edição posterior','2026-12-20',id(110)])).rows[0].source_commercial_proposal_id,id(100));
 await db.exec(`RESET ROLE;`);
 await assert.rejects(()=>db.query('DELETE FROM commercial_proposals WHERE id=$1',[id(100)]),/foreign key constraint/);
 await db.exec(`SET ROLE authenticated;SET test.actor='';`);await assert.rejects(()=>insertSource(130),/SOURCE_ACCESS_DENIED/);
 console.log('Origem da proposta: referência persistida, aceite/cliente/empresa/módulos/papéis validados, origem imutável e fluxo legado preservado.');
 console.log('Consultoria: ficha e entregas persistidas, escopo de projeto/empresa e acesso de leitura verificados.');
}finally{await db.close();}
