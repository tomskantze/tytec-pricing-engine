import { formatInvoicePeriod } from "./dates";
import { RETAINER_ARTICLE_NUMBER, formatFortnoxArticleNumbers } from "./fortnoxArticles";
import { formatAmount, formatHours, formatJobTotal, formatOptionalAmount } from "./money";
import type { Customer, InvoiceBatch, PricedJob, QueueState, SlaLine } from "./types";

function invoiceStatus(items: PricedJob[]): QueueState | "Sent" {
  if (!items.length) return "Blocked";
  if (items.every((job) => job.queueState === "Invoiced")) return "Sent";
  if (items.every((job) => job.queueState === "Ready")) return "Ready";
  return "Blocked";
}

function normalizeEntity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slaAttributionLabel(value: string | undefined): string {
  return value ? `End Customer: ${value}` : "Customer (direct)";
}

function getSlaLines(customer: Customer, businessEntity: string): SlaLine[] {
  return customer.locationCards
    .filter((card) => card.slaEnabled && card.slaAmount > 0)
    .filter((card) => normalizeEntity(card.slaAttributedTo || customer.name) === normalizeEntity(businessEntity))
    .map((card) => ({
      articleNumber: RETAINER_ARTICLE_NUMBER,
      label: `${card.city} SLA (${slaAttributionLabel(card.slaAttributedTo)})`,
      amount: card.slaAmount,
      currency: card.currency || "EUR",
    }));
}

function batchTotal(items: PricedJob[], slaTotal: number): number | null {
  if (items.some((job) => job.totalAmount == null)) return null;
  return items.reduce((sum, job) => sum + (job.totalAmount ?? 0), slaTotal);
}

function entityLabel(job: PricedJob, customer: Customer) {
  return job.businessEntity || customer.name;
}

function entityToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function buildInvoiceBatches(customer: Customer, jobs: PricedJob[], includeSla: boolean): InvoiceBatch[] {
  const rows: InvoiceBatch[] = [];
  const taskJobs = jobs.filter((job) => job.invoiceMode === "task");
  const monthlyJobs = jobs.filter((job) => job.invoiceMode !== "task");

  taskJobs.forEach((job) => {
    rows.push({
      batch: `JOB-${job.ticket || job.id}`,
      customer: entityLabel(job, customer),
      businessEntity: entityLabel(job, customer),
      invoiceMode: "Per Task",
      period: job.date,
      jobs: 1,
      total: job.totalAmount,
      currency: job.currency,
      status: invoiceStatus([job]),
      slaLines: [],
      slaTotal: 0,
      items: [job],
    });
  });

  const grouped = monthlyJobs.reduce<Record<string, PricedJob[]>>((accumulator, job) => {
    const period = formatInvoicePeriod(job.date);
    const key = `${entityLabel(job, customer)}||${period}`;
    accumulator[key] ||= [];
    accumulator[key].push(job);
    return accumulator;
  }, {});

  Object.entries(grouped).forEach(([key, periodJobs]) => {
    const [businessEntity, period] = key.split("||");
    const slaLines = getSlaLines(customer, businessEntity);
    const slaTotal = slaLines.reduce((sum, line) => sum + line.amount, 0);
    const includedSlaTotal = includeSla ? slaTotal : 0;
    const currency = periodJobs[0]?.currency || slaLines[0]?.currency || "EUR";
    rows.push({
      batch: `INV-${customer.customerKey}-${entityToken(businessEntity)}-${period.replace(/\s+/g, "")}`,
      customer: businessEntity,
      businessEntity,
      invoiceMode: "Monthly",
      period,
      jobs: periodJobs.length,
      total: batchTotal(periodJobs, includedSlaTotal),
      currency,
      status: invoiceStatus(periodJobs),
      slaLines,
      slaTotal: includedSlaTotal,
      items: periodJobs,
    });
  });

  return rows.sort((left, right) => left.period.localeCompare(right.period));
}

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function invoiceBatchToCsv(batch: InvoiceBatch, includeSla = true): string {
  const header = ["Tytec Ticket", "Fortnox Articles", "Jira Summary", "Date", "Customer Ticket", "Consumables", "City", "Call-Out Fee", "BH", "BH Amount", "OBH", "OBH Amount", "WH", "WH Amount", "Final"];
  const lines = [header.map(csvEscape).join(",")];
  const articleIndex = header.indexOf("Fortnox Articles");
  const summaryIndex = header.indexOf("Jira Summary");
  const finalIndex = header.indexOf("Final");

  batch.items.forEach((job) => {
    const breakdown = job.pricing;
    const hasManualLabor = job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null;
    const row = [
      job.jiraIssueKey,
      formatFortnoxArticleNumbers(breakdown?.lineItems, ""),
      job.jiraSummary || job.summary,
      job.date,
      job.ticket,
      formatOptionalAmount(job.currency, job.consumablesAmount),
      job.city || "-",
      hasManualLabor ? "-" : breakdown?.crossedShift ? "Split Shift" : formatOptionalAmount(job.currency, breakdown?.callOutFee || 0),
      hasManualLabor ? "-" : formatHours(breakdown?.hours.bh || 0),
      hasManualLabor ? "-" : formatOptionalAmount(job.currency, breakdown?.bhAmount || 0),
      hasManualLabor ? "-" : formatHours(breakdown?.hours.obh || 0),
      hasManualLabor ? "-" : formatOptionalAmount(job.currency, breakdown?.obhAmount || 0),
      hasManualLabor ? "-" : formatHours(breakdown?.hours.wh || 0),
      hasManualLabor ? "-" : formatOptionalAmount(job.currency, breakdown?.whAmount || 0),
      formatJobTotal(job.currency, job.totalAmount),
    ];
    lines.push(row.map(csvEscape).join(","));
  });

  batch.slaLines.forEach((line) => {
    const label = includeSla ? line.label : `${line.label} (excluded)`;
    const row = Array(header.length).fill("");
    row[articleIndex] = line.articleNumber || "";
    row[summaryIndex] = label;
    row[finalIndex] = formatAmount(line.currency, line.amount);
    lines.push(row.map(csvEscape).join(","));
  });
  const totalRow = Array(header.length).fill("");
  totalRow[summaryIndex] = "Total";
  totalRow[finalIndex] = formatJobTotal(batch.currency, batch.total);
  lines.push(totalRow.map(csvEscape).join(","));
  return lines.join("\n");
}
