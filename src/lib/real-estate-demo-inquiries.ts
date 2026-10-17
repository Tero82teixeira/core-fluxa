/** Fluxo de atendimento fictício, sem rede nem persistência. */
export type DemoInquiry = {
  clientKey?: string;
  nextContactAt?: string;
  contacts?: { note: string; at: string }[];
  id: string;
  listingId: string;
  name: string;
  phone: string;
  kind: "informacao" | "visita";
  preference: string;
  stage: "novo" | "em_contato" | "agendada" | "realizada" | "cancelada";
  assigned: boolean;
  startsAt: string;
  confirmed: boolean;
  outcome: string;
};
export function buildDemoInquiries(): DemoInquiry[] {
  return [
    {
      id: "PEDIDO-DEMO-001",
      clientKey: "marina",
      nextContactAt: "2026-10-15T12:00:00Z",
      listingId: "IMOV-005",
      name: "Marina Costa",
      phone: "27999990000",
      kind: "visita",
      preference: "2026-10-22",
      stage: "novo",
      assigned: false,
      startsAt: "",
      confirmed: false,
      outcome: "",
    },
  ];
}
export function addDemoInquiry(
  rows: DemoInquiry[],
  input: Pick<DemoInquiry, "listingId" | "name" | "phone" | "kind" | "preference">,
): DemoInquiry[] {
  const phone = input.phone.replace(/\D/g, "");
  if (input.name.trim().length < 2 || !/^\d{10,13}$/.test(phone)) throw new Error("DEMO_INVALID");
  if (
    rows.some(
      (r) =>
        r.listingId === input.listingId &&
        r.phone === phone &&
        !["realizada", "cancelada"].includes(r.stage),
    )
  )
    return rows;
  return [
    ...rows,
    {
      ...input,
      phone,
      name: input.name.trim(),
      id: `PEDIDO-DEMO-${rows.length + 1}`,
      stage: "novo",
      assigned: false,
      startsAt: "",
      confirmed: false,
      outcome: "",
    },
  ];
}
export function actDemoInquiry(
  rows: DemoInquiry[],
  id: string,
  action: "assign" | "schedule" | "confirm" | "realizada" | "cancelada",
  value = "",
): DemoInquiry[] {
  const row = rows.find((r) => r.id === id);
  if (!row) return rows;
  let changes: Partial<DemoInquiry> = {};
  if (action === "assign")
    changes = { assigned: true, stage: row.stage === "novo" ? "em_contato" : row.stage };
  if (action === "schedule") {
    const date = Date.parse(value);
    if (!row.assigned || !Number.isFinite(date) || date < Date.parse("2026-10-16T00:00:00Z"))
      throw new Error("DEMO_INVALID");
    if (
      rows.some(
        (r) =>
          r.id !== id &&
          r.stage === "agendada" &&
          Math.abs(Date.parse(r.startsAt) - date) < 3600000,
      )
    )
      throw new Error("DEMO_OVERLAP");
    changes = {
      startsAt: new Date(date).toISOString(),
      stage: "agendada",
      confirmed: false,
      outcome: "",
    };
  }
  if (action === "confirm") {
    if (row.stage !== "agendada") throw new Error("DEMO_INVALID");
    changes = { confirmed: true };
  }
  if (action === "realizada" || action === "cancelada") {
    if (row.stage !== "agendada" || !value.trim()) throw new Error("DEMO_INVALID");
    changes = { stage: action, outcome: value.trim(), confirmed: false };
  }
  return rows.map((r) => (r.id === id ? { ...r, ...changes } : r));
}

export function planDemoReturn(
  rows: DemoInquiry[],
  id: string,
  value: string,
  now = new Date("2026-10-16T12:00:00Z"),
) {
  if (value && (!Number.isFinite(Date.parse(value)) || Date.parse(value) <= now.getTime()))
    throw new Error("DEMO_INVALID");
  return rows.map((r) =>
    r.id === id ? { ...r, nextContactAt: value ? new Date(value).toISOString() : "" } : r,
  );
}
export function logDemoContact(
  rows: DemoInquiry[],
  id: string,
  note: string,
  next: string,
  now = new Date("2026-10-16T12:00:00Z"),
) {
  if (!note.trim() || note.trim().length > 2000) throw new Error("DEMO_INVALID");
  return planDemoReturn(rows, id, next, now).map((r) =>
    r.id === id
      ? { ...r, contacts: [...(r.contacts || []), { note: note.trim(), at: now.toISOString() }] }
      : r,
  );
}
