import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Reutiliza o banco descartável e os contratos reais da validação do painel.
export async function verifyRealEstateNotifications(db, fixture) {
  const {
    org,
    other,
    actor,
    viewer,
    external,
    property,
    contract,
    id,
    proposalValues,
    contractValues,
    record,
    values,
    prop,
    otherOwner,
    today,
  } = fixture;
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-notifications.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261016180614_real_estate_operational_notifications.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`
    ALTER TABLE organizations ADD COLUMN archived_at timestamptz;
    CREATE TABLE notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, user_id uuid NOT NULL,
      kind text, title text, body text, entity_type text, entity_id uuid, action_url text, dedupe_key text,
      read_at timestamptz, archived_at timestamptz, created_at timestamptz DEFAULT now()
    );
    CREATE UNIQUE INDEX notifications_org_user_dedupe_unique
      ON notifications(organization_id,user_id,dedupe_key) WHERE dedupe_key IS NOT NULL;
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY notifications_select_own ON notifications FOR SELECT TO authenticated
      USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM organization_members m
        WHERE m.organization_id=notifications.organization_id AND m.user_id=auth.uid() AND m.is_active));
    GRANT SELECT ON notifications TO authenticated;
    CREATE SCHEMA cron;
    CREATE TABLE cron.job(jobid bigint,jobname text,command text,username text,active boolean,schedule text);
    INSERT INTO cron.job VALUES(1,'core-fluxa-process-due-scheduled-automations',
      'SELECT public.run_temporal_automation_cycle();','postgres',true,'*/15 * * * *');
    CREATE FUNCTION cron.alter_job(job_id bigint,command text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
      UPDATE cron.job SET command=alter_job.command WHERE jobid=job_id;
    $$;
    CREATE FUNCTION public.run_temporal_automation_cycle() RETURNS jsonb LANGUAGE sql AS $$
      SELECT '{"asaas_client_payment_reminders_created":2,"health_operational_notifications_created":3,"legal_operational_notifications_created":4}'::jsonb;
    $$;
    INSERT INTO organization_members VALUES
      ('${org}','${id(400)}','operacional',true),('${org}','${id(401)}','financeiro',true),
      ('${org}','${id(402)}','administrador',false);
  `);
  await db.exec(sql);
  await db.exec(sql);
  const job = (await db.query("SELECT * FROM cron.job")).rows;
  assert.equal(job.length, 1);
  assert.equal(job[0].schedule, "*/15 * * * *");
  assert.equal(job[0].command, "SELECT fluxa_real_estate_private.run_temporal_with_real_estate();");
  const at = async (days) =>
    (await db.query("SELECT ($1::date+$2::integer)::text AS day", [today, days])).rows[0].day;
  const scan = async (day = today) =>
    (
      await db.query(
        "SELECT fluxa_real_estate_private.create_operational_notifications(($1::date+time '15:00') AT TIME ZONE 'UTC') AS count",
        [day],
      )
    ).rows[0].count;
  assert.equal(await scan(), 4); // contrato: gestão/operação; repasse: gestão/financeiro.
  assert.equal(await scan(), 0);
  const initial = (await db.query("SELECT * FROM notifications")).rows;
  assert.equal(initial.filter((n) => n.user_id === actor).length, 2);
  assert.equal(initial.filter((n) => n.user_id === id(400)).length, 1);
  assert.equal(initial.filter((n) => n.user_id === id(401)).length, 1);
  assert.equal(
    initial.filter((n) => [viewer, external, id(402), id(13)].includes(n.user_id)).length,
    0,
  );
  assert(initial.every((n) => n.organization_id === org && n.kind === "real_estate"));
  assert(initial.every((n) => n.action_url.includes("busca=APTO")));

  await db.exec(`SET test.actor='${actor}'; SET ROLE authenticated`);
  const openProposal = async (proposalId, requestId) =>
    db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,NULL,$5)", [
      org,
      property,
      proposalId,
      requestId,
      JSON.stringify({ ...proposalValues, interest_id: id(81), valid_until: await at(1) }),
    ]);
  await openProposal(id(410), id(411));
  await db.exec("RESET ROLE");
  assert.equal(await scan(), 2);
  assert.equal(await scan(), 0);
  assert.equal(await scan(await at(2)), 2); // validade vencida: um novo aviso, sem repetição.
  assert.equal(await scan(await at(2)), 0);
  await db.exec(`SET ROLE authenticated`);
  await db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,1,$5)", [
    org,
    property,
    id(410),
    id(412),
    JSON.stringify({
      ...proposalValues,
      interest_id: id(81),
      action: "recusada",
      valid_until: await at(1),
      note: "Resolvida",
    }),
  ]);
  await db.exec("RESET ROLE");
  assert.equal(await scan(await at(3)), 0); // o estado mais recente prevalece.
  assert.equal(await scan(await at(4)), 2); // contrato vence amanhã.
  assert.equal(await scan(await at(5)), 2); // contrato vence hoje.
  assert.equal(await scan(await at(6)), 2); // contrato vencido.
  assert.equal(await scan(await at(7)), 0);

  await db.exec("SET ROLE authenticated");
  await record(contract, id(420), 1, {
    ...contractValues,
    action: "renovado",
    ends_on: await at(60),
  });
  await db.query("SELECT record_real_estate_settlement($1,$2,$3,$4,$5,2,$6)", [
    org,
    property,
    id(300),
    contract,
    id(421),
    JSON.stringify({
      ...values,
      action: "repassado",
      occurred_on: today,
      note: "Repasse concluído",
    }),
  ]);
  await db.exec("RESET ROLE");
  assert.equal(await scan(await at(7)), 0); // renovação e pagamento retiram as pendências.

  // Empresa desabilitada ou arquivada não gera avisos, mesmo com proposta aberta.
  await db.exec("SET ROLE authenticated");
  await openProposal(id(430), id(431));
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE organization_settings SET enabled_modules='[\"tasks\"]' WHERE organization_id=$1",
    [org],
  );
  assert.equal(await scan(), 0);
  await db.query(
    "UPDATE organization_settings SET enabled_modules='[]',business_segment='health' WHERE organization_id=$1",
    [org],
  );
  assert.equal(await scan(), 0);
  await db.query(
    "UPDATE organization_settings SET business_segment='real_estate' WHERE organization_id=$1",
    [org],
  );
  await db.query("UPDATE organizations SET archived_at=now() WHERE id=$1", [org]);
  assert.equal(await scan(), 0);
  await db.query("UPDATE organizations SET archived_at=NULL WHERE id=$1", [org]);
  assert.equal(await scan(), 2);

  // Outra empresa recebe apenas os seus avisos; leituras da Central mantêm RLS.
  await db.exec(`SET test.actor='${id(13)}'; SET ROLE authenticated`);
  await db.query("SELECT save_real_estate_property($1,$2,NULL,$3)", [
    other,
    id(440),
    JSON.stringify({
      ...prop,
      code: "OUTRA",
      owner_client_id: otherOwner,
      responsible_user_id: id(13),
    }),
  ]);
  await db.query("SELECT save_real_estate_interest($1,$2,NULL,$3)", [
    other,
    id(441),
    JSON.stringify({
      property_id: id(440),
      client_id: otherOwner,
      purpose: "locacao",
      status: "novo",
      responsible_user_id: id(13),
      notes: null,
    }),
  ]);
  await db.query("SELECT record_real_estate_negotiation($1,$2,$3,$4,NULL,$5)", [
    other,
    id(440),
    id(442),
    id(443),
    JSON.stringify({ ...proposalValues, interest_id: id(441) }),
  ]);
  await db.exec("RESET ROLE");
  assert.equal(await scan(), 1);
  await db.exec("SET ROLE authenticated");
  const own = (await db.query("SELECT * FROM notifications")).rows;
  assert.equal(own.length, 1);
  assert.equal(own[0].organization_id, other);
  await assert.rejects(
    db.query("SELECT fluxa_real_estate_private.create_operational_notifications()"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("SELECT fluxa_real_estate_private.run_temporal_with_real_estate()"),
    /permission denied/,
  );
  await db.exec(`SET test.actor='${viewer}'`);
  assert.equal((await db.query("SELECT * FROM notifications")).rows.length, 0);
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(
    db.query("SELECT fluxa_real_estate_private.create_operational_notifications()"),
    /permission denied/,
  );
  await db.exec("RESET ROLE; SET ROLE service_role");
  await assert.rejects(
    db.query("SELECT fluxa_real_estate_private.run_temporal_with_real_estate()"),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
  const run = async () =>
    (await db.query("SELECT fluxa_real_estate_private.run_temporal_with_real_estate() AS result"))
      .rows[0].result;
  const result = await run();
  assert.equal(result.asaas_client_payment_reminders_created, 2);
  assert.equal(result.health_operational_notifications_created, 3);
  assert.equal(result.legal_operational_notifications_created, 4);
  assert.equal(result.real_estate_operational_notifications_created, 0);
  await db.exec("ALTER TABLE notifications RENAME TO notifications_unavailable");
  const failure = await run();
  assert.equal(failure.real_estate_operational_notifications_created, -1);
  assert.equal(failure.asaas_client_payment_reminders_created, 2);
  await db.exec("ALTER TABLE notifications_unavailable RENAME TO notifications");
  assert(
    (
      await db.query(
        "SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='fluxa_real_estate_private' AND p.proname IN ('create_operational_notifications','run_temporal_with_real_estate')",
      )
    ).rows.every((r) => !r.prosecdef),
  );
  await db.exec(
    readFileSync(
      new URL("../docs/operations/real-estate-notifications-rollback.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    (await db.query("SELECT command FROM cron.job WHERE jobid=1")).rows[0].command,
    "SELECT public.run_temporal_automation_cycle();",
  );
  assert.equal(
    (
      await db.query(
        "SELECT to_regprocedure('fluxa_real_estate_private.run_temporal_with_real_estate()') AS f",
      )
    ).rows[0].f,
    null,
  );
  await db.exec(sql);
  assert.equal(
    (await db.query("SELECT count(*)::integer AS count FROM cron.job")).rows[0].count,
    1,
  );
  console.log(
    "Avisos imobiliários: decisões, renovação, pagamento, faixas de vencimento, deduplicação, permissões, isolamento, ciclo único e falha isolada OK.",
  );
}
