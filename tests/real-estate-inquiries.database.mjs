import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstateInquiries(
  db,
  { org, other, actor, viewer, external, property, id, owner },
) {
  await db.exec("RESET ROLE");
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-inquiries.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261017102350_real_estate_inquiry_queue.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  const {
    rows: [store],
  } = await db.query(
    "SELECT token FROM fluxa_catalog_private.storefronts WHERE organization_id=$1",
    [org],
  );
  const {
    rows: [listing],
  } = await db.query(
    "SELECT id FROM fluxa_catalog_private.listings WHERE organization_id=$1 AND property_id=$2",
    [org, property],
  );
  const body = {
    name: "Cliente da vitrine",
    phone: "(27) 99999-1234",
    purpose: "locacao",
    kind: "visita",
    message: "Gostaria de conhecer.",
    consent: true,
  };
  const submit = async (values = body, rid = id(5000), token = store.token, lid = listing.id) =>
    (
      await db.query("SELECT real_estate_submit_inquiry($1,$2,$3,$4) AS value", [
        token,
        lid,
        rid,
        JSON.stringify(values),
      ])
    ).rows[0].value;
  const manage = async (action, request = null, values = {}, organization = org) =>
    (
      await db.query("SELECT real_estate_inquiry_manage($1,$2,$3,$4) AS value", [
        organization,
        action,
        request,
        JSON.stringify(values),
      ])
    ).rows[0].value;
  await db.exec(`SET test.actor=''; SET ROLE anon`);
  assert.deepEqual(await submit(), { accepted: true });
  assert.deepEqual(await submit({ ...body, name: "Não substituir dados" }, id(5001)), {
    accepted: true,
  });
  await assert.rejects(
    () => db.query("SELECT * FROM fluxa_inquiry_private.requests"),
    /permission denied/,
  );
  await assert.rejects(() => manage("load"), /permission denied/);
  await assert.rejects(() => submit({ ...body, consent: false }), /INQUIRY_INVALID/);
  await assert.rejects(() => submit({ ...body, purpose: "venda" }), /INQUIRY_UNAVAILABLE/);
  await assert.rejects(() => submit(body, id(5002), id(9999)), /INQUIRY_UNAVAILABLE/);
  assert.deepEqual(await submit({ ...body, website: "bot" }, id(5003)), { accepted: true });
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  let data = await manage("load", null, { status: "novo" });
  assert.equal(data.total, 1);
  let request = data.items[0];
  assert.equal(request.name, body.name);
  assert.equal(request.phone, "5527999991234");
  assert.equal(request.id, id(5000));
  assert.equal((await manage("load", null, { search: "não substituir" })).total, 0);
  await assert.rejects(
    () => manage("update", request.id, { version: 999, status: "em_contato" }),
    /INQUIRY_CONFLICT/,
  );
  await assert.rejects(
    () =>
      manage("update", request.id, {
        version: request.version,
        status: "em_contato",
        responsible_user_id: id(13),
      }),
    /RESPONSIBLE_INVALID/,
  );
  await manage("update", request.id, {
    version: request.version,
    status: "em_contato",
    responsible_user_id: actor,
    internal_note: "Conferido com o cliente.",
  });
  request = (await manage("load")).items[0];
  assert.equal(request.responsible_user_id, actor);
  await assert.rejects(
    () => manage("link", request.id, { version: request.version, client_id: id(21) }),
    /CLIENT_INVALID/,
  );
  await manage("link", request.id, { version: request.version, client_id: owner });
  request = (await manage("load")).items[0];
  assert(request.interest_id);
  const countBefore = (
    await db.query(
      "SELECT count(*)::int AS n FROM real_estate_interests WHERE organization_id=$1 AND property_id=$2 AND client_id=$3 AND purpose=$4",
      [org, property, owner, "locacao"],
    )
  ).rows[0].n;
  assert.equal(countBefore, 1);
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + 3600000);
  await manage("schedule", request.id, {
    version: request.version,
    responsible_user_id: actor,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  });
  request = (await manage("load")).items[0];
  assert(request.visit_id);
  await assert.rejects(
    () =>
      manage("schedule", request.id, {
        version: request.version,
        responsible_user_id: actor,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      }),
    /ALREADY_SCHEDULED/,
  );
  let agenda = await manage("load", null, { kind: "agenda", search: request.property_code });
  let visit = agenda.items.find((v) => v.id === request.visit_id);
  assert(visit);
  assert.equal(visit.confirmed_at, null);
  await manage("confirm", null, { visit_id: visit.id, visit_version: visit.version });
  agenda = await manage("load", null, { kind: "agenda" });
  visit = agenda.items.find((v) => v.id === request.visit_id);
  assert(visit.confirmed_at);
  const newStart = new Date(start.getTime() + 86400000),
    newEnd = new Date(end.getTime() + 86400000);
  await manage("visit_result", null, {
    visit_id: visit.id,
    visit_version: visit.version,
    status: "agendada",
    starts_at: newStart.toISOString(),
    ends_at: newEnd.toISOString(),
    responsible_user_id: actor,
  });
  agenda = await manage("load", null, { kind: "agenda" });
  visit = agenda.items.find((v) => v.id === request.visit_id);
  assert.equal(visit.confirmed_at, null);
  await assert.rejects(
    () =>
      manage("visit_result", null, {
        visit_id: visit.id,
        visit_version: visit.version,
        status: "realizada",
        outcome: "Visita ainda não ocorreu.",
      }),
    /VISIT_NOT_STARTED/,
  );
  await assert.rejects(
    () =>
      manage("visit_result", null, {
        visit_id: visit.id,
        visit_version: visit.version,
        status: "cancelada",
        outcome: "",
      }),
    /check constraint/,
  );
  await manage("visit_result", null, {
    visit_id: visit.id,
    visit_version: visit.version,
    status: "cancelada",
    outcome: "Cliente pediu cancelamento.",
  });
  await db.exec(`RESET ROLE;SET test.actor='${viewer}';SET ROLE authenticated`);
  assert.equal((await manage("load")).total, 1);
  await assert.rejects(
    () => manage("update", request.id, { version: request.version, status: "encerrado" }),
    /WRITE_DENIED/,
  );
  await db.exec(`RESET ROLE;SET test.actor='${external}';SET ROLE authenticated`);
  await assert.rejects(() => manage("load"), /READ_DENIED/);
  await db.exec(`RESET ROLE;SET test.actor='${id(13)}';SET ROLE authenticated`);
  await assert.rejects(() => manage("load", null, {}, org), /READ_DENIED/);
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  await assert.rejects(() => manage("load", null, {}, other), /READ_DENIED/);
  // Sem leitura/alteração do nome por quem conhece um telefone; reenviar é idempotente.
  await db.exec(`RESET ROLE;SET test.actor='';SET ROLE anon`);
  assert.deepEqual(await submit({ ...body, name: "Tentativa de alteração" }, id(5050)), {
    accepted: true,
  });
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  assert.equal((await manage("load")).items[0].name, body.name);
  await db.exec("RESET ROLE");
  // Limites reais de envio, indisponibilidade e paginação.
  await db.exec("SET ROLE anon");
  for (let n = 0; n < 4; n++) {
    const pid = id(1000 + n);
    await db.exec("RESET ROLE");
    const lid = (
      await db.query("SELECT id FROM fluxa_catalog_private.listings WHERE property_id=$1", [pid])
    ).rows[0].id;
    await db.exec("SET ROLE anon");
    await submit(body, id(5100 + n), store.token, lid);
  }
  await db.exec("RESET ROLE");
  const sixth = (
    await db.query("SELECT id FROM fluxa_catalog_private.listings WHERE property_id=$1", [id(1004)])
  ).rows[0].id;
  await db.exec("SET ROLE anon");
  await assert.rejects(() => submit(body, id(5110), store.token, sixth), /INQUIRY_LIMIT/);
  for (let n = 0; n < 21; n++)
    await submit({ ...body, phone: `2798888${String(n).padStart(4, "0")}` }, id(5200 + n));
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  const page1 = await manage("load", null, { page: 1 }),
    page2 = await manage("load", null, { page: 2 });
  assert.equal(page1.total, 26);
  assert.equal(page1.items.length, 20);
  assert.equal(page2.items.length, 6);
  assert.equal(new Set([...page1.items, ...page2.items].map((r) => r.id)).size, 26);
  await assert.rejects(() => manage("load", null, { page: 0 }), /INQUIRY_INVALID/);
  await db.exec("RESET ROLE");
  await db.query("UPDATE fluxa_catalog_private.listings SET is_published=false WHERE id=$1", [
    listing.id,
  ]);
  await db.exec("SET ROLE anon");
  await assert.rejects(() => submit(body, id(5300)), /INQUIRY_UNAVAILABLE/);
  await db.exec("RESET ROLE");
  await db.query("UPDATE fluxa_catalog_private.listings SET is_published=true WHERE id=$1", [
    listing.id,
  ]);
  await db.exec(
    readFileSync(
      new URL("../docs/operations/real-estate-inquiries-activate.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM fluxa_inquiry_private.requests")).rows[0].n,
    26,
  );
  // A superfície anônima contém somente uma função privilegiada, fixa e sem leitura de cadastros.
  const functions = (
    await db.query(
      "SELECT proname,proconfig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='fluxa_inquiry_private' AND prosecdef",
    )
  ).rows;
  assert.deepEqual(
    functions.map((f) => f.proname),
    ["submit"],
  );
  assert(functions[0].proconfig.some((s) => s.startsWith("search_path=")));
  console.log(
    "Atendimento: envio anônimo mínimo, consentimento, reenvio, isolamento, atribuição, vínculo sem duplicação, agenda, confirmação e reagendamento OK.",
  );
}
