export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

/**
 * Kiwify delivers production events inside an `order` envelope. Keeping the
 * flat fallback preserves compatibility with dashboard test payloads and old
 * retries that were sent without the envelope.
 */
export function extractKiwifyOrder(value: unknown): JsonRecord {
  const envelope = asRecord(value);
  const order = asRecord(envelope.order);
  return Object.keys(order).length > 0 ? order : envelope;
}
