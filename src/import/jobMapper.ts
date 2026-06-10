import { formatDisplayDate, normalizeServiceDate, normalizeTimestamp, parseWorkTimestamp } from "../domain/dates";
import { ensureUniqueJobIds } from "../domain/jobIds";
import { parseAmount } from "../domain/money";
import type { ImportResult, JobInput } from "../domain/types";
import { parseDelimited } from "./csv";

const aliases = {
  ticket: ["ticket", "ticket id", "source ticket", "source ticket id", "case", "case id", "job", "job id"],
  date: ["date", "service date", "work date", "job date", "completed date"],
  customerRef: ["customer ref", "customer reference", "po", "po number", "order", "order number", "reference"],
  city: ["city", "site city", "location", "metro", "pop", "site"],
  country: ["country", "site country"],
  endCustomer: ["end customer", "endcustomer", "client", "site customer"],
  technician: ["technician", "engineer", "assigned technician", "resource"],
  summary: ["summary", "description", "scope", "job summary", "sow"],
  reportStatus: ["report status", "status", "work report status", "result"],
  completionNotes: ["completion notes", "notes", "note", "work notes"],
  travelStart: ["travel start", "travelstart", "departed", "travel from"],
  onSite: ["on site", "onsite", "arrival", "arrived", "site arrival", "work start", "start"],
  offSite: ["off site", "offsite", "departure", "left site", "site departure", "work end", "end"],
  travelFinish: ["travel finish", "travelfinish", "returned", "travel to"],
  consumables: ["consumables", "material", "materials", "expenses", "parts amount"],
  consumablesDescription: ["consumables description", "materials description", "parts", "expense note"],
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildLookup(row: Record<string, string>): Record<string, string> {
  return Object.entries(row).reduce<Record<string, string>>((lookup, [key, value]) => {
    lookup[normalizeKey(key)] = value;
    return lookup;
  }, {});
}

function pick(lookup: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = lookup[normalizeKey(key)];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeDate(value: string, fallbackTimestamp: string): string {
  if (value) return normalizeServiceDate(value);
  const parsed = parseWorkTimestamp(fallbackTimestamp);
  return parsed ? formatDisplayDate(parsed) : "-";
}

function makeId(rowNumber: number, ticket: string): string {
  const token = ticket || `row-${rowNumber}`;
  return token.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `row-${rowNumber}`;
}

function rowToJob(row: Record<string, string>, index: number): JobInput {
  const lookup = buildLookup(row);
  const onSite = normalizeTimestamp(pick(lookup, aliases.onSite));
  const offSite = normalizeTimestamp(pick(lookup, aliases.offSite));
  const ticket = pick(lookup, aliases.ticket);
  const date = normalizeDate(pick(lookup, aliases.date), onSite);

  return {
    id: makeId(index + 1, ticket),
    sourceRow: index + 2,
    date,
    ticket,
    customerRef: pick(lookup, aliases.customerRef),
    city: pick(lookup, aliases.city),
    country: pick(lookup, aliases.country),
    endCustomer: pick(lookup, aliases.endCustomer),
    technician: pick(lookup, aliases.technician),
    summary: pick(lookup, aliases.summary),
    reportStatus: pick(lookup, aliases.reportStatus),
    completionNotes: pick(lookup, aliases.completionNotes),
    travelStart: normalizeTimestamp(pick(lookup, aliases.travelStart)),
    onSite,
    offSite,
    travelFinish: normalizeTimestamp(pick(lookup, aliases.travelFinish)),
    consumablesAmount: parseAmount(pick(lookup, aliases.consumables)),
    consumablesDescription: pick(lookup, aliases.consumablesDescription),
    raw: row,
  };
}

function jsonRows(payload: unknown): Record<string, string>[] {
  const source = Array.isArray(payload) ? payload : (payload as { jobs?: unknown[] })?.jobs;
  if (!Array.isArray(source)) return [];
  return source.map((item) =>
    Object.entries((item || {}) as Record<string, unknown>).reduce<Record<string, string>>((record, [key, value]) => {
      record[key] = value == null ? "" : String(value);
      return record;
    }, {}),
  );
}

export function importJobsFromText(text: string, fileName = "report"): ImportResult {
  const warnings: string[] = [];
  const trimmed = text.trim();
  let rows: Record<string, string>[] = [];

  if (fileName.toLowerCase().endsWith(".json") || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      rows = jsonRows(JSON.parse(trimmed));
    } catch {
      warnings.push("JSON report could not be parsed.");
    }
  } else {
    rows = parseDelimited(text).rows;
  }

  const jobs = ensureUniqueJobIds(rows.map(rowToJob).filter((job) => Object.values(job.raw).some(Boolean)));
  if (!jobs.length) warnings.push("No job rows were found in the uploaded report.");
  return { jobs, warnings };
}
