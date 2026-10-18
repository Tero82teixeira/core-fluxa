import { buildDemoInquiries, type DemoInquiry } from "./real-estate-demo-inquiries.ts";
import type { CommercialRow } from "./real-estate-commercial.ts";
export const COMMERCIAL_DEMO_NOW = new Date("2026-10-16T12:00:00Z");
export function buildCommercialDemoInquiries(): DemoInquiry[] {
  const sample = buildDemoInquiries()[0];
  return [
    sample,
    {
      ...sample,
      id: "PEDIDO-COMERCIAL-002",
      clientKey: undefined,
      name: "Rafael Souza",
      phone: "27999990002",
      createdAt: "2026-10-13T12:00:00Z",
      origin: "whatsapp",
      purpose: "locacao",
      listingId: "IMOV-002",
      kind: "informacao",
      stage: "em_contato",
      assigned: true,
      nextContactAt: "2026-10-18T12:00:00Z",
    },
    {
      ...sample,
      id: "PEDIDO-COMERCIAL-003",
      clientKey: undefined,
      name: "Carla Mendes",
      phone: "27999990003",
      createdAt: "2026-10-12T12:00:00Z",
      origin: "telefone",
      purpose: "venda",
      listingId: "IMOV-005",
      kind: "informacao",
      stage: "em_contato",
      assigned: true,
      closed: true,
      closureReason: "fechou_negocio",
      closureNote: "Conclusão fictícia informada pela equipe.",
      nextContactAt: undefined,
    },
    {
      ...sample,
      id: "PEDIDO-COMERCIAL-004",
      clientKey: undefined,
      name: "Bruno Lima",
      phone: "27999990004",
      createdAt: "2026-10-11T12:00:00Z",
      origin: "presencial",
      purpose: "locacao",
      listingId: "",
      kind: "informacao",
      assigned: false,
      closed: true,
      closureReason: "desistiu",
      closureNote: "Desistência fictícia.",
      nextContactAt: undefined,
    },
    {
      ...sample,
      id: "PEDIDO-COMERCIAL-005",
      clientKey: undefined,
      name: "Paula Alves",
      phone: "27999990005",
      createdAt: "2026-10-16T12:00:00Z",
      origin: "outro",
      purpose: "venda",
      listingId: "",
      kind: "informacao",
      assigned: false,
      nextContactAt: undefined,
    },
  ];
}
export function demoCommercialRows(rows: DemoInquiry[]): CommercialRow[] {
  return rows.map((r) => ({
    id: r.id,
    created_at: r.createdAt || "2026-10-16T12:00:00Z",
    origin: r.origin || "vitrine",
    status: r.closed ? "encerrado" : r.stage === "novo" ? "novo" : "em_contato",
    responsible_user_id: r.assigned ? "demo" : null,
    closure_reason: r.closureReason || null,
    next_contact_at: r.nextContactAt || null,
  }));
}
