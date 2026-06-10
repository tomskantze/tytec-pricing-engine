import { useEffect, useMemo, useState } from 'react'
import { buildInvoiceBatches, invoiceBatchToCsv } from './domain/invoices'
import { priceJobs } from './domain/pricing'
import { setFortnoxArticleNumber } from './domain/fortnoxArticles'
import type { FortnoxLineKind } from './domain/fortnoxArticles'
import type { Customer, InvoiceBatch, JobReviewOverride, ShiftLabel } from './domain/types'
import { AppProviders } from './design-system/AppProviders'
import { hydrateState, loadState, saveState, type ActiveView, type AppState } from './state/appState'
import { loadDbState, saveDbState, saveUploadedDocument } from './state/localDb'
import {
  createRunForCustomer,
  deleteActiveImportRun,
  getActiveImportRun,
  getCustomerImportRuns,
  saveRunReviewOverride,
  selectImportRun,
  setCustomerReportOnRun,
  setJiraReportOnRun,
  setRunSelectedBatch,
} from './state/importRuns'
import { ErpShell } from './shell/ErpShell'
import { CustomerWorkspaceModule } from './modules/customers/CustomerWorkspaceModule'
import { CustomersModule } from './modules/customers/CustomersModule'
import { FortnoxModule } from './modules/fortnox/FortnoxModule'
import { InvoicePrepModule } from './modules/invoice-prep/InvoicePrepModule'
import { ReviewQueueModule } from './modules/review-queue/ReviewQueueModule'
import { importJiraIssuesFromText } from './import/jiraReport'
import { pricedCustomerReportToXlsx } from './import/pricedReportExport'
import { importCustomerReportFile } from './import/customerReport'
import { buildInvoiceSummary } from './modules/invoice-prep/invoiceSummary'
import { downloadBlob, downloadText } from './shared/download'

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
  const invoiceCustomer = useMemo(
    () => state.customers.find((customer) => customer.customerKey === state.selectedInvoiceCustomerKey) ?? null,
    [state.customers, state.selectedInvoiceCustomerKey],
  )
  const fortnoxCustomer = useMemo(
    () => state.customers.find((customer) => customer.customerKey === state.selectedFortnoxCustomerKey) ?? null,
    [state.customers, state.selectedFortnoxCustomerKey],
  )
  const activeRun = useMemo(() => getActiveImportRun(state), [state])
  const customerImportRuns = useMemo(
    () => (invoiceCustomer ? getCustomerImportRuns(state, invoiceCustomer.customerKey) : []),
    [invoiceCustomer, state],
  )
  const invoiceSummaries = useMemo(
    () => (invoiceCustomer ? customerImportRuns.map((invoice) => buildInvoiceSummary(invoiceCustomer, invoice, state.fortnoxArticles)) : []),
    [customerImportRuns, invoiceCustomer, state.fortnoxArticles],
  )
  const pricedJobs = useMemo(
    () => (
      invoiceCustomer && activeRun
        ? priceJobs(invoiceCustomer, activeRun.jobs, activeRun.jobReviewOverrides, state.fortnoxArticles)
        : []
    ),
    [invoiceCustomer, activeRun, state.fortnoxArticles],
  )
  const batches = useMemo(() => {
    if (!invoiceCustomer) return []
    return buildInvoiceBatches(invoiceCustomer, pricedJobs, state.includeSla)
  }, [pricedJobs, invoiceCustomer, state.includeSla])

  function navigate(activeView: ActiveView) {
    updateState((current) => (
      activeView === 'customers'
        ? { ...current, activeView, selectedCustomerKey: '' }
        : { ...current, activeView }
    ))
  }

  function openCustomerWorkspace(customerKey: string) {
    updateState((current) => ({
      ...current,
      activeView: 'customers',
      customerWorkspaceTab: 'overview',
      activeImportRunId: '',
      selectedCustomerKey: customerKey,
      selectedInvoiceCustomerKey: customerKey,
    }))
  }

  function exportBatch(batch: InvoiceBatch) {
    downloadText(`${batch.batch}.csv`, 'text/csv;charset=utf-8', invoiceBatchToCsv(batch, state.includeSla))
  }

  function exportPricedReport() {
    if (!activeRun) return
    const baseName = activeRun.customerReportFileName.replace(/\.[^.]+$/, '') || 'customer-report'
    downloadBlob(
      `${baseName}-priced.xlsx`,
      pricedCustomerReportToXlsx(pricedJobs, activeRun.customerReportHeaders, activeRun.customerReportSheetName),
    )
  }

  function saveReviewOverride(jobId: string, override: JobReviewOverride | null) {
    updateState((current) => saveRunReviewOverride(current, jobId, override))
  }

  async function createInvoice(input: { customerFile: File; jiraFile: File; label: string; month: number; year: number }) {
    if (!invoiceCustomer) return
    const customerResult = await importCustomerReportFile(invoiceCustomer, input.customerFile)
    const jiraResult = importJiraIssuesFromText(await input.jiraFile.text())
    await Promise.all([
      saveUploadedDocument('customer-report', input.customerFile),
      saveUploadedDocument('jira-report', input.jiraFile),
    ])
    updateState((current) => {
      let next = createRunForCustomer(current, invoiceCustomer.customerKey, input.label, input.month, input.year)
      next = setCustomerReportOnRun(next, invoiceCustomer.customerKey, customerResult, input.customerFile)
      next = setJiraReportOnRun(next, invoiceCustomer.customerKey, jiraResult, input.jiraFile)
      return next
    })
  }

  function saveCustomer(customer: Customer, previousKey?: string) {
    updateState((current) => {
      const lookupKey = previousKey || customer.customerKey
      const exists = current.customers.some((currentCustomer) => currentCustomer.customerKey === lookupKey)
      const customers = exists
        ? current.customers.map((currentCustomer) => (currentCustomer.customerKey === lookupKey ? customer : currentCustomer))
        : [customer, ...current.customers]
      const selectedFortnoxCustomerKey =
        current.selectedFortnoxCustomerKey === lookupKey ? customer.customerKey : current.selectedFortnoxCustomerKey
      const selectedInvoiceCustomerKey =
        current.selectedInvoiceCustomerKey === lookupKey ? customer.customerKey : current.selectedInvoiceCustomerKey
      return {
        ...current,
        customers,
        selectedCustomerKey: customer.customerKey,
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

  return (
    <AppProviders>
      <ErpShell activeView={state.activeView} onNavigate={navigate}>
        {state.activeView === 'fortnox' ? (
          <FortnoxModule
            customer={fortnoxCustomer}
            customers={state.customers}
            fortnoxArticles={state.fortnoxArticles}
            onSelectCustomer={(selectedFortnoxCustomerKey) => updateState({ selectedFortnoxCustomerKey })}
            onSetArticle={saveFortnoxArticle}
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
          <CustomerWorkspaceModule
            activeInvoiceLabel={state.customerWorkspaceTab === 'invoices' ? activeRun?.label || '' : ''}
            activeTab={state.customerWorkspaceTab}
            customer={selectedCustomer}
            invoicesContent={(
              <InvoicePrepModule
                activeInvoiceId={activeRun?.id || ''}
                batches={batches}
                customer={selectedCustomer}
                customers={state.customers}
                embedded
                invoiceSummaries={invoiceSummaries}
                invoiceLabel={activeRun?.label || ''}
                onExport={exportBatch}
                onExportPricedReport={exportPricedReport}
                onCreateInvoice={createInvoice}
                onDeleteInvoice={() => updateState((current) => deleteActiveImportRun(current))}
                includeSla={state.includeSla}
                onSaveReviewOverride={saveReviewOverride}
                onSelectBatch={(selectedBatch) => updateState((current) => setRunSelectedBatch(current, selectedBatch))}
                onSelectCustomer={openCustomerWorkspace}
                onSelectInvoice={(invoiceId) => updateState((current) => (
                  invoiceId
                    ? selectImportRun(current, invoiceId)
                    : { ...current, activeImportRunId: '' }
                ))}
                onToggleIncludeSla={() => updateState((current) => ({ ...current, includeSla: !current.includeSla }))}
                pricedJobs={pricedJobs}
                selectedBatch={activeRun?.selectedBatch || ''}
                warnings={activeRun?.warnings || []}
              />
            )}
            onBackToCustomers={() => updateState((current) => ({
              ...current,
              activeView: 'customers',
              activeImportRunId: '',
              selectedCustomerKey: '',
              selectedInvoiceCustomerKey: '',
            }))}
            onSelectTab={(customerWorkspaceTab) => updateState((current) => ({
              ...current,
              activeImportRunId: customerWorkspaceTab === 'invoices' ? '' : current.activeImportRunId,
              customerWorkspaceTab,
              selectedInvoiceCustomerKey: selectedCustomer.customerKey,
            }))}
            overviewContent={(
              <CustomersModule
                customers={state.customers}
                embedded
                fortnoxArticles={state.fortnoxArticles}
                onCustomerChange={saveCustomer}
                onSelectCustomer={openCustomerWorkspace}
                selectedCustomerKey={selectedCustomer.customerKey}
              />
            )}
            reviewQueueContent={(
              <ReviewQueueModule
                customer={selectedCustomer}
                customers={state.customers}
                embedded
                onSaveReviewOverride={saveReviewOverride}
                onSelectCustomer={openCustomerWorkspace}
                pricedJobs={pricedJobs}
              />
            )}
          />
        )}
      </ErpShell>
    </AppProviders>
  )
}
