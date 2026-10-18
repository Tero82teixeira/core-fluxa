export function legalToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validLegalDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  )
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function legalAgendaRange(date: string, view: "day" | "week") {
  if (!validLegalDate(date)) throw new Error("Data inválida");
  const start = new Date(`${date}T12:00:00`);
  if (view === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const civil = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startDate = civil(start);
  start.setDate(start.getDate() + (view === "week" ? 7 : 1));
  const endDate = civil(start);
  return {
    startDate,
    endDate,
    from: new Date(`${startDate}T00:00:00`).toISOString(),
    to: new Date(`${endDate}T00:00:00`).toISOString(),
  };
}
