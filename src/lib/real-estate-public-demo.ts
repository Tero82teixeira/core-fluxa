/** Cenário público inteiramente fictício, sem banco, autenticação ou persistência. */
import type { SettlementRow } from "./real-estate-settlements.ts";
import { realEstateFinancialSummary } from "./real-estate-finance.ts";

export const REAL_ESTATE_DEMO_DATE = "2026-10-16";
export type DemoProperty = {
  id: string;
  titleKey: string;
  owner: string;
  purpose: "locacao" | "venda";
  amount: number;
};
export type DemoProposal = {
  id: string;
  property: string;
  interested: string;
  amount: number;
  validUntil: string;
  status: "aberta" | "contraproposta" | "aceita" | "recusada";
};
export type DemoContract = {
  id: string;
  property: string;
  proposal: string;
  startsOn: string;
  endsOn: string | null;
  amount: number;
};
export type RealEstateDemo = {
  properties: DemoProperty[];
  proposals: DemoProposal[];
  contracts: DemoContract[];
  settlements: SettlementRow[];
};
export type RealEstateDemoAction = {
  type: "accept" | "refuse" | "contract" | "settlement" | "receive" | "pay";
  id: string;
};

function settlement(
  property: DemoProperty,
  contract: DemoContract,
  reference: string,
  id: string,
): SettlementRow {
  const commission = Math.round(contract.amount * 10) / 100;
  return {
    id,
    contract_id: contract.id,
    property_id: property.id,
    property_code: property.id,
    contract_reference: contract.id,
    owner_client_id: `owner-${property.id}`,
    owner_name: property.owner,
    reference,
    gross: contract.amount,
    commission_type: "percentual",
    commission_value: 10,
    commission_amount: commission,
    owner_amount: Math.round((contract.amount - commission) * 100) / 100,
    due_on: "2026-10-20",
    action: "criado",
    occurred_on: null,
    note: "",
    version: 1,
    status: "previsto",
    display_status: "previsto",
  };
}

export function buildRealEstateDemo(): RealEstateDemo {
  const properties: DemoProperty[] = [
    { id: "IMOV-001", titleKey: "house", owner: "Ana Lima", purpose: "locacao", amount: 2100 },
    {
      id: "IMOV-002",
      titleKey: "apartment",
      owner: "Carlos Prado",
      purpose: "locacao",
      amount: 1600,
    },
    {
      id: "IMOV-003",
      titleKey: "commercial",
      owner: "Beatriz Reis",
      purpose: "venda",
      amount: 480000,
    },
  ];
  const proposals: DemoProposal[] = [
    {
      id: "PROP-DEMO-001",
      property: "IMOV-001",
      interested: "Marina Costa",
      amount: 2100,
      validUntil: "2026-10-20",
      status: "aberta",
    },
    {
      id: "PROP-DEMO-002",
      property: "IMOV-002",
      interested: "Lucas Rocha",
      amount: 1600,
      validUntil: "2026-10-10",
      status: "aceita",
    },
    {
      id: "PROP-DEMO-003",
      property: "IMOV-003",
      interested: "Júlia Alves",
      amount: 480000,
      validUntil: "2026-10-15",
      status: "contraproposta",
    },
  ];
  const contracts: DemoContract[] = [
    {
      id: "CT-DEMO-002",
      property: "IMOV-002",
      proposal: "PROP-DEMO-002",
      startsOn: "2026-09-01",
      endsOn: "2026-10-23",
      amount: 1600,
    },
  ];
  const paid = settlement(properties[1], contracts[0], "2026-09", "REP-DEMO-001");
  const late = settlement(properties[1], contracts[0], "2026-10", "REP-DEMO-002");
  return {
    properties,
    proposals,
    contracts,
    settlements: [
      {
        ...paid,
        status: "repassado",
        display_status: "repassado",
        action: "repassado",
        version: 3,
        due_on: "2026-09-10",
        occurred_on: "2026-09-10",
      },
      {
        ...late,
        status: "recebido",
        display_status: "atrasado",
        action: "recebido",
        version: 2,
        due_on: "2026-10-15",
        occurred_on: "2026-10-14",
      },
    ],
  };
}

/** Ações repetidas ou fora de ordem não produzem registros extras. */
export function applyRealEstateDemoAction(
  data: RealEstateDemo,
  action: RealEstateDemoAction,
): RealEstateDemo {
  if (action.type === "accept" || action.type === "refuse") {
    const proposal = data.proposals.find((p) => p.id === action.id);
    if (!proposal || !["aberta", "contraproposta"].includes(proposal.status)) return data;
    // Uma proposta vencida continua visível, mas precisa de revisão no sistema real.
    if (action.type === "accept" && proposal.validUntil < REAL_ESTATE_DEMO_DATE) return data;
    return {
      ...data,
      proposals: data.proposals.map((p) =>
        p.id === action.id ? { ...p, status: action.type === "accept" ? "aceita" : "recusada" } : p,
      ),
    };
  }
  if (action.type === "contract") {
    const proposal = data.proposals.find((p) => p.id === action.id);
    if (
      !proposal ||
      proposal.status !== "aceita" ||
      data.contracts.some((c) => c.proposal === proposal.id)
    )
      return data;
    const property = data.properties.find((p) => p.id === proposal.property);
    if (!property) return data;
    return {
      ...data,
      contracts: [
        ...data.contracts,
        {
          id: `CT-DEMO-${property.id.slice(-3)}`,
          property: property.id,
          proposal: proposal.id,
          startsOn: "2026-10-01",
          endsOn: property.purpose === "locacao" ? "2027-09-30" : null,
          amount: proposal.amount,
        },
      ],
    };
  }
  if (action.type === "settlement") {
    const contract = data.contracts.find((c) => c.id === action.id);
    const property = data.properties.find((p) => p.id === contract?.property);
    if (
      !contract ||
      !property ||
      data.settlements.some((s) => s.contract_id === contract.id && s.reference === "2026-10")
    )
      return data;
    return {
      ...data,
      settlements: [
        ...data.settlements,
        settlement(property, contract, "2026-10", `REP-${contract.id}`),
      ],
    };
  }
  const row = data.settlements.find((s) => s.id === action.id);
  if (!row || (action.type === "receive" ? row.status !== "previsto" : row.status !== "recebido"))
    return data;
  const status = action.type === "receive" ? "recebido" : "repassado";
  return {
    ...data,
    settlements: data.settlements.map((s) =>
      s.id === row.id
        ? {
            ...s,
            status,
            display_status:
              status === "recebido" && s.due_on < REAL_ESTATE_DEMO_DATE ? "atrasado" : status,
            action: status,
            occurred_on: REAL_ESTATE_DEMO_DATE,
            version: s.version + 1,
          }
        : s,
    ),
  };
}

export function realEstateDemoSummary(data: RealEstateDemo) {
  const received = data.settlements.filter(
    (s) => s.status === "recebido" || s.status === "repassado",
  );
  return {
    proposals: data.proposals.filter((p) => p.status === "aberta" || p.status === "contraproposta")
      .length,
    contracts: data.contracts.filter(
      (c) => c.startsOn <= REAL_ESTATE_DEMO_DATE && c.endsOn !== null && c.endsOn <= "2026-11-15",
    ).length,
    late: data.settlements.filter(
      (s) => s.status === "recebido" && s.due_on < REAL_ESTATE_DEMO_DATE,
    ).length,
    ...realEstateFinancialSummary({
      commission_received:
        received.reduce((sum, s) => sum + Math.round(s.commission_amount * 100), 0) / 100,
      owner_pending:
        received
          .filter((s) => s.status === "recebido")
          .reduce((sum, s) => sum + Math.round(s.owner_amount * 100), 0) / 100,
      owner_paid:
        received
          .filter((s) => s.status === "repassado")
          .reduce((sum, s) => sum + Math.round(s.owner_amount * 100), 0) / 100,
    }),
  };
}

export function realEstateDemoMatches(
  data: RealEstateDemo,
  propertyId: string,
  query: string,
  title = "",
) {
  const property = data.properties.find((p) => p.id === propertyId);
  if (!property) return false;
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const text = [
    property.id,
    property.owner,
    title,
    ...data.proposals.filter((p) => p.property === propertyId).map((p) => p.interested),
    ...data.contracts.filter((c) => c.property === propertyId).map((c) => c.id),
  ].join(" ");
  return normalize(text).includes(normalize(query.trim()));
}
