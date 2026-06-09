export function parseAmount(value: unknown): number {
  if (value == null) return 0;
  const normalized = String(value).trim();
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "pending") return 0;
  const numeric = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatAmount(currency: string, value: number | null | undefined): string {
  if (value == null) return "Pending";
  const normalized = roundMoney(value).toFixed(2);
  return currency === "EUR" ? `€${normalized}` : `${currency} ${normalized}`;
}

export function formatOptionalAmount(currency: string, value: number): string {
  return value === 0 ? "-" : formatAmount(currency, value);
}

export function formatHours(hours: number): string {
  return hours > 0 ? `${hours.toFixed(2)} h` : "-";
}

export function formatJobTotal(currency: string, value: number | null): string {
  if (value == null) return "Pending";
  return value === 0 ? "-" : formatAmount(currency, value);
}
