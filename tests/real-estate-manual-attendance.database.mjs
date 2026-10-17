import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstateManualAttendance(
  db,
  { org, other, actor, viewer, external, owner, id },
) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}'`);
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-manual-attendance.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261017233249_real_estate_manual_attendance.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  const call = async (action, request, values = {}, organization = org) =>
    (
      await db.query("SELECT real_estate_manual_attendance($1,$2,$3,$4) AS result", [
        organization,
        action,
        request,
        JSON.stringify(values),
      ])
    ).rows[0].result;
  const queue = async (search) =>
    (
      await db.query("SELECT real_estate_followups($1,'load',NULL,$2) AS result", [
        org,
        JSON.stringify({ search }),
      ])
    ).rows[0].result;
  const get = async (rid) =>
    (
      await db.query(
        "SELECT * FROM fluxa_inquiry_private.requests WHERE organization_id=$1 AND id=$2",
        [org, rid],
      )
    ).rows[0];
  const next = new Date(Date.now() + 86400000).toISOString();
  const input = {
    name: "Contato manual",
    phone: "27 99999-6666",
    origin: "whatsapp",
    responsible_user_id: actor,
    next_contact_at: next,
    internal_note: "Recebido pelo atendimento comercial.",
    preferences: {
      purpose: "locacao",
      property_type: "apartamento",
      districts: ["sao jose"],
      max_price: 1600,
      bedrooms: 2,
      parking: 1,
    },
  };
  const request = id(8000);
  await db.exec("SET ROLE authenticated");
  const saved = await call("create", request, input);
  assert.equal(saved.id, request);
  assert.equal(saved.duplicate, false);
  let r = await get(request);
  assert.equal(r.property_id, null);
  assert.equal(r.listing_id, null);
  assert.equal(r.origin, "whatsapp");
  assert.equal(r.phone, "5527999996666");
  assert.equal(r.created_by, actor);
  assert.equal(r.consent_version, "staff-contact-v1");
  const list = await queue("Contato manual");
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, request);
  assert(list.items[0].next_contact_at);
  assert.equal(list.items[0].responsible_user_id, actor);
  assert.equal(
    (await db.query("SELECT real_estate_preferences($1,'matches',$2,'{}') AS r", [org, request]))
      .rows[0].r.total,
    22,
  );
  const initialVersion = r.version;
  await call("create", request, input);
  assert.equal((await get(request)).version, initialVersion);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM fluxa_inquiry_private.contact_events WHERE request_id=$1",
        [request],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(() => call("create", request, { ...input, name: "Outro nome" }), /CONFLICT/);
  const duplicate = await call("create", id(8001), {
    ...input,
    phone: "5527999996666",
    internal_note: "Não sobrescrever",
  });
  assert.equal(duplicate.id, request);
  assert(duplicate.duplicate);
  assert.equal((await get(request)).internal_note, input.internal_note);
  for (const [n, patch] of [
    [2, { preferences: { ...input.preferences, bedrooms: -1 } }],
    [3, { responsible_user_id: id(13) }],
    [4, { next_contact_at: new Date(Date.now() - 60000).toISOString() }],
    [5, { origin: "vitrine" }],
  ]) {
    await assert.rejects(() =>
      call("create", id(8000 + n), { ...input, phone: `2799999660${n}`, ...patch }),
    );
    assert.equal(
      await get(id(8000 + n)),
      undefined,
      "erro desfaz o pedido e todas as operações relacionadas",
    );
  }
  await assert.rejects(
    () =>
      db.query("SELECT real_estate_inquiry_manage($1,'link',$2,$3)", [
        org,
        request,
        JSON.stringify({ version: r.version, client_id: owner }),
      ]),
    /PROPERTY_REQUIRED/,
  );
  await assert.rejects(
    () => call("update", request, { version: 0, status: "em_contato" }),
    /CONFLICT/,
  );
  await assert.rejects(
    () => call("update", request, { version: r.version, status: "encerrado" }),
    /CLOSURE_REQUIRED/,
  );
  await assert.rejects(
    () =>
      call("update", request, {
        version: r.version,
        status: "encerrado",
        closure_reason: "outro",
        closure_note: "",
      }),
    /CLOSURE_REQUIRED/,
  );
  await assert.rejects(
    () =>
      db.query("SELECT real_estate_inquiry_manage($1,'update',$2,$3)", [
        org,
        request,
        JSON.stringify({ version: r.version, status: "encerrado", responsible_user_id: actor }),
      ]),
    /CLOSURE_REQUIRED/,
  );
  await call("update", request, {
    version: r.version,
    status: "em_contato",
    responsible_user_id: actor,
    next_contact_at: next,
    internal_note: input.internal_note,
  });
  r = await get(request);
  assert.equal(r.status, "em_contato");
  await call("update", request, {
    version: r.version,
    status: "encerrado",
    responsible_user_id: actor,
    closure_reason: "desistiu",
    closure_note: "Cliente optou por não prosseguir.",
    next_contact_at: next,
  });
  r = await get(request);
  assert.equal(r.closure_reason, "desistiu");
  assert(r.closed_at);
  assert.equal((await queue("Contato manual")).items[0].next_contact_at, null);
  let history = (
    await db.query("SELECT real_estate_followups($1,'history',$2,'{}') AS r", [org, request])
  ).rows[0].r;
  assert(history.items.some((e) => e.kind === "pedido" && e.property_code === null));
  assert(history.items.some((e) => e.note?.includes("Atendimento encerrado: Desistiu")));
  assert.equal(history.linked, false);
  await assert.rejects(
    () => call("attach", request, { version: r.version, property_id: id(7002) }),
    /PROPERTY_INVALID/,
  );
  await call("update", request, {
    version: r.version,
    status: "novo",
    responsible_user_id: actor,
    next_contact_at: null,
  });
  r = await get(request);
  assert.equal(r.closure_reason, null);
  assert.equal(r.closed_at, null);
  assert.equal((await queue("Contato manual")).items[0].next_contact_at, null);
  history = (
    await db.query("SELECT real_estate_followups($1,'history',$2,'{}') AS r", [org, request])
  ).rows[0].r;
  assert(
    history.items.some((e) => e.note?.includes("Atendimento encerrado: Desistiu")),
    "reabrir preserva o histórico",
  );
  await assert.rejects(
    () => call("attach", request, { version: r.version, property_id: id(7001) }),
    /PROPERTY_INVALID/,
  );
  await db.exec("RESET ROLE");
  const otherProperty = (
    await db.query("SELECT id FROM real_estate_properties WHERE organization_id=$1 LIMIT 1", [
      other,
    ])
  ).rows[0].id;
  await db.exec("SET ROLE authenticated");
  await assert.rejects(
    () => call("attach", request, { version: r.version, property_id: otherProperty }),
    /PROPERTY_INVALID/,
  );
  await call("attach", request, { version: r.version, property_id: id(7002) });
  r = await get(request);
  assert.equal(r.property_id, id(7002));
  assert.equal((await queue("Contato manual")).items[0].property_code, "MATCH-02");
  await db.query("SELECT real_estate_inquiry_manage($1,'link',$2,$3)", [
    org,
    request,
    JSON.stringify({ version: r.version, client_id: owner }),
  ]);
  r = await get(request);
  assert(r.interest_id);
  assert(
    (
      await db.query("SELECT notes FROM real_estate_interests WHERE id=$1", [r.interest_id])
    ).rows[0].notes.includes("manual"),
  );
  const start = new Date(Date.now() + 10 * 86400000),
    end = new Date(start.getTime() + 3600000);
  await db.query("SELECT real_estate_inquiry_manage($1,'schedule',$2,$3)", [
    org,
    request,
    JSON.stringify({
      version: r.version,
      responsible_user_id: actor,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    }),
  ]);
  r = await get(request);
  await call("update", request, {
    version: r.version,
    status: "encerrado",
    closure_reason: "fechou_negocio",
    closure_note: "Conclusão informada pela equipe.",
    responsible_user_id: actor,
  });
  assert.equal(
    (await db.query("SELECT status FROM real_estate_visits WHERE id=$1", [r.visit_id])).rows[0]
      .status,
    "agendada",
    "encerramento não cancela a visita",
  );
  // O caminho público permanece restrito ao anúncio publicado e não aceita origem manual.
  await db.query(
    `INSERT INTO fluxa_inquiry_private.requests(id,organization_id,name,phone,purpose,kind,origin,created_by,creation_hash,consent_version)
    SELECT gen_random_uuid(),$1,'Volume manual '||n,'552799'||lpad(n::text,7,'0'),'locacao','informacao','telefone',$2,md5(n::text),'staff-contact-v1' FROM generate_series(1,201) n`,
    [org, actor],
  );
  const token = (
    await db.query("SELECT token FROM fluxa_catalog_private.storefronts WHERE organization_id=$1", [
      org,
    ])
  ).rows[0].token;
  await db.exec("RESET ROLE;SET ROLE anon");
  await db.query("SELECT real_estate_submit_inquiry($1,$2,$3,$4)", [
    token,
    id(7103),
    id(8200),
    JSON.stringify({
      name: "Contato público",
      phone: "27999997777",
      purpose: "locacao",
      kind: "informacao",
      consent: true,
      origin: "whatsapp",
    }),
  ]);
  await assert.rejects(() => call("create", id(8201), input), /permission denied/);
  await db.exec(`RESET ROLE;SET test.actor='${actor}';SET ROLE authenticated`);
  assert.equal((await get(id(8200))).origin, "vitrine");
  await db.exec(`RESET ROLE;SET test.actor='${viewer}';SET ROLE authenticated`);
  assert.equal((await queue("Contato manual")).total, 1);
  await assert.rejects(() => call("create", id(8202), input), /WRITE_DENIED/);
  await assert.rejects(
    () => call("update", request, { version: r.version, status: "novo" }),
    /WRITE_DENIED/,
  );
  assert.equal(
    (
      await db.query(
        "UPDATE fluxa_inquiry_private.requests SET closure_reason='outro' WHERE id=$1 RETURNING id",
        [request],
      )
    ).rows.length,
    0,
  );
  await db.exec(`RESET ROLE;SET test.actor='${external}';SET ROLE authenticated`);
  await assert.rejects(() => call("create", id(8203), input), /WRITE_DENIED/);
  assert.equal(
    (await db.query("SELECT * FROM fluxa_inquiry_private.requests WHERE id=$1", [request])).rows
      .length,
    0,
  );
  await db.exec(`RESET ROLE;SET test.actor='${id(13)}';SET ROLE authenticated`);
  await assert.rejects(() => call("create", id(8204), input), /WRITE_DENIED/);
  await assert.rejects(
    () => call("attach", request, { version: 1, property_id: otherProperty }, other),
    /READ_DENIED/,
  );
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT prosecdef FROM pg_proc WHERE oid='public.real_estate_manual_attendance(uuid,text,uuid,jsonb)'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  console.log(
    "Atendimento manual: cadastro sem imóvel, preferências, responsável, retorno, reenvio, duplicidade, rollback, encerramento, histórico, reabertura, vínculo, agenda e isolamento OK.",
  );
}
