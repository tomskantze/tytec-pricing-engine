import { useEffect, useMemo, useState } from 'react'
import { buildInvoiceBatches, invoiceBatchToCsv } from './domain/invoices'
import { formatInvoicePeriod, normalizeServiceDate } from './domain/dates'
import { ensureUniqueJobIds } from './domain/jobIds'
import { priceJobs } from './domain/pricing'
import { getTechnicianProfile } from './domain/technicians'
import { setFortnoxArticleNumber } from './domain/fortnoxArticles'
import type { FortnoxLineKind } from './domain/fortnoxArticles'
import type { Customer, InvoiceBatch, JobInput, JobReviewOverride, LocationCard, ShiftLabel } from './domain/types'
import { AppProviders } from './design-system/AppProviders'
import { applyCustomerDefaults, hydrateState, loadState, saveState, type AppState } from './state/appState'
import { getUploadedDocument, getUploadedDocumentByKind, loadDbState, saveDbState, saveUploadedDocument } from './state/localDb'
import {
  attachRunDocument,
  createRunDocument,
  createRunForCustomer,
  deleteActiveImportRun,
  getActiveImportRun,
  getCustomerImportRuns,
  saveRunReviewOverride,
  selectImportRun,
  setImportedJobsOnRun,
  setCustomerReportOnRun,
  setJiraReportDocumentOnRun,
  setRunSelectedBatch,
  updateImportRun,
} from './state/importRuns'
import { ErpShell } from './shell/ErpShell'
import { CustomersModule } from './modules/customers/CustomersModule'
import { CustomerWorkspaceView } from './modules/customers/CustomerWorkspaceView'
import { FortnoxModule } from './modules/fortnox/FortnoxModule'
import { FortnoxQuotePage } from './modules/fortnox/FortnoxQuotePage'
import { HomeModule } from './modules/home/HomeModule'
import type { SavedQuote } from './modules/fortnox/quoteTypes'
import { buildGeneratedInvoiceEntries } from './modules/invoice-prep/generatedInvoices'
import { buildInvoiceSummary, compareInvoiceSummaries } from './modules/invoice-prep/invoiceSummary'
import { importJiraIssuesFromText } from './import/jiraReport'
import { pricedCustomerReportToXlsx } from './import/pricedReportExport'
import { importCustomerReportFile } from './import/customerReport'
import { parseInvoicePdf, parsePayinfoPdf, type InvoicePdfLine } from './import/vendorDocuments'
import { downloadBlob, downloadText } from './shared/download'

const invoicePdfMismatchWarning = 'Uploaded invoice PDF did not match any invoice numbers in the customer report.'
const payinfoPdfMismatchWarning = 'Uploaded payinfo PDF did not match any invoice numbers in the customer report.'

type InvoiceDocumentParse = { invoiceNumbers: string[]; lines: InvoicePdfLine[] } | null
type PayinfoDocumentParse = { payinfoNumber: string; invoiceNumbers: string[]; totalAmount: number | null } | null
type DesktopDocumentApi = {
  debugLog?: (message: string) => void
  previewDocument?: (payload: { storedPath: string }) => Promise<string>
  readDocument?: (payload: { storedPath: string }) => Promise<Uint8Array | ArrayBuffer | null>
  saveDocument?: (payload: { id: string; fileName: string; bytes: ArrayBuffer }) => Promise<{ previewUrl: string; storedPath: string }>
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopDocumentApi }).desktopWindow
}

function getJobInvoiceNumber(job: JobInput) {
  return String(job.raw.invoiceNumber || job.raw.vendorInvoiceRef || job.raw.invoiceRef || '').trim()
}

function getCustomerReportInvoiceNumbers(jobs: JobInput[]) {
  return new Set(jobs.map(getJobInvoiceNumber).filter(Boolean))
}

function getJobReportedHoursTotal(job: JobInput) {
  if (job.reportedHoursByLabel) {
    return Object.values(job.reportedHoursByLabel).reduce((sum, value) => sum + Number(value || 0), 0)
  }
  if (job.reportedHours) {
    return Number(job.reportedHours.bh || 0) + Number(job.reportedHours.obh || 0) + Number(job.reportedHours.wh || 0)
  }
  return 0
}

function attachPayinfoNumber(jobs: JobInput[], payinfoPdfResult: PayinfoDocumentParse) {
  if (!payinfoPdfResult?.payinfoNumber) return jobs
  const payinfoInvoiceNumbers = new Set(payinfoPdfResult.invoiceNumbers)
  return jobs.map((job) => {
    const invoiceNumber = getJobInvoiceNumber(job)
    if (!invoiceNumber || !payinfoInvoiceNumbers.has(invoiceNumber)) return job
    return {
      ...job,
      raw: {
        ...job.raw,
        payinfoNumber: payinfoPdfResult.payinfoNumber,
        ...(payinfoPdfResult.totalAmount != null ? { payinfoTotal: payinfoPdfResult.totalAmount.toFixed(2) } : {}),
      },
    }
  })
}

function normalizeNameKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function technicianMatchKey(customer: Customer, value: string) {
  const technician = getTechnicianProfile(customer, value)
  return technician ? `tech:${technician.id}` : normalizeNameKey(value)
}

function inferTechnicianLocation(customer: Customer, technicianName: string): LocationCard | undefined {
  const technician = getTechnicianProfile(customer, technicianName)
  if (!technician) return undefined
  const assignmentLocationIds = Array.from(new Set(
    (customer.technicianTierAssignments || [])
      .filter((assignment) => assignment.technicianId === technician.id)
      .map((assignment) => assignment.locationId),
  ))
  const rateLocationIds = Array.from(new Set(
    (customer.technicianRates || [])
      .filter((rate) => rate.technicianId === technician.id)
      .map((rate) => rate.locationId),
  ))
  const allLocationIds = Array.from(new Set([...assignmentLocationIds, ...rateLocationIds]))
  return allLocationIds.length === 1
    ? customer.locationCards.find((card) => card.id === allLocationIds[0])
    : undefined
}

function vendorMemoDate(value: string) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) return normalizeServiceDate(value)
  return normalizeServiceDate(`${match[3]}-${match[1]}-${match[2]}`)
}

function vendorInvoiceDate(value: string) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) return normalizeServiceDate(value)
  return normalizeServiceDate(`${match[3]}-${match[2]}-${match[1]}`)
}

function deriveAkamaiSettlementPeriod(
  invoicePdfResult: InvoiceDocumentParse,
  fallback: { label: string; month: number; year: number },
) {
  const invoiceDate = invoicePdfResult?.lines.find((line) => line.invoiceDate)?.invoiceDate || ''
  const match = invoiceDate.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!match) return fallback
  const displayDate = vendorInvoiceDate(invoiceDate)
  const periodLabel = formatInvoicePeriod(displayDate)
  return {
    label: `AKAMAI-${periodLabel.toUpperCase().replace(/\s+/g, '-')}`,
    month: Number(match[2]) - 1,
    year: Number(match[3]),
  }
}

function attachInvoicePdfDetails(
  customer: Customer,
  jobs: JobInput[],
  invoicePdfResult: InvoiceDocumentParse,
  options?: { overwriteExisting?: boolean },
) {
  if (!invoicePdfResult?.lines.length) return jobs
  const overwriteExisting = Boolean(options?.overwriteExisting)
  const aggregates = new Map<string, {
    technician: string
    invoiceDate: string
    hours: number
    amount: number
    unitRates: Set<number>
    periodStart: string
    periodEnd: string
  }>()
  for (const line of invoicePdfResult.lines) {
    const key = `${line.invoiceNumber}:${technicianMatchKey(customer, line.technician)}`
    const existing = aggregates.get(key)
    if (existing) {
      existing.hours += line.hours
      existing.amount += line.amount
      existing.unitRates.add(line.unitRate)
      existing.invoiceDate = existing.invoiceDate || line.invoiceDate
      existing.periodStart = existing.periodStart || line.periodStart
      existing.periodEnd = existing.periodEnd || line.periodEnd
      continue
    }
    aggregates.set(key, {
      technician: line.technician,
      invoiceDate: line.invoiceDate,
      hours: line.hours,
      amount: line.amount,
      unitRates: new Set([line.unitRate]),
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
    })
  }
  return jobs.map((job) => {
    const invoiceNumber = getJobInvoiceNumber(job)
    if (!invoiceNumber) return job
    const match = aggregates.get(`${invoiceNumber}:${technicianMatchKey(customer, job.technician)}`)
    if (!match) return job
    const technician = getTechnicianProfile(customer, match.technician)
    const invoiceDate = match.invoiceDate ? vendorInvoiceDate(match.invoiceDate) : job.date
    const existingVendorHours = String(job.raw.vendorInvoiceHours || '').trim()
    const existingVendorRate = String(job.raw.vendorInvoiceRate || '').trim()
    const existingVendorAmount = String(job.raw.vendorInvoiceAmount || '').trim()
    const existingVendorPeriod = String(job.raw.vendorInvoicePeriod || '').trim()
    return {
      ...job,
      technician: technician?.name || job.technician,
      date: customer.customerKey === 'AKAM' ? invoiceDate : job.date,
      serviceDate: customer.customerKey === 'AKAM' ? invoiceDate : job.serviceDate,
      raw: {
        ...job.raw,
        vendorInvoiceDate: match.invoiceDate,
        vendorInvoiceHours: overwriteExisting || !existingVendorHours ? match.hours.toFixed(2) : existingVendorHours,
        vendorInvoiceRate: overwriteExisting || !existingVendorRate ? (match.unitRates.size === 1 ? String([...match.unitRates][0]) : '') : existingVendorRate,
        vendorInvoiceAmount: overwriteExisting || !existingVendorAmount ? match.amount.toFixed(2) : existingVendorAmount,
        vendorInvoicePeriod: overwriteExisting || !existingVendorPeriod
          ? (match.periodStart && match.periodEnd ? `${match.periodStart} to ${match.periodEnd}` : '')
          : existingVendorPeriod,
      },
    }
  })
}

function appendInvoicePdfJobs(customer: Customer, jobs: JobInput[], invoicePdfResult: InvoiceDocumentParse) {
  if (customer.customerKey !== 'AKAM' || !invoicePdfResult?.lines.length) return jobs
  const aggregates = new Map<string, {
    invoiceNumber: string
    technician: string
    invoiceDate: string
    hours: number
    amount: number
    unitRates: Set<number>
    periodStart: string
    periodEnd: string
  }>()
  for (const line of invoicePdfResult.lines) {
    const key = `${line.invoiceNumber}:${technicianMatchKey(customer, line.technician)}`
    const existing = aggregates.get(key)
    if (existing) {
      existing.hours += line.hours
      existing.amount += line.amount
      existing.unitRates.add(line.unitRate)
      existing.invoiceDate = existing.invoiceDate || line.invoiceDate
      existing.periodStart = existing.periodStart || line.periodStart
      existing.periodEnd = existing.periodEnd || line.periodEnd
      continue
    }
    aggregates.set(key, {
      invoiceNumber: line.invoiceNumber,
      technician: line.technician,
      invoiceDate: line.invoiceDate,
      hours: line.hours,
      amount: line.amount,
      unitRates: new Set([line.unitRate]),
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
    })
  }
  const existingHoursByKey = new Map<string, number>()
  for (const job of jobs) {
    const invoiceNumber = getJobInvoiceNumber(job)
    if (!invoiceNumber) continue
    const key = `${invoiceNumber}:${technicianMatchKey(customer, job.technician)}`
    existingHoursByKey.set(key, (existingHoursByKey.get(key) || 0) + getJobReportedHoursTotal(job))
  }
  const appended = [...jobs]
  for (const [key, aggregate] of aggregates) {
    const accountedHours = existingHoursByKey.get(key) || 0
    const remainderHours = Number((aggregate.hours - accountedHours).toFixed(2))
    if (remainderHours <= 0.01) continue
    const location = inferTechnicianLocation(customer, aggregate.technician)
    const technician = getTechnicianProfile(customer, aggregate.technician)
    const technicianName = technician?.name || aggregate.technician
    const invoiceDate = aggregate.invoiceDate
      ? vendorInvoiceDate(aggregate.invoiceDate)
      : vendorMemoDate(aggregate.periodEnd || aggregate.periodStart)
    const remainderAmount = aggregate.hours > 0
      ? Number((aggregate.amount * (remainderHours / aggregate.hours)).toFixed(2))
      : aggregate.amount
    const summaryLabel = accountedHours > 0 ? 'Invoice PDF remainder' : 'Invoice PDF'
    appended.push({
      id: `pdf-${aggregate.invoiceNumber}-${technicianMatchKey(customer, aggregate.technician)}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
      sourceRow: 0,
      customerKey: customer.customerKey,
      date: invoiceDate,
      serviceDate: invoiceDate,
      ticket: '',
      customerRef: '',
      city: location?.city || '',
      country: location?.country || '',
      endCustomer: customer.name,
      technician: technicianName,
      summary: [aggregate.invoiceNumber, location?.city, summaryLabel].filter(Boolean).join(' · '),
      reportStatus: 'Invoiced',
      completionNotes: aggregate.periodStart && aggregate.periodEnd
        ? `${summaryLabel} ${remainderHours.toFixed(2)}h from ${aggregate.periodStart} to ${aggregate.periodEnd}`
        : `${summaryLabel} ${remainderHours.toFixed(2)}h`,
      travelStart: '',
      onSite: '',
      offSite: '',
      travelFinish: '',
      reportedHours: { bh: remainderHours, obh: 0, wh: 0 },
      reportedHoursByLabel: { REG: remainderHours },
      consumablesAmount: 0,
      consumablesDescription: '',
      raw: {
        invoiceNumber: aggregate.invoiceNumber,
        invoiceDate: aggregate.invoiceDate,
        vendorInvoiceRef: aggregate.invoiceNumber,
        vendorInvoiceDate: aggregate.invoiceDate,
        vendorInvoiceHours: remainderHours.toFixed(2),
        vendorInvoiceRate: aggregate.unitRates.size === 1 ? String([...aggregate.unitRates][0]) : '',
        vendorInvoiceAmount: remainderAmount.toFixed(2),
        vendorInvoicePeriod: aggregate.periodStart && aggregate.periodEnd ? `${aggregate.periodStart} to ${aggregate.periodEnd}` : '',
        site: location?.city || '',
        rateBucket: 'REG',
        source: accountedHours > 0 ? 'invoice-pdf-remainder' : 'invoice-pdf',
      },
    })
  }
  return ensureUniqueJobIds(appended)
}

function buildVendorDocumentWarnings(
  invoiceNumbers: Set<string>,
  invoicePdfResult: InvoiceDocumentParse,
  payinfoPdfResult: PayinfoDocumentParse,
) {
  return [
    ...(invoicePdfResult && invoiceNumbers.size && ![...invoiceNumbers].some((value) => invoicePdfResult.invoiceNumbers.includes(value))
      ? [invoicePdfMismatchWarning]
      : []),
    ...(payinfoPdfResult && invoiceNumbers.size && ![...invoiceNumbers].some((value) => payinfoPdfResult.invoiceNumbers.includes(value))
      ? [payinfoPdfMismatchWarning]
      : []),
  ]
}

function replaceVendorDocumentWarnings(existingWarnings: string[], nextWarnings: string[]) {
  return [
    ...existingWarnings.filter((warning) => warning !== invoicePdfMismatchWarning && warning !== payinfoPdfMismatchWarning),
    ...nextWarnings,
  ]
}

async function persistRunDocument(documentMeta: import('./state/appState').RunDocumentMeta, file: File) {
  const api = desktopWindow()
  if (api?.saveDocument) {
    const bytes = await file.arrayBuffer()
    const stored = await api.saveDocument({ id: documentMeta.id, fileName: documentMeta.fileName, bytes })
    return {
      ...documentMeta,
      previewUrl: stored.previewUrl || undefined,
      storedPath: stored.storedPath || undefined,
    }
  }
  await saveUploadedDocument(documentMeta, file)
  return documentMeta
}

function updateRunDocumentMeta(state: AppState, documentId: string, nextDocument: import('./state/appState').RunDocumentMeta) {
  const targetRun = state.importRuns.find((run) => run.documents.some((document) => document.id === documentId))
  if (!targetRun) return state
  return updateImportRun(state, targetRun.id, (run) => ({
    ...run,
    documents: run.documents.map((document) => (document.id === documentId ? nextDocument : document)),
  }))
}

export function App() {
  const [state, setState] = useState<AppState>(() => loadState())

  useEffect(() => {
    let isMounted = true
    void loadDbState().then((dbState) => {
      if (!isMounted) return
      if (dbState) {
        const hydratedState = hydrateState(dbState)
        setState(hydratedState)
        saveState(hydratedState)
        void saveDbState(hydratedState)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const api = desktopWindow()
    const saveDocument = api?.saveDocument
    const debugLog = api?.debugLog
    if (!saveDocument) return
    const pendingDocument = state.importRuns
      .flatMap((run) => run.documents)
      .find((document) => (document.kind === 'invoice-pdf' || document.kind === 'payinfo-pdf') && !document.storedPath)
    if (!pendingDocument) return

    let cancelled = false
    void (async () => {
      debugLog?.(`repair-start id=${pendingDocument.id} kind=${pendingDocument.kind} file=${pendingDocument.fileName}`)
      const legacyDocument = await getUploadedDocument(pendingDocument.id) || await getUploadedDocumentByKind(pendingDocument.kind)
      debugLog?.(`repair-legacy ${legacyDocument ? 'found' : 'missing'} id=${pendingDocument.id} kind=${pendingDocument.kind}`)
      if (!legacyDocument || cancelled) return
      const bytes = await legacyDocument.content.arrayBuffer()
      debugLog?.(`repair-bytes size=${bytes.byteLength} id=${pendingDocument.id}`)
      const saved = await saveDocument({ id: pendingDocument.id, fileName: pendingDocument.fileName, bytes })
      debugLog?.(`repair-saved path=${saved.storedPath || ''} preview=${saved.previewUrl || ''}`)
      if (cancelled || !saved.storedPath) return
      updateState((current) => updateRunDocumentMeta(current, pendingDocument.id, {
        ...pendingDocument,
        previewUrl: saved.previewUrl || undefined,
        storedPath: saved.storedPath,
      }))
    })()

    return () => {
      cancelled = true
    }
  }, [state.importRuns])

  function updateState(next: Partial<AppState> | ((current: AppState) => AppState)) {
    setState((current) => {
      const updated = typeof next === 'function' ? next(current) : { ...current, ...next }
      saveState(updated)
      void saveDbState(updated)
      return updated
    })
  }

  const selectedCustomer = useMemo(
    () => state.customers.find((customer) => customer.customerKey === state.selectedCustomerKey) ?? null,
    [state.customers, state.selectedCustomerKey],
  )
  const invoiceCustomerKey = state.selectedInvoiceCustomerKey || state.selectedCustomerKey
  const invoiceCustomer = useMemo(
    () => state.customers.find((customer) => customer.customerKey === invoiceCustomerKey) ?? null,
    [invoiceCustomerKey, state.customers],
  )
  const fortnoxCustomer = useMemo(
    () => state.customers.find((customer) => customer.customerKey === state.selectedFortnoxCustomerKey) ?? null,
    [state.customers, state.selectedFortnoxCustomerKey],
  )
  const activeRun = useMemo(() => getActiveImportRun(state), [state])
  const createdJobs = useMemo(() => state.jobs.filter((job) => job.customerKey === selectedCustomer?.customerKey), [selectedCustomer?.customerKey, state.jobs])
  const customerImportRuns = useMemo(
    () => (invoiceCustomer ? getCustomerImportRuns(state, invoiceCustomer.customerKey) : []),
    [invoiceCustomer, state],
  )
  const generatedInvoices = useMemo(
    () => (invoiceCustomer ? buildGeneratedInvoiceEntries(invoiceCustomer, createdJobs, state.jobReviewOverrides, state.fortnoxArticles) : []),
    [createdJobs, invoiceCustomer, state.fortnoxArticles, state.jobReviewOverrides],
  )
  const invoiceSummaries = useMemo(
    () => (
      invoiceCustomer
        ? [...customerImportRuns.map((invoice) => buildInvoiceSummary(invoiceCustomer, invoice, state.fortnoxArticles)), ...generatedInvoices.map((invoice) => invoice.summary)].sort(compareInvoiceSummaries)
        : []
    ),
    [customerImportRuns, generatedInvoices, invoiceCustomer, state.fortnoxArticles],
  )
  const pricedJobs = useMemo(
    () => (
      invoiceCustomer && activeRun
        ? priceJobs(invoiceCustomer, activeRun.jobs, activeRun.jobReviewOverrides, state.fortnoxArticles)
        : []
    ),
    [invoiceCustomer, activeRun, state.fortnoxArticles],
  )
  const activeGeneratedInvoice = useMemo(
    () => generatedInvoices.find((invoice) => invoice.summary.invoiceId === state.activeImportRunId) ?? null,
    [generatedInvoices, state.activeImportRunId],
  )
  const batches = useMemo(() => {
    if (activeGeneratedInvoice) return activeGeneratedInvoice.batches
    if (!invoiceCustomer) return []
    return buildInvoiceBatches(invoiceCustomer, pricedJobs, state.includeSla)
  }, [activeGeneratedInvoice, pricedJobs, invoiceCustomer, state.includeSla])
  const activeInvoiceJobs = activeGeneratedInvoice?.jobs || pricedJobs
  const reviewJobs = useMemo(() => (
    selectedCustomer ? [...pricedJobs, ...priceJobs(selectedCustomer, createdJobs, state.jobReviewOverrides, state.fortnoxArticles)] : pricedJobs
  ), [createdJobs, pricedJobs, selectedCustomer, state.fortnoxArticles, state.jobReviewOverrides])
  const customerNavItems = useMemo(() => state.customers
    .map((customer) => ({
      key: customer.customerKey,
      name: customer.name,
      invoicesLabel: customer.customerKey === 'AKAM' ? 'Settlements' : 'Invoices',
      showCreateJob: customer.locationCards.length > 0,
      showTechnicians: customer.customerKey === 'AKAM',
    }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })), [state.customers])

  function openCustomersIndex() {
    updateState((current) => ({
      ...current,
      activeView: 'customers',
      activeImportRunId: '',
      selectedCustomerKey: '',
      selectedInvoiceCustomerKey: '',
    }))
  }

  function openHome() {
    updateState((current) => ({
      ...current,
      activeView: 'home',
      activeImportRunId: '',
      selectedCustomerKey: '',
      selectedInvoiceCustomerKey: '',
    }))
  }

  function openCustomerWorkspaceTab(customerKey: string, tab: 'profile' | 'rate-cards' | 'create-job' | 'invoices' | 'review-queue' | 'technicians') {
    updateState((current) => ({
      ...current,
      activeView: 'customers',
      activeImportRunId: current.selectedCustomerKey === customerKey ? current.activeImportRunId : '',
      customerWorkspaceTab: tab,
      selectedCustomerKey: customerKey,
      selectedInvoiceCustomerKey: customerKey,
    }))
  }

  function openFortnoxArticleMapping() {
    updateState((current) => ({
      ...current,
      activeView: 'fortnox',
      selectedFortnoxCustomerKey: '',
    }))
  }

  function openQuoteBuilderTab(tab: 'builder' | 'saved') {
    updateState((current) => ({
      ...current,
      activeView: 'quote-builder',
      quoteBuilderTab: tab,
    }))
  }

  function openCustomerWorkspace(customerKey: string) {
    updateState((current) => ({
      ...current,
      activeView: 'customers',
      customerWorkspaceTab: 'profile',
      activeImportRunId: '',
      selectedCustomerKey: customerKey,
      selectedInvoiceCustomerKey: customerKey,
    }))
  }

  function exportBatch(batch: InvoiceBatch) {
    downloadText(`${batch.batch}.csv`, 'text/csv;charset=utf-8', invoiceBatchToCsv(batch, state.includeSla))
  }

  function exportPricedReport() {
    if (!activeRun || activeGeneratedInvoice) return
    const baseName = activeRun.customerReportFileName.replace(/\.[^.]+$/, '') || 'customer-report'
    downloadBlob(
      `${baseName}-priced.xlsx`,
      pricedCustomerReportToXlsx(pricedJobs, activeRun.customerReportHeaders, activeRun.customerReportSheetName),
    )
  }

  function saveReviewOverride(jobId: string, override: JobReviewOverride | null) {
    updateState((current) => {
      if (current.jobs.some((job) => job.id === jobId)) {
        const jobReviewOverrides = { ...current.jobReviewOverrides }
        if (override) jobReviewOverrides[jobId] = override
        else delete jobReviewOverrides[jobId]
        return { ...current, jobReviewOverrides }
      }
      return saveRunReviewOverride(current, jobId, override)
    })
  }

  function moveObh1ToReg(jobIds: string[]) {
    const targetIds = Array.from(new Set(jobIds.filter(Boolean)))
    if (!targetIds.length) return
    updateState((current) => {
      const active = getActiveImportRun(current)
      if (active) {
        return targetIds.reduce((nextState, jobId) => {
          const existing = getActiveImportRun(nextState)?.jobReviewOverrides[jobId]
          return saveRunReviewOverride(nextState, jobId, {
            ...existing,
            approved: true,
            manualRateLabel: 'REG',
            manualRateType: undefined,
          })
        }, current)
      }
      const nextOverrides = { ...current.jobReviewOverrides }
      for (const jobId of targetIds) {
        nextOverrides[jobId] = {
          ...nextOverrides[jobId],
          approved: true,
          manualRateLabel: 'REG',
          manualRateType: undefined,
        }
      }
      return { ...current, jobReviewOverrides: nextOverrides }
    })
  }

  async function createInvoice(input: { customerFile?: File; jiraFile?: File; invoicePdf?: File; payinfoPdf?: File; label: string; month: number; year: number }) {
    if (!invoiceCustomer) return
    const customerResult = input.customerFile
      ? await importCustomerReportFile(invoiceCustomer, input.customerFile)
      : { jobs: [], headers: [], warnings: [] }
    const jiraResult = input.jiraFile ? importJiraIssuesFromText(await input.jiraFile.text()) : null
    const invoicePdfResult = input.invoicePdf ? await parseInvoicePdf(input.invoicePdf) : null
    const payinfoPdfResult = input.payinfoPdf ? await parsePayinfoPdf(input.payinfoPdf) : null
    const runPeriod = invoiceCustomer.customerKey === 'AKAM'
      ? deriveAkamaiSettlementPeriod(invoicePdfResult, { label: input.label, month: input.month, year: input.year })
      : { label: input.label, month: input.month, year: input.year }
    const customerReportDocument = input.customerFile ? createRunDocument('customer-report', input.customerFile) : null
    const jiraDocument = input.jiraFile ? createRunDocument('jira-report', input.jiraFile) : null
    const invoicePdfDocument = input.invoicePdf ? createRunDocument('invoice-pdf', input.invoicePdf) : null
    const payinfoPdfDocument = input.payinfoPdf ? createRunDocument('payinfo-pdf', input.payinfoPdf) : null
    const csvInvoiceNumbers = getCustomerReportInvoiceNumbers(customerResult.jobs)
    const jobsWithPdf = appendInvoicePdfJobs(invoiceCustomer, customerResult.jobs, invoicePdfResult)
    const enrichedCustomerResult = {
      ...customerResult,
      jobs: attachInvoicePdfDetails(invoiceCustomer, attachPayinfoNumber(jobsWithPdf, payinfoPdfResult), invoicePdfResult),
      warnings: [...customerResult.warnings, ...buildVendorDocumentWarnings(csvInvoiceNumbers, invoicePdfResult, payinfoPdfResult)],
    }
    const [savedCustomerReportDocument, savedJiraDocument, savedInvoicePdfDocument, savedPayinfoPdfDocument] = await Promise.all([
      ...(customerReportDocument && input.customerFile ? [persistRunDocument(customerReportDocument, input.customerFile)] : [Promise.resolve(null)]),
      ...(jiraDocument && input.jiraFile ? [persistRunDocument(jiraDocument, input.jiraFile)] : [Promise.resolve(null)]),
      ...(invoicePdfDocument && input.invoicePdf ? [persistRunDocument(invoicePdfDocument, input.invoicePdf)] : [Promise.resolve(null)]),
      ...(payinfoPdfDocument && input.payinfoPdf ? [persistRunDocument(payinfoPdfDocument, input.payinfoPdf)] : [Promise.resolve(null)]),
    ])
    updateState((current) => {
      let next = createRunForCustomer(current, invoiceCustomer.customerKey, runPeriod.label, runPeriod.month, runPeriod.year)
      next = savedCustomerReportDocument
        ? setCustomerReportOnRun(next, invoiceCustomer.customerKey, enrichedCustomerResult, savedCustomerReportDocument)
        : setImportedJobsOnRun(next, invoiceCustomer.customerKey, enrichedCustomerResult)
      if (jiraResult && savedJiraDocument) next = setJiraReportDocumentOnRun(next, invoiceCustomer.customerKey, jiraResult, savedJiraDocument)
      if (savedInvoicePdfDocument) next = attachRunDocument(next, invoiceCustomer.customerKey, savedInvoicePdfDocument)
      if (savedPayinfoPdfDocument) next = attachRunDocument(next, invoiceCustomer.customerKey, savedPayinfoPdfDocument)
      return next
    })
  }

  async function attachInvoiceDocuments(input: { invoicePdf?: File; payinfoPdf?: File }) {
    if (!activeRun || activeGeneratedInvoice || !invoiceCustomer) return
    const invoicePdfResult = input.invoicePdf ? await parseInvoicePdf(input.invoicePdf) : null
    const payinfoPdfResult = input.payinfoPdf ? await parsePayinfoPdf(input.payinfoPdf) : null
    const invoicePdfDocument = input.invoicePdf ? createRunDocument('invoice-pdf', input.invoicePdf) : null
    const payinfoPdfDocument = input.payinfoPdf ? createRunDocument('payinfo-pdf', input.payinfoPdf) : null
    const runId = activeRun.id

    const [savedInvoicePdfDocument, savedPayinfoPdfDocument] = await Promise.all([
      ...(invoicePdfDocument && input.invoicePdf ? [persistRunDocument(invoicePdfDocument, input.invoicePdf)] : [Promise.resolve(null)]),
      ...(payinfoPdfDocument && input.payinfoPdf ? [persistRunDocument(payinfoPdfDocument, input.payinfoPdf)] : [Promise.resolve(null)]),
    ])

    updateState((current) => updateImportRun(current, runId, (run) => {
      const csvInvoiceNumbers = getCustomerReportInvoiceNumbers(run.customerJobs)
      const nextWarnings = buildVendorDocumentWarnings(csvInvoiceNumbers, invoicePdfResult, payinfoPdfResult)
      const nextDocumentKinds = new Set(
        [savedInvoicePdfDocument?.kind, savedPayinfoPdfDocument?.kind].filter(
          (value): value is NonNullable<typeof value> => Boolean(value),
        ),
      )
      return {
        ...run,
        customerJobs: attachInvoicePdfDetails(
          invoiceCustomer,
          attachPayinfoNumber(appendInvoicePdfJobs(invoiceCustomer, run.customerJobs, invoicePdfResult), payinfoPdfResult),
          invoicePdfResult,
        ),
        customerWarnings: replaceVendorDocumentWarnings(run.customerWarnings, nextWarnings),
        selectedBatch: '',
        documents: [
          ...(savedInvoicePdfDocument ? [savedInvoicePdfDocument] : []),
          ...(savedPayinfoPdfDocument ? [savedPayinfoPdfDocument] : []),
          ...run.documents.filter((document) => !nextDocumentKinds.has(document.kind)),
        ],
      }
    }))
  }

  function updateInvoiceDocument(document: import('./state/appState').RunDocumentMeta) {
    if (!activeRun || activeGeneratedInvoice) return
    const runId = activeRun.id
    updateState((current) => updateImportRun(current, runId, (run) => ({
      ...run,
      documents: run.documents.map((currentDocument) => (currentDocument.id === document.id ? document : currentDocument)),
    })))
  }

  function saveCustomer(customer: Customer, previousKey?: string) {
    const nextCustomer = applyCustomerDefaults(customer)
    updateState((current) => {
      const lookupKey = previousKey || nextCustomer.customerKey
      const exists = current.customers.some((currentCustomer) => currentCustomer.customerKey === lookupKey)
      const customers = exists
        ? current.customers.map((currentCustomer) => (currentCustomer.customerKey === lookupKey ? nextCustomer : currentCustomer))
        : [nextCustomer, ...current.customers]
      const selectedFortnoxCustomerKey =
        current.selectedFortnoxCustomerKey === lookupKey ? nextCustomer.customerKey : current.selectedFortnoxCustomerKey
      const selectedInvoiceCustomerKey =
        current.selectedInvoiceCustomerKey === lookupKey ? nextCustomer.customerKey : current.selectedInvoiceCustomerKey
      return {
        ...current,
        customers,
        selectedCustomerKey: nextCustomer.customerKey,
        selectedInvoiceCustomerKey,
        selectedFortnoxCustomerKey,
        activeView: 'customers',
      }
    })
  }

  function saveFortnoxArticle(locationId: string, shift: ShiftLabel, kind: FortnoxLineKind, articleNumber: string) {
    updateState((current) => ({
      ...current,
      fortnoxArticles: setFortnoxArticleNumber(current.fortnoxArticles, locationId, shift, kind, articleNumber),
    }))
  }

  function saveCreatedJob(job: JobInput) {
    updateState((current) => ({
      ...current,
      jobs: ensureUniqueJobIds([...current.jobs, { ...job, raw: { ...job.raw, savedAt: new Date().toISOString() } }]),
    }))
  }

  function deleteCreatedJob(jobId: string) {
    updateState((current) => {
      const jobReviewOverrides = { ...current.jobReviewOverrides }
      delete jobReviewOverrides[jobId]
      return { ...current, jobReviewOverrides, jobs: current.jobs.filter((job) => job.id !== jobId) }
    })
  }

  function saveQuote(quote: SavedQuote) {
    updateState((current) => ({
      ...current,
      quotes: current.quotes.some((currentQuote) => currentQuote.id === quote.id)
        ? current.quotes.map((currentQuote) => (currentQuote.id === quote.id ? quote : currentQuote))
        : [...current.quotes, quote],
    }))
  }

  function deleteQuote(quoteId: string) {
    updateState((current) => ({
      ...current,
      quotes: current.quotes.filter((quote) => quote.id !== quoteId),
    }))
  }

  return (
    <AppProviders>
      <ErpShell
        activeView={state.activeView}
        customers={customerNavItems}
        customerWorkspaceTab={state.customerWorkspaceTab}
        onOpenCustomer={openCustomerWorkspace}
        onOpenCustomerTab={openCustomerWorkspaceTab}
        onOpenHome={openHome}
        onOpenCustomers={openCustomersIndex}
        onOpenFortnox={openFortnoxArticleMapping}
        onOpenQuoteTab={openQuoteBuilderTab}
        quoteBuilderTab={state.quoteBuilderTab}
        selectedCustomerKey={state.selectedCustomerKey}
      >
        {state.activeView === 'home' ? (
          <HomeModule
            customers={state.customers}
            importRuns={state.importRuns.map((run) => ({
              id: run.id,
              customerKey: run.customerKey,
              customerName: state.customers.find((customer) => customer.customerKey === run.customerKey)?.name || run.customerKey,
              label: run.label,
              updatedAt: run.updatedAt,
            }))}
            onOpenCustomer={openCustomerWorkspace}
            onOpenCustomerInvoices={(customerKey) => openCustomerWorkspaceTab(customerKey, 'invoices')}
            onOpenCustomers={openCustomersIndex}
            onOpenFortnox={openFortnoxArticleMapping}
            onOpenQuoteBuilder={() => openQuoteBuilderTab('builder')}
            onOpenSavedQuotes={() => openQuoteBuilderTab('saved')}
            quotes={state.quotes}
          />
        ) : state.activeView === 'fortnox' ? (
          <FortnoxModule
            customer={fortnoxCustomer}
            customers={state.customers}
            fortnoxArticles={state.fortnoxArticles}
            onSelectCustomer={(selectedFortnoxCustomerKey) => updateState({ selectedFortnoxCustomerKey })}
            onSetArticle={saveFortnoxArticle}
          />
        ) : state.activeView === 'quote-builder' ? (
          <FortnoxQuotePage
            activeTab={state.quoteBuilderTab}
            customers={state.customers}
            quotes={state.quotes}
            onDeleteQuote={deleteQuote}
            onSaveQuote={saveQuote}
            onSelectCustomer={(selectedFortnoxCustomerKey) => updateState({ selectedFortnoxCustomerKey })}
            onSelectTab={openQuoteBuilderTab}
          />
        ) : !selectedCustomer ? (
          <CustomersModule
            customers={state.customers}
            fortnoxArticles={state.fortnoxArticles}
            onCustomerChange={saveCustomer}
            onSelectCustomer={openCustomerWorkspace}
            selectedCustomerKey=""
          />
        ) : (
          <CustomerWorkspaceView
            activeInvoiceId={activeGeneratedInvoice?.summary.invoiceId || activeRun?.id || ''}
            activeInvoiceLabel={activeGeneratedInvoice?.summary.label || activeRun?.label || ''}
            activeTab={state.customerWorkspaceTab}
            batches={batches}
            createdJobs={createdJobs}
            customer={selectedCustomer}
            customers={state.customers}
            fortnoxArticles={state.fortnoxArticles}
            includeSla={state.includeSla}
            invoiceJobs={activeInvoiceJobs}
            invoiceSummaries={invoiceSummaries}
            onBackToCustomers={() => updateState((current) => ({ ...current, activeView: 'customers', activeImportRunId: '', selectedCustomerKey: '', selectedInvoiceCustomerKey: '' }))}
            onCreateInvoice={createInvoice}
            onAttachInvoiceDocuments={attachInvoiceDocuments}
            onBulkMoveObh1ToReg={moveObh1ToReg}
            onCreateJob={saveCreatedJob}
            onCustomerChange={saveCustomer}
            onDeleteCreatedJob={deleteCreatedJob}
            onDeleteInvoice={() => updateState((current) => deleteActiveImportRun(current))}
            onExport={exportBatch}
            onExportPricedReport={exportPricedReport}
            onOpenCustomerWorkspace={openCustomerWorkspace}
            onSaveReviewOverride={saveReviewOverride}
            onSelectBatch={(selectedBatch) => updateState((current) => (
              activeGeneratedInvoice ? { ...current, selectedBatch } : setRunSelectedBatch(current, selectedBatch)
            ))}
            onSelectInvoice={(invoiceId) => updateState((current) => {
              const selectedInvoice = invoiceSummaries.find((invoice) => invoice.invoiceId === invoiceId)
              if (!invoiceId || !selectedInvoice) return { ...current, activeImportRunId: '', selectedBatch: '' }
              return selectedInvoice.sourceKind === 'generated' ? { ...current, activeImportRunId: invoiceId, selectedBatch: '' } : selectImportRun(current, invoiceId)
            })}
            onSelectTab={(customerWorkspaceTab) => updateState((current) => ({
              ...current,
              activeImportRunId: customerWorkspaceTab === 'invoices' ? '' : current.activeImportRunId,
              customerWorkspaceTab,
              selectedInvoiceCustomerKey: selectedCustomer.customerKey,
            }))}
            onToggleIncludeSla={() => updateState((current) => ({ ...current, includeSla: !current.includeSla }))}
            onUpdateInvoiceDocument={updateInvoiceDocument}
            reviewJobs={reviewJobs}
            reviewOverrides={state.jobReviewOverrides}
            selectedBatch={activeGeneratedInvoice ? state.selectedBatch : activeRun?.selectedBatch || ''}
            warnings={activeGeneratedInvoice ? [] : activeRun?.warnings || []}
            documents={activeGeneratedInvoice ? [] : activeRun?.documents || []}
          />
        )}
      </ErpShell>
    </AppProviders>
  )
}
