/**
 * Validação e normalização de dados de clientes.
 * Mensagens em português, específicas por campo.
 */
import { digits, isValidCPF, isValidCNPJ } from "@/lib/format";
import type { ClientStatus } from "@/lib/domain";

export const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI",
  "RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

export type ClientFormValues = {
  person_type: "pf" | "pj";
  name: string;
  trade_name: string;
  document: string;
  birth_date: string;
  legal_rep_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  owner_name: string;
  status: string;
  notes: string;
};

export const emptyClientForm = (): ClientFormValues => ({
  person_type: "pf",
  name: "",
  trade_name: "",
  document: "",
  birth_date: "",
  legal_rep_name: "",
  email: "",
  phone: "",
  whatsapp: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  owner_name: "",
  status: "ativo",
  notes: "",
});

export type FieldErrors = Partial<Record<keyof ClientFormValues, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function phoneError(value: string, label: string): string | undefined {
  const d = digits(value);
  if (!d) return undefined;
  if (d.length < 10 || d.length > 11) return `Informe o ${label} com DDD.`;
  if (Number(d.slice(0, 2)) < 11) return `Informe o ${label} com DDD.`;
  return undefined;
}

/** Valida o formulário completo e devolve os erros por campo. */
export function validateClientForm(values: ClientFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const isPJ = values.person_type === "pj";

  if (!values.name.trim()) {
    errors.name = isPJ ? "Informe a razão social." : "Informe o nome completo.";
  }

  const doc = digits(values.document);
  if (doc) {
    if (isPJ && !isValidCNPJ(doc)) errors.document = "Informe um CNPJ válido.";
    if (!isPJ && !isValidCPF(doc)) errors.document = "Informe um CPF válido.";
  }

  if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) {
    errors.email = "Informe um e-mail válido.";
  }

  const phoneErr = phoneError(values.phone, "telefone");
  if (phoneErr) errors.phone = phoneErr;
  const whatsErr = phoneError(values.whatsapp, "WhatsApp");
  if (whatsErr) errors.whatsapp = whatsErr;

  if (values.state.trim() && !UF_LIST.includes(values.state.trim().toUpperCase() as never)) {
    errors.state = "Informe uma UF válida.";
  }

  const zip = digits(values.zip_code);
  if (zip && zip.length !== 8) errors.zip_code = "Informe um CEP com oito dígitos.";

  if (!isPJ && values.birth_date) {
    const date = new Date(`${values.birth_date}T12:00:00`);
    if (Number.isNaN(date.getTime()) || date > new Date()) {
      errors.birth_date = "Informe uma data de nascimento válida.";
    }
  }

  return errors;
}

const nullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Converte o formulário no payload gravado no banco (documentos apenas com dígitos). */
export function toClientPayload(values: ClientFormValues) {
  const isPJ = values.person_type === "pj";
  const doc = digits(values.document);
  return {
    person_type: values.person_type,
    name: values.name.trim(),
    trade_name: isPJ ? nullable(values.trade_name) : null,
    document: doc || null,
    document_digits: doc || null,
    birth_date: !isPJ ? nullable(values.birth_date) : null,
    legal_rep_name: isPJ ? nullable(values.legal_rep_name) : null,
    email: nullable(values.email)?.toLowerCase() ?? null,
    phone: digits(values.phone) || null,
    whatsapp: digits(values.whatsapp) || null,
    zip_code: digits(values.zip_code) || null,
    street: nullable(values.street),
    number: nullable(values.number),
    complement: nullable(values.complement),
    district: nullable(values.district),
    city: nullable(values.city),
    state: values.state.trim() ? values.state.trim().toUpperCase() : null,
    owner_name: nullable(values.owner_name),
    status: values.status as ClientStatus,
    notes: nullable(values.notes),
  };
}

/** Mensagem específica para documento já cadastrado na mesma empresa. */
export function duplicateDocumentMessage(personType: "pf" | "pj") {
  return personType === "pj"
    ? "Já existe uma empresa com este CNPJ."
    : "Já existe um cliente com este CPF.";
}
