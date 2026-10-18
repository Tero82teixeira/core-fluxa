import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export async function verifyRealEstateCommercial(db, { org, other, actor, viewer, external, id }) {
  await db.exec(`RESET ROLE;SET test.actor='${actor}'`);
  const sql = readFileSync(
    new URL("../docs/operations/real-estate-commercial.sql", import.meta.url),
    "utf8",
  );
  assert.equal(
    sql,
    readFileSync(
      new URL(
        "../supabase/migrations/20261018003513_real_estate_commercial_dashboard.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(sql);
  await db.exec(sql);
  await db.query(
    "UPDATE fluxa_inquiry_private.requests SET created_at='2020-01-01' WHERE organization_id=$1",
    [org],
  );
  const fixtures = [
    [9000, "vitrine", "novo", null, null, "2026-10-01T02:59:00Z"],
    [9001, "whatsapp", "em_contato", actor, null, "2026-10-01T03:00:00Z"],
    [9002, "telefone", "encerrado", actor, "fechou_negocio", "2026-10-02T20:00:00Z"],
    [9003, "presencial", "encerrado", null, "desistiu", "2026-10-03T02:59:00Z"],
    [9004, "outro", "novo", null, null, "2026-10-03T03:00:00Z"],
    [9005, "vitrine", "novo", null, null, "2026-10-01T15:00:00Z"],
    [9006, "whatsapp", "encerrado", null, "desistiu", "2026-10-02T20:00:00Z"],
  ];
  for (const [n, origin, status, responsible, reason, at] of fixtures) {
    await db.query(
      `INSERT INTO fluxa_inquiry_private.requests(id,organization_id,listing_id,property_id,name,phone,purpose,kind,origin,status,responsible_user_id,closure_reason,created_at,created_by,creation_hash)
      VALUES($1,$2,$3,$4,$5,$6,'locacao','informacao',$7,$8,$9,$10,$11,$12,$13)`,
      [
        id(n),
        org,
        origin === "vitrine" ? id(7102) : null,
        origin === "vitrine" ? id(7002) : null,
        `Comercial ${n}`,
        `552799999${n}`,
        origin,
        status,
        responsible,
        reason,
        at,
        origin === "vitrine" ? null : actor,
        origin === "vitrine" ? null : "a".repeat(32),
      ],
    );
  }
  await db.query("UPDATE fluxa_inquiry_private.requests SET closure_reason=NULL WHERE id=$1", [
    id(9006),
  ]);
  await db.query(
    "INSERT INTO fluxa_inquiry_private.followups(organization_id,request_id,next_contact_at,updated_by) VALUES($1,$2,now()-interval '1 day',$3)",
    [org, id(9001), actor],
  );
  await db.exec(`SET test.actor='${id(13)}'`);
  await db.query(
    `INSERT INTO fluxa_inquiry_private.requests(id,organization_id,name,phone,purpose,kind,origin,created_at,created_by,creation_hash) VALUES($1,$2,'Outra empresa','5527999999998','locacao','informacao','whatsapp','2026-10-01T12:00:00Z',$3,md5('other'))`,
    [id(9099), other, id(13)],
  );
  const filters = {
    date_from: "2026-10-01",
    date_to: "2026-10-02",
    timezone: "America/Sao_Paulo",
    responsible: "",
  };
  const call = async (action, values = {}, organization = org) =>
    (
      await db.query("SELECT real_estate_commercial($1,$2,$3) AS r", [
        organization,
        action,
        JSON.stringify({ ...filters, ...values }),
      ])
    ).rows[0].r;
  await db.exec(`SET test.actor='${actor}';SET ROLE authenticated`);
  const data = await call("summary");
  assert.equal(data.totals.received, 5);
  assert.equal(data.totals.waiting, 1);
  assert.equal(data.totals.active, 2);
  assert.equal(data.totals.overdue, 1);
  assert.equal(data.totals.unassigned, 1);
  assert.equal(data.totals.won, 1);
  assert.equal(data.totals.closed, 3);
  assert.equal(data.totals.legacy, 1);
  assert.equal(
    data.channels.reduce((n, r) => n + r.received, 0),
    5,
  );
  assert(data.responsibles.some((r) => r.id === actor));
  assert(!data.responsibles.some((r) => r.id === id(13)));
  for (const metric of ["received", "waiting", "active", "overdue", "unassigned", "won", "closed"])
    assert.equal(
      (await call("queue", { metric })).total,
      data.totals[metric],
      `indicador ${metric} abre a mesma contagem`,
    );
  const all = await call("queue");
  assert.deepEqual(
    new Set(all.items.map((r) => r.id)),
    new Set([9001, 9002, 9003, 9005, 9006].map(id)),
  );
  for (const channel of data.channels) {
    for (const metric of ["received", "active", "closed"])
      assert.equal(
        (await call("queue", { origin: channel.origin, metric })).total,
        channel[metric],
      );
    for (const reason of ["fechou_negocio", "desistiu", "sem_imovel", "outro", "legacy"])
      assert.equal(
        (await call("queue", { origin: channel.origin, metric: "closed", closure_reason: reason }))
          .total,
        channel[reason],
      );
  }
  assert.equal((await call("summary", { responsible: actor })).totals.received, 2);
  assert.equal((await call("summary", { responsible: "unassigned" })).totals.received, 3);
  assert.equal((await call("queue", { mine: true })).total, 2);
  assert.equal((await call("queue", { followup: "overdue" })).total, 1);
  assert.equal((await call("queue", { status: "encerrado" })).total, 3);
  assert.equal((await call("queue", { search: "Comercial 9001" })).items[0].id, id(9001));
  // UTC inclui e exclui linhas diferentes nos limites: o fuso precisa ser respeitado.
  const utc = await call("queue", { timezone: "UTC" });
  assert(utc.items.some((r) => r.id === id(9000)));
  assert(!utc.items.some((r) => r.id === id(9003)));
  for (const patch of [
    { date_from: "2026-02-30" },
    { date_from: "2026-10-03" },
    { date_from: "2020-01-01" },
    { timezone: "invalid/zone" },
    { origin: "invalid" },
    { metric: "invalid" },
    { closure_reason: "invalid" },
    { responsible: "not-uuid" },
  ])
    await assert.rejects(() => call("queue", patch));
  await assert.rejects(() => call("queue", { page: 0 }), /COMMERCIAL_INVALID/);
  await assert.rejects(() => call("summary", {}, other), /READ_DENIED/);
  await db.exec("RESET ROLE");
  for (let n = 0; n < 25; n++)
    await db.query(
      `INSERT INTO fluxa_inquiry_private.requests(id,organization_id,name,phone,purpose,kind,origin,created_at,created_by,creation_hash) VALUES($1,$2,'Página comercial',$3,'locacao','informacao','outro','2026-10-02T12:00:00Z',$4,md5('page'))`,
      [id(9100 + n), org, `552799998${String(n).padStart(4, "0")}`, actor],
    );
  await db.exec("SET ROLE authenticated");
  const a = await call("queue", { origin: "outro" }),
    b = await call("queue", { origin: "outro", page: 2 });
  assert.equal(a.total, 25);
  assert.equal(a.items.length, 20);
  assert.equal(b.items.length, 5);
  assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 25);
  await db.exec(`RESET ROLE;SET test.actor='${viewer}';SET ROLE authenticated`);
  assert.equal((await call("summary")).totals.received, 30);
  await db.exec(`RESET ROLE;SET test.actor='${external}';SET ROLE authenticated`);
  await assert.rejects(() => call("summary"), /READ_DENIED/);
  await db.exec(`RESET ROLE;SET test.actor='${id(13)}';SET ROLE authenticated`);
  await assert.rejects(() => call("summary"), /READ_DENIED/);
  await db.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(() => call("summary"), /permission denied/);
  await assert.rejects(
    () =>
      db.query("SELECT * FROM fluxa_inquiry_private.commercial_scope($1,$2)", [
        org,
        JSON.stringify(filters),
      ]),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
  assert.equal(
    (
      await db.query(
        "SELECT prosecdef FROM pg_proc WHERE oid='public.real_estate_commercial(uuid,text,jsonb)'::regprocedure",
      )
    ).rows[0].prosecdef,
    false,
  );
  console.log(
    "Painel comercial: contagens, limites de data/fuso, canais, motivos, responsável, atalhos coerentes, paginação e isolamento OK.",
  );
}
