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
