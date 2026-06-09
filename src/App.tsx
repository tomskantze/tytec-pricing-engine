import { useEffect, useMemo, useState } from 'react'
import { buildInvoiceBatches, invoiceBatchToCsv } from './domain/invoices'
import { priceJobs } from './domain/pricing'
import { setFortnoxArticleNumber } from './domain/fortnoxArticles'
import type { FortnoxLineKind } from './domain/fortnoxArticles'
import type { Customer, InvoiceBatch, JobReviewOverride, ShiftLabel } from './domain/types'
import { AppProviders } from './design-system/AppProviders'
import { hydrateState, loadState, saveState, type ActiveView, type AppState } from './state/appState'
import {
  clearUploadedDocuments,
  listUploadedDocuments,
  loadDbState,
  saveDbState,
  saveUploadedDocument,
  type StoredDocumentMeta,
} from './state/localDb'
import { ErpShell } from './shell/ErpShell'
import { CustomersModule } from './modules/customers/CustomersModule'
import { FortnoxModule } from './modules/fortnox/FortnoxModule'
import { InvoicePrepModule } from './modules/invoice-prep/InvoicePrepModule'
import { ReviewQueueModule } from './modules/review-queue/ReviewQueueModule'
import { importJiraIssuesFromText, mergeJobsWithJira } from './import/jiraReport'
import { pricedCustomerReportToXlsx } from './import/pricedReportExport'
import { importCustomerReportFile } from './import/telesolReport'
import { downloadBlob, downloadText } from './shared/download'

function batchMatches(batch: InvoiceBatch, query: string): boolean {
  if (!query) return true
  const haystack = [
    batch.batch,
    batch.customer,
    batch.businessEntity,
    batch.invoiceMode,
    batch.period,
    ...batch.items.flatMap((job) => [job.ticket, job.jiraIssueKey, job.jiraSummary, job.city, job.country, job.customerRef]),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [storedDocuments, setStoredDocuments] = useState<StoredDocumentMeta[]>([])

  async function refreshStoredDocuments() {
    setStoredDocuments(await listUploadedDocuments())
  }

  useEffect(() => {
    let isMounted = true
    void Promise.all([loadDbState(), listUploadedDocuments()]).then(([dbState, documents]) => {
      if (!isMounted) return
      if (dbState) {
        const hydratedState = hydrateState(dbState)
        setState(hydratedState)
        saveState(hydratedState)
        void saveDbState(hydratedState)
      }
      setStoredDocuments(documents)
    })
    return () => {
      isMounted = false
    }
  }, [])

  function updateState(next: Partial<AppState> | ((current: AppState) => AppState)) {
    setState((current) => {
      const updated = typeof next === 'function' ? next(current) : { ...current, ...next }
      saveState(updated)
      void saveDbState(updated)
      return updated
    })
  }

  const invoiceCustomer = useMemo(
    () => state.customers.find((customer) => customer.customerKey === state.selectedInvoiceCustomerKey) ?? null,
    [state.customers, state.selectedInvoiceCustomerKey],
  )
  const pricedJobs = useMemo(
    () => (invoiceCustomer ? priceJobs(invoiceCustomer, state.jobs, state.jobReviewOverrides, state.fortnoxArticles) : []),
    [invoiceCustomer, state.jobs, state.jobReviewOverrides, state.fortnoxArticles],
  )
  const batches = useMemo(() => {
    if (!invoiceCustomer) return []
    const query = state.filter.trim().toLowerCase()
    return buildInvoiceBatches(invoiceCustomer, pricedJobs, state.includeSla).filter((batch) => batchMatches(batch, query))
  }, [pricedJobs, invoiceCustomer, state.filter, state.includeSla])

  function navigate(activeView: ActiveView) {
    updateState((current) =>
      activeView === 'customers'
        ? { ...current, activeView, selectedCustomerKey: '' }
        : { ...current, activeView, selectedInvoiceCustomerKey: '' },
    )
  }

  function resetReport() {
    updateState({
      customerJobs: [],
      jiraIssues: [],
      customerReportHeaders: [],
      customerReportFileName: '',
      customerReportSheetName: '',
      jiraFileName: '',
      jobs: [],
      jobReviewOverrides: {},
      fileName: '',
      warnings: [],
      selectedBatch: '',
      filter: '',
    })
    void clearUploadedDocuments().then(refreshStoredDocuments)
  }

  function exportBatch(batch: InvoiceBatch) {
    downloadText(`${batch.batch}.csv`, 'text/csv;charset=utf-8', invoiceBatchToCsv(batch, state.includeSla))
  }

  function mergeImportState(current: AppState, next: Partial<AppState>, warnings: string[]) {
    const customerJobs = next.customerJobs ?? current.customerJobs
    const jiraIssues = next.jiraIssues ?? current.jiraIssues
    const merged = mergeJobsWithJira(customerJobs, jiraIssues)
    return {
      ...current,
      ...next,
      customerJobs,
      jiraIssues,
      jobs: merged.jobs,
      warnings: [...warnings, ...merged.warnings],
      selectedBatch: '',
      activeView: 'invoice-prep' as const,
    }
  }

  async function importCustomerReport(file: File) {
    const result = await importCustomerReportFile(file)
    await saveUploadedDocument('customer-report', file)
    await refreshStoredDocuments()
    updateState((current) =>
      mergeImportState(
        current,
        {
          customerJobs: result.jobs,
          jobReviewOverrides: {},
          customerReportHeaders: result.headers ?? [],
          customerReportFileName: file.name,
          customerReportSheetName: result.sheetName ?? '',
          fileName: file.name,
        },
        result.warnings,
      ),
    )
  }

  async function importJiraReport(file: File) {
    const result = importJiraIssuesFromText(await file.text())
    await saveUploadedDocument('jira-report', file)
    await refreshStoredDocuments()
    updateState((current) => mergeImportState(current, { jiraIssues: result.issues, jiraFileName: file.name }, result.warnings))
  }

  function exportPricedReport() {
    const baseName = state.customerReportFileName.replace(/\.[^.]+$/, '') || 'customer-report'
    downloadBlob(`${baseName}-priced.xlsx`, pricedCustomerReportToXlsx(pricedJobs, state.customerReportHeaders, state.customerReportSheetName))
  }

  function saveReviewOverride(jobId: string, override: JobReviewOverride | null) {
    updateState((current) => {
      const nextOverrides = { ...current.jobReviewOverrides }
      const hasAmounts = override && [
        override.manualLaborAmount,
        override.manualTravelAmount,
        override.manualConsumablesAmount,
        override.manualFinalAmount,
      ].some((value) => value != null)
      if (override && (override.approved || override.forceReview || override.treatAsLocationId || hasAmounts || override.note)) {
        nextOverrides[jobId] = override
      }
      else delete nextOverrides[jobId]
      return { ...current, jobReviewOverrides: nextOverrides }
    })
  }

  function saveCustomer(customer: Customer, previousKey?: string) {
    updateState((current) => {
      const lookupKey = previousKey || customer.customerKey
      const exists = current.customers.some((currentCustomer) => currentCustomer.customerKey === lookupKey)
      const customers = exists
        ? current.customers.map((currentCustomer) => (currentCustomer.customerKey === lookupKey ? customer : currentCustomer))
        : [customer, ...current.customers]
      const selectedInvoiceCustomerKey =
        current.selectedInvoiceCustomerKey === lookupKey ? customer.customerKey : current.selectedInvoiceCustomerKey
      return { ...current, customers, selectedCustomerKey: customer.customerKey, selectedInvoiceCustomerKey, activeView: 'customers' }
    })
  }

  function saveFortnoxArticle(locationId: string, shift: ShiftLabel, kind: FortnoxLineKind, articleNumber: string) {
    updateState((current) => ({
      ...current,
      fortnoxArticles: setFortnoxArticleNumber(current.fortnoxArticles, locationId, shift, kind, articleNumber),
    }))
  }

  return (
    <AppProviders>
      <ErpShell activeView={state.activeView} onNavigate={navigate}>
        {state.activeView === 'customers' ? (
          <CustomersModule
            customers={state.customers}
            fortnoxArticles={state.fortnoxArticles}
            onCustomerChange={saveCustomer}
            onSelectCustomer={(selectedCustomerKey) => updateState({ selectedCustomerKey })}
            selectedCustomerKey={state.selectedCustomerKey}
          />
        ) : state.activeView === 'fortnox' ? (
          <FortnoxModule
            customer={invoiceCustomer}
            customers={state.customers}
            fortnoxArticles={state.fortnoxArticles}
            onSelectCustomer={(selectedInvoiceCustomerKey) => updateState({ selectedInvoiceCustomerKey })}
            onSetArticle={saveFortnoxArticle}
          />
        ) : state.activeView === 'review-queue' ? (
          <ReviewQueueModule
            customer={invoiceCustomer}
            customers={state.customers}
            onSaveReviewOverride={saveReviewOverride}
            onSelectCustomer={(selectedInvoiceCustomerKey) => updateState({ selectedInvoiceCustomerKey })}
            pricedJobs={pricedJobs}
          />
        ) : (
          <InvoicePrepModule
            batches={batches}
            customer={invoiceCustomer}
            customers={state.customers}
            customerReportFileName={state.customerReportFileName}
            filter={state.filter}
            jiraFileName={state.jiraFileName}
            onExport={exportBatch}
            onExportPricedReport={exportPricedReport}
            onImportCustomerReport={importCustomerReport}
            onImportJiraReport={importJiraReport}
            onReset={resetReport}
            includeSla={state.includeSla}
            onSaveReviewOverride={saveReviewOverride}
            onSelectBatch={(selectedBatch) => updateState({ selectedBatch })}
            onSelectCustomer={(selectedInvoiceCustomerKey) => updateState({ selectedInvoiceCustomerKey })}
            onToggleIncludeSla={() => updateState((current) => ({ ...current, includeSla: !current.includeSla }))}
            onSetFilter={(filter) => updateState({ filter, selectedBatch: '' })}
            pricedJobs={pricedJobs}
            selectedBatch={state.selectedBatch}
            storedDocuments={storedDocuments}
            warnings={state.warnings}
          />
        )}
      </ErpShell>
    </AppProviders>
  )
}
