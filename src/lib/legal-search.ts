/** CNJ completo ou prefixo com ao menos sete dígitos, com ou sem máscara. */
export function legalCnjSearch(value: string): string | null {
  const match = value.trim().match(/^(?:cnj\s*:?\s*)?([\d.\-\s]+)$/i);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, "");
  const explicit = /^cnj\s*:?/i.test(value.trim());
  return digits.length === 20 || (explicit && digits.length >= 7 && digits.length <= 20)
    ? digits
    : null;
}

export function formatCnjNumber(value: string | null | undefined) {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 20);
  const parts = [
    digits.slice(0, 7),
    digits.slice(7, 9),
    digits.slice(9, 13),
    digits.slice(13, 14),
    digits.slice(14, 16),
    digits.slice(16, 20),
  ].filter(Boolean);
  if (digits.length <= 7) return parts[0] ?? "";
  if (digits.length <= 9) return `${parts[0]}-${parts[1]}`;
  if (digits.length <= 13) return `${parts[0]}-${parts[1]}.${parts[2]}`;
  if (digits.length <= 14) return `${parts[0]}-${parts[1]}.${parts[2]}.${parts[3]}`;
  if (digits.length <= 16) return `${parts[0]}-${parts[1]}.${parts[2]}.${parts[3]}.${parts[4]}`;
  return `${parts[0]}-${parts[1]}.${parts[2]}.${parts[3]}.${parts[4]}.${parts[5]}`;
}

export function legalCnjSearchParameter(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{7,20}$/.test(value) ? value : undefined;
}
