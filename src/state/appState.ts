import { withAkamaiDefaults } from "../data/akamaiCustomer";
import { defaultTelesolCustomers, splitSharedTelesolLocationCards, telesolCustomer, telesolUsCustomer } from "../data/telesolCustomer";
import { defaultFortnoxArticles, withFortnoxArticleDefaults } from "../domain/fortnoxArticles";
import type { FortnoxArticleMap } from "../domain/fortnoxArticles";
import { ensureUniqueJobIds } from "../domain/jobIds";
import type { Customer, JiraIssue, JobInput, JobReviewOverride } from "../domain/types";
import type { SavedQuote } from "../modules/fortnox/quoteTypes";
import { repairCreatedJobFromRaw } from "../modules/create-job/createJobParser";
import { normalizeQuote } from "./quoteState";

export type ActiveView = "customers" | "fortnox" | "quote-builder";
export type CustomerWorkspaceTab = "overview" | "create-job" | "invoices" | "review-queue" | "technicians";

export type AppState = {
  activeView: ActiveView;
  customers: Customer[];
  fortnoxArticles: FortnoxArticleMap;
  selectedCustomerKey: string;
  selectedInvoiceCustomerKey: string;
  selectedFortnoxCustomerKey: string;
  quotes: SavedQuote[];
  customerWorkspaceTab: CustomerWorkspaceTab;
  importRuns: ImportRun[];
  activeImportRunId: string;
  customerJobs: JobInput[];
  jiraIssues: JiraIssue[];
  customerReportHeaders: string[];
  customerReportFileName: string;
  customerReportSheetName: string;
  jiraFileName: string;
  jobReviewOverrides: Record<string, JobReviewOverride>;
  jobs: JobInput[];
  includeSla: boolean;
  selectedBatch: string;
  filter: string;
  fileName: string;
  warnings: string[];
};

export type RunDocumentMeta = {
  id: string;
  kind: "customer-report" | "jira-report" | "invoice-pdf" | "payinfo-pdf";
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  previewUrl?: string;
  storedPath?: string;
};

export type ImportRun = {
  id: string;
  customerKey: string;
  label: string;
  invoiceMonth?: number;
  invoiceYear?: number;
  createdAt: string;
  updatedAt: string;
  customerJobs: JobInput[];
  jiraIssues: JiraIssue[];
  customerReportHeaders: string[];
  customerReportFileName: string;
  customerReportSheetName: string;
  jiraFileName: string;
  customerWarnings: string[];
  jiraWarnings: string[];
  warnings: string[];
  jobReviewOverrides: Record<string, JobReviewOverride>;
  jobs: JobInput[];
  selectedBatch: string;
  filter: string;
  documents: RunDocumentMeta[];
};

const storageKey = "tytec-pricing-engine:v1";
const telesolSlaEntity = "Telesol IT B.V.";

export const initialState: AppState = {
  activeView: "customers",
  customers: defaultTelesolCustomers,
  fortnoxArticles: defaultFortnoxArticles,
  selectedCustomerKey: "",
  selectedInvoiceCustomerKey: "",
  selectedFortnoxCustomerKey: "",
  quotes: [],
  customerWorkspaceTab: "overview",
  importRuns: [],
  activeImportRunId: "",
  customerJobs: [],
  jiraIssues: [],
  customerReportHeaders: [],
  customerReportFileName: "",
  customerReportSheetName: "",
  jiraFileName: "",
  jobReviewOverrides: {},
  jobs: [],
  includeSla: true,
  selectedBatch: "",
  filter: "",
  fileName: "",
  warnings: [],
};

type PersistedState = Partial<AppState> & {
  customer?: Customer;
};

function normalizeRun(run: Partial<ImportRun>, customerKey: string): ImportRun {
  const timestamp = run.createdAt || new Date().toISOString();
  const customerJobs = ensureUniqueJobIds(Array.isArray(run.customerJobs) ? run.customerJobs : []);
  const jobs = ensureUniqueJobIds(Array.isArray(run.jobs) ? run.jobs : []);
  return {
    id: run.id || `run-${Date.now()}`,
    customerKey: run.customerKey || customerKey,
    label: run.label || run.customerReportSheetName || run.customerReportFileName || "New run",
    invoiceMonth: typeof run.invoiceMonth === 'number' ? run.invoiceMonth : undefined,
    invoiceYear: typeof run.invoiceYear === 'number' ? run.invoiceYear : undefined,
    createdAt: timestamp,
    updatedAt: run.updatedAt || timestamp,
    customerJobs,
    jiraIssues: Array.isArray(run.jiraIssues) ? run.jiraIssues : [],
    customerReportHeaders: Array.isArray(run.customerReportHeaders) ? run.customerReportHeaders : [],
    customerReportFileName: run.customerReportFileName || "",
    customerReportSheetName: run.customerReportSheetName || "",
    jiraFileName: run.jiraFileName || "",
    customerWarnings: Array.isArray(run.customerWarnings) ? run.customerWarnings : [],
    jiraWarnings: Array.isArray(run.jiraWarnings) ? run.jiraWarnings : [],
    warnings: Array.isArray(run.warnings) ? run.warnings : [],
    jobReviewOverrides: run.jobReviewOverrides || {},
    jobs,
    selectedBatch: run.selectedBatch || "",
    filter: run.filter || "",
    documents: Array.isArray(run.documents) ? run.documents : [],
  };
}

function legacyRun(parsed: PersistedState): ImportRun | null {
  const hasLegacyData = [parsed.customerJobs, parsed.jiraIssues, parsed.jobs].some((value) => Array.isArray(value) && value.length);
  if (!hasLegacyData) return null;
  return normalizeRun({
    id: "legacy-import-run",
    customerKey: parsed.selectedInvoiceCustomerKey || "TELE",
    label: parsed.customerReportSheetName || parsed.customerReportFileName || parsed.fileName || "Imported report",
    customerJobs: parsed.customerJobs,
    jiraIssues: parsed.jiraIssues,
    customerReportHeaders: parsed.customerReportHeaders,
    customerReportFileName: parsed.customerReportFileName || parsed.fileName || "",
    customerReportSheetName: parsed.customerReportSheetName,
    jiraFileName: parsed.jiraFileName,
    jobReviewOverrides: parsed.jobReviewOverrides,
    jobs: parsed.jobs,
    selectedBatch: parsed.selectedBatch,
    filter: parsed.filter,
    warnings: parsed.warnings,
  }, parsed.selectedInvoiceCustomerKey || "TELE");
}

function normalizeEntity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function withCustomerDefaults(customer: Customer): Customer {
  const normalizedName = normalizeEntity(customer.name);
  const isTelesolUs = customer.customerKey === "TELE-US" || normalizedName === normalizeEntity(telesolUsCustomer.name);
  if (isTelesolUs) {
    return {
      ...telesolUsCustomer,
      ...customer,
      customerKey: "TELE-US",
      name: "Telesol US LLC",
      customerLegalName: "TELESOL US LLC",
      customerAddress: customer.customerAddress || telesolUsCustomer.customerAddress,
      billingAddress: customer.billingAddress || telesolUsCustomer.billingAddress,
      financeEmail: customer.financeEmail || telesolUsCustomer.financeEmail,
      locationCards: splitSharedTelesolLocationCards(customer.locationCards).map((card) => ({
        ...card,
        slaEnabled: false,
        slaAmount: 0,
        slaAttributedTo: undefined,
        slaNote: undefined,
      })),
    };
  }

  const isTelesol = customer.customerKey === "TELE" || normalizedName === normalizeEntity(telesolCustomer.name);
  if (isTelesol) {
    return {
      ...customer,
      customerKey: "TELE",
      name: "Telesol IT B.V.",
      locationCards: splitSharedTelesolLocationCards(customer.locationCards).map((card) =>
        card.slaEnabled && card.slaAmount > 0 ? { ...card, slaAttributedTo: telesolSlaEntity } : card
      ),
    };
  }
  return withAkamaiDefaults(customer);
}

export function applyCustomerDefaults(customer: Customer) {
  return withCustomerDefaults(customer)
}

function ensureDefaultCustomers(customers: Customer[]): Customer[] {
  const normalizedCustomers = customers.map(withCustomerDefaults);
  const hasUsCustomer = normalizedCustomers.some((customer) => customer.customerKey === "TELE-US");
  return hasUsCustomer ? normalizedCustomers : [...normalizedCustomers, telesolUsCustomer];
}

function getPersistedCustomers(parsed: PersistedState): Customer[] {
  const customers = Array.isArray(parsed.customers) && parsed.customers.length
    ? parsed.customers
    : parsed.customer?.locationCards
      ? [parsed.customer]
      : defaultTelesolCustomers;
  return ensureDefaultCustomers(customers);
}

function repairCreatedJobs(jobs: JobInput[], customers: Customer[]) {
  const customersByKey = new Map(customers.map((customer) => [customer.customerKey, customer]))
  return jobs.map((job) => {
    const rawSummary = String(job.raw?.summary || '').trim()
    const rawWorkReport = String(job.raw?.workReport || '').trim()
    if (!rawSummary || !rawWorkReport) return job
    const customer = customersByKey.get(job.customerKey || '') || customersByKey.get('TELE') || customers[0]
    return customer ? repairCreatedJobFromRaw(customer, job) : job
  })
}

export function hydrateState(parsed: PersistedState): AppState {
  const customers = getPersistedCustomers(parsed);
  const legacy = legacyRun(parsed);
  const rawActiveView = String(parsed.activeView || "");
  const selectedCustomerKey = parsed.selectedCustomerKey || "";
  const selectedInvoiceCustomerKey = parsed.selectedInvoiceCustomerKey || selectedCustomerKey || "";
  const customerJobs = ensureUniqueJobIds(Array.isArray(parsed.customerJobs) ? parsed.customerJobs : Array.isArray(parsed.jobs) ? parsed.jobs : []);
  const jobs = ensureUniqueJobIds(repairCreatedJobs(Array.isArray(parsed.jobs) ? parsed.jobs : [], customers));
  const importRuns = Array.isArray(parsed.importRuns)
    ? parsed.importRuns.map((run) => normalizeRun(run, parsed.selectedInvoiceCustomerKey || "TELE"))
    : legacy ? [legacy] : [];
  const activeImportRunId = importRuns.some((run) => run.id === parsed.activeImportRunId)
    ? parsed.activeImportRunId || ""
    : importRuns[0]?.id || "";
  return {
      ...initialState,
      ...parsed,
      activeView:
        parsed.activeView === "fortnox" ? "fortnox"
        : parsed.activeView === "quote-builder" ? "quote-builder"
        : "customers",
      customers,
      fortnoxArticles: withFortnoxArticleDefaults(parsed.fortnoxArticles),
      selectedCustomerKey,
      selectedInvoiceCustomerKey,
      selectedFortnoxCustomerKey: parsed.selectedFortnoxCustomerKey || "",
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes.map((quote) => normalizeQuote(quote)) : [],
      customerWorkspaceTab:
        rawActiveView === "review-queue" ? "review-queue"
        : rawActiveView === "invoice-prep" ? "invoices"
        : parsed.customerWorkspaceTab === "review-queue" ? "review-queue"
        : parsed.customerWorkspaceTab === "invoices" ? "invoices"
        : parsed.customerWorkspaceTab === "create-job" ? "create-job"
        : parsed.customerWorkspaceTab === "technicians" ? "technicians"
        : "overview",
      importRuns,
      activeImportRunId,
      customerJobs,
      jiraIssues: Array.isArray(parsed.jiraIssues) ? parsed.jiraIssues : [],
      customerReportHeaders: Array.isArray(parsed.customerReportHeaders) ? parsed.customerReportHeaders : [],
      customerReportFileName: parsed.customerReportFileName || parsed.fileName || "",
      customerReportSheetName: parsed.customerReportSheetName || "",
      jiraFileName: parsed.jiraFileName || "",
      jobReviewOverrides: parsed.jobReviewOverrides || {},
      jobs,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
}

export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { ...initialState };
    return hydrateState(JSON.parse(raw) as PersistedState);
  } catch {
    return { ...initialState };
  }
}

export function saveState(state: AppState): void {
  const persisted: AppState = {
    ...state,
    activeView: state.activeView,
  };
  window.localStorage.setItem(storageKey, JSON.stringify(persisted));
}

export function clearSavedState(): AppState {
  window.localStorage.removeItem(storageKey);
  return { ...initialState };
}
