import {
  validateManualAttendance,
  validClosure,
  CLOSURE_REASONS,
  type ManualAttendanceValues,
} from "./real-estate-manual-attendance.ts";
/** Fluxo de atendimento fictício, sem rede nem persistência. */
export type DemoInquiry = {
  createdAt?: string;
  origin?: "vitrine" | "whatsapp" | "telefone" | "presencial" | "outro";
  purpose?: "venda" | "locacao";
  closed?: boolean;
  closureReason?: keyof typeof CLOSURE_REASONS;
  closureNote?: string;
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
      createdAt: "2026-10-14T15:00:00Z",
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
        !r.closed &&
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
      createdAt: "2026-10-16T12:00:00Z",
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
  if (row.closed) throw new Error("DEMO_INVALID");
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
  if (rows.find((r) => r.id === id)?.closed) throw new Error("DEMO_INVALID");
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

export function addManualDemoInquiry(
  rows: DemoInquiry[],
  input: ManualAttendanceValues,
  now = Date.parse("2026-10-16T12:00:00Z"),
): { rows: DemoInquiry[]; id: string; duplicate: boolean } {
  const v = validateManualAttendance(input, now);
  const phone = (s: string) => (s.length === 10 || s.length === 11 ? "55" + s : s);
  const existing = rows.find(
    (r) =>
      !r.listingId &&
      !r.closed &&
      phone(r.phone) === v.phone &&
      r.purpose === v.preferences.purpose,
  );
  if (existing) return { rows, id: existing.id, duplicate: true };
  const id = `PEDIDO-MANUAL-${rows.length + 1}`;
  return {
    id,
    duplicate: false,
    rows: [
      ...rows,
      {
        id,
        createdAt: new Date(now).toISOString(),
        listingId: "",
        name: v.name,
        phone: v.phone,
        origin: v.origin,
        purpose: v.preferences.purpose,
        kind: "informacao",
        preference: "",
        stage: "novo",
        assigned: Boolean(v.responsible_user_id),
        startsAt: "",
        confirmed: false,
        outcome: "",
        nextContactAt: v.next_contact_at || undefined,
        contacts: v.internal_note
          ? [{ note: v.internal_note, at: new Date(now).toISOString() }]
          : [],
      },
    ],
  };
}
export function closeDemoInquiry(
  rows: DemoInquiry[],
  id: string,
  reason: string,
  note: string,
  now = "2026-10-16T12:00:00Z",
): DemoInquiry[] {
  if (!validClosure(reason, note)) throw new Error("DEMO_INVALID");
  const row = rows.find((r) => r.id === id);
  if (!row || row.closed) throw new Error("DEMO_INVALID");
  return rows.map((r) =>
    r.id !== id
      ? r
      : {
          ...r,
          closed: true,
          closureReason: reason as keyof typeof CLOSURE_REASONS,
          closureNote: note.trim(),
          nextContactAt: undefined,
          contacts: [
            ...(r.contacts || []),
            {
              at: now,
              note: `Atendimento encerrado: ${CLOSURE_REASONS[reason as keyof typeof CLOSURE_REASONS]}. ${note.trim()}`,
            },
          ],
        },
  );
}
export function reopenDemoInquiry(rows: DemoInquiry[], id: string): DemoInquiry[] {
  const row = rows.find((r) => r.id === id);
  if (
    !row ||
    rows.some(
      (r) =>
        r.id !== id &&
        !r.closed &&
        r.listingId === row.listingId &&
        r.phone === row.phone &&
        r.purpose === row.purpose,
    )
  )
    throw new Error("DEMO_INVALID");
  return rows.map((r) =>
    r.id !== id ? r : { ...r, closed: false, closureReason: undefined, closureNote: undefined },
  );
}
export function attachDemoInquiry(
  rows: DemoInquiry[],
  id: string,
  listing: { id: string; purpose: string },
): DemoInquiry[] {
  const row = rows.find((r) => r.id === id);
  if (
    !row ||
    row.listingId ||
    row.closed ||
    row.purpose !== listing.purpose ||
    rows.some(
      (r) =>
        r.id !== id &&
        !r.closed &&
        r.listingId === listing.id &&
        r.phone === row.phone &&
        r.purpose === row.purpose,
    )
  )
    throw new Error("DEMO_INVALID");
  return rows.map((r) => (r.id !== id ? r : { ...r, listingId: listing.id }));
}
