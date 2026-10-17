import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstateFollowups(db, { org, other, actor, viewer, external, id }) {
  await db.exec("RESET ROLE");
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-followups.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL("../supabase/migrations/20261017213708_real_estate_followups.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  const call = async (action, request = null, values = {}, organization = org) =>
    (
      await db.query("SELECT real_estate_followups($1,$2,$3,$4) AS result", [
        organization,
        action,
        request,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  await db.exec(`SET test.actor='${actor}';SET ROLE authenticated`);
  let list = await call("load");
  assert.equal(list.total, 26);
  let r = list.items.find((q) => q.id === id(5000));
  if (!r)
    r = (await call("load", null, { search: "Cliente da vitrine", page: 2 })).items.find(
      (q) => q.id === id(5000),
    );
  if (!r)
    r = (await db.query("SELECT * FROM fluxa_inquiry_private.requests WHERE id=$1", [id(5000)]))
      .rows[0];
  const future = new Date(Date.now() + 86400000).toISOString();
  const values = {
    version: r.version,
    event_id: id(6000),
    next_contact_at: future,
    note: "Retornar com condições atualizadas.",
  };
  await call("set", r.id, values);
  await call("set", r.id, values);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM fluxa_inquiry_private.contact_events WHERE request_id=$1",
        [r.id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    () => call("set", r.id, { ...values, event_id: id(6001) }),
    /INQUIRY_CONFLICT/,
  );
  await assert.rejects(
    () => call("set", r.id, { ...values, note: "Alteração em repetição" }),
    /INQUIRY_CONFLICT/,
  );
  r = (await call("load", null, { followup: "future" })).items.find((q) => q.id === r.id);
  assert(r.next_contact_at);
  let history = await call("history", r.id);
  assert.equal(history.linked, true);
  assert(
    history.items.every((e) => e.id !== id(81) && e.id !== id(82)),
    "não inclui o outro cliente da mesma empresa",
  );
  assert(history.items.some((e) => e.kind === "retorno"));
  assert(history.items.some((e) => e.kind === "visita"));
  assert(history.items.some((e) => e.kind === "proposta"));
  assert(history.items.some((e) => e.kind === "interesse"));
  assert.deepEqual(
    history.items.filter((e) => e.kind === "pedido").map((e) => e.id),
    [id(5000)],
  );
  await assert.rejects(
    () =>
      call("set", r.id, {
        version: r.version,
        event_id: id(6002),
        next_contact_at: new Date(Date.now() - 1000).toISOString(),
      }),
    /FUTURE_REQUIRED/,
  );
  await call("contact", r.id, {
    version: r.version,
    event_id: id(6003),
    channel: "whatsapp",
    note: "Cliente pediu nova proposta.",
    next_contact_at: null,
  });
  list = await call("load", null, { search: r.phone });
  r = list.items.find((q) => q.id === r.id);
  assert.equal(r.next_contact_at, null);
  assert(r.last_contact_at);
  history = await call("history", r.id);
  assert(
    history.items.some((e) => e.kind === "contato" && e.note === "Cliente pediu nova proposta."),
  );
  await assert.rejects(
    () =>
      db.query("UPDATE fluxa_inquiry_private.contact_events SET note=$1 WHERE id=$2", [
        "alterar",
        id(6003),
      ]),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      call("contact", r.id, {
        version: r.version,
        event_id: id(6004),
        channel: "whatsapp",
        note: "",
      }),
    /INQUIRY_INVALID/,
  );
  const unlinked = id(5200);
  history = await call("history", unlinked);
  assert.equal(history.linked, false);
  assert.deepEqual(
    history.items.map((e) => e.kind),
    ["pedido"],
  );
  await db.exec("RESET ROLE");
  await db.query(
    "UPDATE fluxa_inquiry_private.followups SET next_contact_at=now()-interval '1 hour' WHERE request_id=$1",
    [r.id],
  );
  await db.exec("SET ROLE authenticated");
  assert.equal((await call("load", null, { followup: "overdue" })).items[0].id, r.id);
  assert.equal((await call("load", null, { followup: "none" })).total, 25);
  await assert.rejects(() => call("load", null, { timezone: "not/a/timezone" }), /INQUIRY_INVALID/);
  await assert.rejects(() => call("load", null, { followup: "invalid" }), /INQUIRY_INVALID/);
  await db.exec(`RESET ROLE;SET test.actor='${viewer}';SET ROLE authenticated`);
  assert((await call("history", r.id)).total > 0);
  await assert.rejects(() => call("set", r.id, { ...values, event_id: id(6005) }), /WRITE_DENIED/);
  await db.exec(`RESET ROLE;SET test.actor='${external}';SET ROLE authenticated`);
  await assert.rejects(() => call("load"), /READ_DENIED/);
  await db.exec(`RESET ROLE;SET test.actor='${id(13)}';SET ROLE authenticated`);
  await assert.rejects(() => call("history", r.id, {}, org), /READ_DENIED/);
  await db.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(() => call("load"), /permission denied/);
  await assert.rejects(
    () => db.query("SELECT * FROM fluxa_inquiry_private.contact_events"),
    /permission denied/,
  );
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  await assert.rejects(() => call("load", null, {}, other), /READ_DENIED/);
  // Paginação mantém histórico completo sem repetir eventos.
  r = (await db.query("SELECT * FROM fluxa_inquiry_private.requests WHERE id=$1", [r.id])).rows[0];
  for (let n = 0; n < 22; n++) {
    await call("contact", r.id, {
      version: r.version,
      event_id: id(6100 + n),
      channel: "telefone",
      note: `Contato ${n}`,
      next_contact_at: null,
    });
    r.version++;
  }
  const first = await call("history", r.id, {}),
    second = await call("history", r.id, { page: 2 });
  assert(first.total > 20);
  assert.equal(first.items.length, 20);
  assert(second.items.length > 0);
  assert.equal(
    new Set([...first.items, ...second.items].map((e) => e.kind + e.id)).size,
    first.items.length + second.items.length,
  );
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM pg_proc WHERE oid='public.real_estate_followups(uuid,text,uuid,jsonb)'::regprocedure AND prosecdef",
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "Retornos: agenda, atraso, limpeza, reenvio idempotente, conversa imutável, vínculo seguro de histórico, paginação e papéis OK.",
  );
}
