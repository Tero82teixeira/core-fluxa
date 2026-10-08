import { z } from "zod";

export const PROPERTY_TYPES = {
  casa: "Casa",
  apartamento: "Apartamento",
  terreno: "Terreno",
  comercial: "Comercial",
  rural: "Rural",
  outro: "Outro",
} as const;
export const PROPERTY_PURPOSES = {
  venda: "Venda",
  locacao: "Locação",
  venda_locacao: "Venda e locação",
} as const;
export const PROPERTY_STATUSES = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  alugado: "Alugado",
  inativo: "Inativo",
} as const;
export const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
export const PROPERTY_WRITE_ROLES = [
  "superadmin",
  "proprietario",
  "administrador",
  "gestor",
  "operacional",
] as const;
export function canWriteProperties(role: string | null) {
  return PROPERTY_WRITE_ROLES.some((allowed) => allowed === role);
}

export function parsePropertyDecimal(value: string): number | null {
  const clean = value.trim();
  if (!clean) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(clean))
    throw new Error("Use números sem separador de milhar, como 250000,00.");
  const number = Number(clean.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0 || number >= 1_000_000_000_000)
    throw new Error("Informe um valor maior que zero e menor que um trilhão.");
  return number;
}
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .transform((v) => v || null);
const decimal = z.string().transform((v, ctx) => {
  try {
    return parsePropertyDecimal(v);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
    return z.NEVER;
  }
});
export const propertyFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{1,30}$/, "Código: até 30 letras, números, hífen ou sublinhado."),
    title: z.string().trim().min(1, "Informe o título do imóvel.").max(160),
    property_type: z.enum(["casa", "apartamento", "terreno", "comercial", "rural", "outro"]),
    purpose: z.enum(["venda", "locacao", "venda_locacao"]),
    status: z.enum(["disponivel", "reservado", "vendido", "alugado", "inativo"]),
    owner_client_id: z.string().uuid("Escolha um proprietário cadastrado."),
    responsible_user_id: z
      .string()
      .transform((v) => v || null)
      .pipe(z.string().uuid().nullable()),
    zip_code: z
      .string()
      .transform((v) => v.replace(/\D/g, "") || null)
      .pipe(
        z
          .string()
          .regex(/^\d{8}$/, "Informe um CEP com 8 dígitos.")
          .nullable(),
      ),
    street: z.string().trim().min(1, "Informe o logradouro.").max(160),
    number: optionalText(30),
    complement: optionalText(100),
    district: optionalText(100),
    city: z.string().trim().min(1, "Informe a cidade.").max(100),
    state: z.enum(BRAZIL_STATES),
    sale_price: decimal,
    rent_price: decimal,
    area_m2: decimal.refine((v) => v === null || v < 10_000_000_000, "Área acima do limite."),
    notes: optionalText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.purpose !== "locacao" && v.sale_price === null)
      ctx.addIssue({ code: "custom", path: ["sale_price"], message: "Informe o valor de venda." });
    if (v.purpose !== "venda" && v.rent_price === null)
      ctx.addIssue({ code: "custom", path: ["rent_price"], message: "Informe o aluguel mensal." });
    if (v.status === "vendido" && v.purpose === "locacao")
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Um imóvel apenas para locação não pode ficar vendido.",
      });
    if (v.status === "alugado" && v.purpose === "venda")
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Um imóvel apenas para venda não pode ficar alugado.",
      });
  })
  .transform((v) => ({
    ...v,
    sale_price: v.purpose === "locacao" ? null : v.sale_price,
    rent_price: v.purpose === "venda" ? null : v.rent_price,
  }));
export type PropertyForm = Omit<z.input<typeof propertyFormSchema>, "state"> & { state: string };
export type PropertyValues = z.output<typeof propertyFormSchema>;
export const emptyPropertyForm = (): PropertyForm => ({
  code: "",
  title: "",
  property_type: "casa",
  purpose: "venda",
  status: "disponivel",
  owner_client_id: "",
  responsible_user_id: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  sale_price: "",
  rent_price: "",
  area_m2: "",
  notes: "",
});
export function realEstateError(error: unknown): string {
  const e = error as { message?: string; code?: string };
  if (e?.code === "23505") return "Já existe um imóvel com esse código nesta empresa.";
  if (e?.message?.includes("REAL_ESTATE_CONFLICT"))
    return "O cadastro foi alterado ou já existe. Atualize a lista e abra o imóvel novamente antes de salvar.";
  if (e?.message?.includes("OWNER_INVALID"))
    return "Escolha um proprietário ativo da mesma empresa.";
  if (e?.message?.includes("RESPONSIBLE_INVALID"))
    return "Escolha um responsável ativo com acesso à operação imobiliária.";
  if (e?.code === "42501")
    return "Seu perfil ou a configuração da empresa não permite esta operação.";
  if (e?.code === "23514" || e?.code === "22023" || e?.code === "23502" || e?.code === "23503")
    return "Confira os campos e os vínculos do imóvel antes de salvar.";
  return "Não foi possível concluir a operação. Confira sua conexão e tente novamente.";
}
