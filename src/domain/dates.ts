const monthIndex: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

const monthLabels = Object.keys(monthIndex);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function fromParts(year: string, month: string, day: string, hour = "0", minute = "0") {
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

function parseExcelSerialDate(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const serial = Number(raw);
  if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return null;
  const date = new Date(1899, 11, 30);
  date.setDate(date.getDate() + Math.floor(serial));
  return date;
}

export function formatDisplayDate(value: Date): string {
  const label = monthLabels[value.getMonth()] || "";
  return `${pad(value.getDate())} ${label} ${value.getFullYear()}`;
}

export function formatDisplayTimestamp(value: Date): string {
  return `${formatDisplayDate(value)} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function parseWorkTimestamp(value: string): Date | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;

  const display = raw.match(/^(\d{1,2})\s([A-Z]{3})\s(\d{4})\s(\d{1,2}):(\d{2})$/);
  if (display) {
    const [, day, month, year, hour, minute] = display;
    const index = monthIndex[month];
    return index == null ? null : new Date(Number(year), index, Number(day), Number(hour), Number(minute));
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (iso) return fromParts(iso[1], iso[2], iso[3], iso[4], iso[5]);

  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})/);
  if (slash) return fromParts(slash[3], slash[2], slash[1], slash[4], slash[5]);

  return null;
}

export function normalizeTimestamp(value: string): string {
  const parsed = parseWorkTimestamp(value);
  return parsed ? formatDisplayTimestamp(parsed) : String(value || "").trim();
}

export function normalizeServiceDate(value: string): string {
  const raw = String(value || "").trim();
  const parsedTimestamp = parseWorkTimestamp(raw);
  if (parsedTimestamp) return formatDisplayDate(parsedTimestamp);

  const parsedWithTime = parseWorkTimestamp(`${raw} 00:00`);
  if (parsedWithTime) return formatDisplayDate(parsedWithTime);

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return formatDisplayDate(fromParts(iso[1], iso[2], iso[3]));

  const serial = parseExcelSerialDate(raw);
  if (serial) return formatDisplayDate(serial);

  return raw.toUpperCase();
}

export function formatInvoicePeriod(jobDate: string): string {
  const match = String(jobDate || "").match(/^(\d{1,2})\s([A-Z]{3})\s(\d{4})$/);
  return match ? `${match[2]} ${match[3]}` : jobDate || "-";
}

export function getShiftLabelForDate(date: Date): "08:00-18:00" | "18:00-08:00" | "Weekend / Holiday" {
  const day = date.getDay();
  const hour = date.getHours();
  if (day === 0 || day === 6) return "Weekend / Holiday";
  return hour >= 8 && hour < 18 ? "08:00-18:00" : "18:00-08:00";
}
