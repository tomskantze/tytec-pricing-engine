import { formatInvoicePeriod } from '../domain/dates'
import type { ImportResult, JiraIssue, JobInput, JobReviewOverride } from '../domain/types'
import { mergeJobsWithJira } from '../import/jiraReport'
import type { AppState, ImportRun, RunDocumentMeta } from './appState'

type JiraImportResult = { issues: JiraIssue[]; warnings: string[] }

function now() {
  return new Date().toISOString()
}

function makeRunId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function fileBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '')
}

function runLabel(jobs: JobInput[], fallback: string) {
  const periods = Array.from(new Set(jobs.map((job) => formatInvoicePeriod(job.date)).filter(Boolean)))
  if (periods.length === 1) return periods[0]
  if (periods.length > 1) return `${periods[0]} - ${periods[periods.length - 1]}`
  return fileBaseName(fallback) || 'New Import'
}

function compareInvoicePeriod(left: ImportRun, right: ImportRun) {
  if (left.invoiceYear != null && right.invoiceYear != null && left.invoiceMonth != null && right.invoiceMonth != null) {
    if (left.invoiceYear !== right.invoiceYear) return right.invoiceYear - left.invoiceYear
    if (left.invoiceMonth !== right.invoiceMonth) return right.invoiceMonth - left.invoiceMonth
  }
  return right.updatedAt.localeCompare(left.updatedAt)
}

function mergeRun(run: ImportRun): ImportRun {
  const merged = mergeJobsWithJira(run.customerJobs, run.jiraIssues)
  return {
    ...run,
    jobs: merged.jobs,
    warnings: [...run.customerWarnings, ...run.jiraWarnings, ...merged.warnings],
    updatedAt: now(),
  }
}

function replaceDocument(documents: RunDocumentMeta[], next: RunDocumentMeta) {
  return [next, ...documents.filter((document) => document.kind !== next.kind)]
}

function updateRun(state: AppState, runId: string, updater: (run: ImportRun) => ImportRun): AppState {
  return {
    ...state,
    activeImportRunId: runId,
    importRuns: state.importRuns.map((run) => (run.id === runId ? updater(run) : run)),
  }
}

export function updateImportRun(state: AppState, runId: string, updater: (run: ImportRun) => ImportRun): AppState {
  const run = state.importRuns.find((item) => item.id === runId)
  return run ? updateRun(state, runId, (current) => mergeRun(updater(current))) : state
}

export function createImportRun(customerKey: string, label = 'New Invoice', invoiceMonth?: number, invoiceYear?: number): ImportRun {
  const timestamp = now()
  return {
    id: makeRunId(),
    customerKey,
    label,
    invoiceMonth,
    invoiceYear,
    createdAt: timestamp,
    updatedAt: timestamp,
    customerJobs: [],
    jiraIssues: [],
    customerReportHeaders: [],
    customerReportFileName: '',
    customerReportSheetName: '',
    jiraFileName: '',
    customerWarnings: [],
    jiraWarnings: [],
    warnings: [],
    jobReviewOverrides: {},
    jobs: [],
    selectedBatch: '',
    filter: '',
    documents: [],
  }
}

export function createRunDocument(kind: RunDocumentMeta['kind'], file: File): RunDocumentMeta {
  const uploadedAt = now()
  return {
    id: `${kind}-${uploadedAt}`,
    kind,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt,
  }
}

export function getCustomerImportRuns(state: AppState, customerKey: string): ImportRun[] {
  return state.importRuns
    .filter((run) => run.customerKey === customerKey)
    .sort(compareInvoicePeriod)
}

export function getActiveImportRun(state: AppState): ImportRun | null {
  const customerKey = state.selectedInvoiceCustomerKey
  if (!customerKey) return null
  const active = state.importRuns.find((run) => run.id === state.activeImportRunId && run.customerKey === customerKey)
  return active ?? null
}

export function selectInvoiceCustomer(state: AppState, customerKey: string): AppState {
  return { ...state, selectedInvoiceCustomerKey: customerKey, activeImportRunId: '' }
}

export function createRunForCustomer(
  state: AppState,
  customerKey: string,
  label = 'New Invoice',
  invoiceMonth?: number,
  invoiceYear?: number,
): AppState {
  const run = createImportRun(customerKey, label, invoiceMonth, invoiceYear)
  return { ...state, selectedInvoiceCustomerKey: customerKey, activeImportRunId: run.id, importRuns: [run, ...state.importRuns] }
}

export function selectImportRun(state: AppState, runId: string): AppState {
  const run = state.importRuns.find((item) => item.id === runId)
  return run ? { ...state, selectedInvoiceCustomerKey: run.customerKey, activeImportRunId: run.id } : state
}

export function renameImportRun(state: AppState, label: string): AppState {
  const active = getActiveImportRun(state)
  const nextLabel = label.trim() || 'New Import'
  return active ? updateRun(state, active.id, (run) => ({ ...run, label: nextLabel, updatedAt: now() })) : state
}

export function deleteActiveImportRun(state: AppState): AppState {
  const active = getActiveImportRun(state)
  if (!active) return state
  return {
    ...state,
    importRuns: state.importRuns.filter((run) => run.id !== active.id),
    activeImportRunId: '',
  }
}

function withWritableRun(state: AppState, customerKey: string, updater: (run: ImportRun) => ImportRun): AppState {
  const active = getActiveImportRun({ ...state, selectedInvoiceCustomerKey: customerKey })
  if (active) return updateRun(state, active.id, (run) => mergeRun(updater(run)))
  const run = mergeRun(updater(createImportRun(customerKey)))
  return { ...state, selectedInvoiceCustomerKey: customerKey, activeImportRunId: run.id, importRuns: [run, ...state.importRuns] }
}

export function setCustomerReportOnRun(
  state: AppState,
  customerKey: string,
  result: ImportResult,
  document: RunDocumentMeta,
): AppState {
  return withWritableRun(state, customerKey, (run) => ({
    ...run,
    label: run.label === 'New Invoice' ? runLabel(result.jobs, result.sheetName || document.fileName) : run.label,
    customerJobs: result.jobs,
    customerReportHeaders: result.headers ?? [],
    customerReportFileName: document.fileName,
    customerReportSheetName: result.sheetName ?? '',
    customerWarnings: result.warnings,
    jobReviewOverrides: {},
    selectedBatch: '',
    documents: replaceDocument(run.documents, document),
  }))
}

export function setImportedJobsOnRun(
  state: AppState,
  customerKey: string,
  result: ImportResult,
): AppState {
  return withWritableRun(state, customerKey, (run) => ({
    ...run,
    customerJobs: result.jobs,
    customerReportHeaders: result.headers ?? [],
    customerReportFileName: '',
    customerReportSheetName: result.sheetName ?? '',
    customerWarnings: result.warnings,
    jobReviewOverrides: {},
    selectedBatch: '',
  }))
}

export function setJiraReportOnRun(state: AppState, customerKey: string, result: JiraImportResult, file: File): AppState {
  const document = createRunDocument('jira-report', file)
  return withWritableRun(state, customerKey, (run) => ({
    ...run,
    label: run.label === 'New Invoice' && !run.customerJobs.length ? runLabel([], file.name) : run.label,
    jiraIssues: result.issues,
    jiraFileName: file.name,
    jiraWarnings: result.warnings,
    selectedBatch: '',
    documents: replaceDocument(run.documents, document),
  }))
}

export function setJiraReportDocumentOnRun(
  state: AppState,
  customerKey: string,
  result: JiraImportResult,
  document: RunDocumentMeta,
): AppState {
  return withWritableRun(state, customerKey, (run) => ({
    ...run,
    label: run.label === 'New Invoice' && !run.customerJobs.length ? runLabel([], document.fileName) : run.label,
    jiraIssues: result.issues,
    jiraFileName: document.fileName,
    jiraWarnings: result.warnings,
    selectedBatch: '',
    documents: replaceDocument(run.documents, document),
  }))
}

export function attachRunDocument(state: AppState, customerKey: string, document: RunDocumentMeta): AppState {
  return withWritableRun(state, customerKey, (run) => ({
    ...run,
    documents: replaceDocument(run.documents, document),
  }))
}

export function resetActiveImportRun(state: AppState): AppState {
  const active = getActiveImportRun(state)
  if (!active) return state
  return updateRun(state, active.id, (run) => ({
    ...createImportRun(run.customerKey, run.label, run.invoiceMonth, run.invoiceYear),
    id: run.id,
    createdAt: run.createdAt,
    updatedAt: now(),
  }))
}

export function setRunSelectedBatch(state: AppState, selectedBatch: string): AppState {
  const active = getActiveImportRun(state)
  return active ? updateRun(state, active.id, (run) => ({ ...run, selectedBatch, updatedAt: now() })) : state
}

export function setRunFilter(state: AppState, filter: string): AppState {
  const active = getActiveImportRun(state)
  return active ? updateRun(state, active.id, (run) => ({ ...run, filter, selectedBatch: '', updatedAt: now() })) : state
}

export function saveRunReviewOverride(state: AppState, jobId: string, override: JobReviewOverride | null): AppState {
  const active = getActiveImportRun(state)
  if (!active) return state
  const nextOverrides = { ...active.jobReviewOverrides }
  const hasAmounts = override && [
    override.manualLaborAmount,
    override.manualTravelAmount,
    override.manualConsumablesAmount,
    override.manualFinalAmount,
  ].some((value) => value != null)
  const hasRateSelection = override && Boolean(override.manualRateLabel || override.manualRateType)
  if (override && (override.approved || override.forceReview || override.treatAsLocationId || hasRateSelection || hasAmounts || override.note)) {
    nextOverrides[jobId] = override
  }
  else delete nextOverrides[jobId]
  return updateRun(state, active.id, (run) => mergeRun({ ...run, jobReviewOverrides: nextOverrides }))
}
