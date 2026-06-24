import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import type { Customer, InvoiceBatch, InvoiceSummary, JobInput, JobReviewOverride, PricedJob } from '../../domain/types'
import type { RunDocumentMeta } from '../../state/appState'
import { CreateJobModule } from '../create-job/CreateJobModule'
import { InvoicePrepModule } from '../invoice-prep/InvoicePrepModule'
import { ReviewQueueModule } from '../review-queue/ReviewQueueModule'
import { CustomerProfileModule } from './CustomerProfileModule'
import { CustomerWorkspaceModule } from './CustomerWorkspaceModule'
import { CustomersModule } from './CustomersModule'
import { TechniciansModule } from './TechniciansModule'

export function CustomerWorkspaceView({
  activeInvoiceId,
  activeInvoiceLabel,
  activeTab,
  batches,
  createdJobs,
  customer,
  customers,
  fortnoxArticles,
  includeSla,
  invoiceJobs,
  invoiceSummaries,
  documents,
  reviewJobs,
  reviewOverrides,
  selectedBatch,
  warnings,
  onAttachInvoiceDocuments,
  onBulkMoveObh1ToReg,
  onUpdateInvoiceDocument,
  onBackToCustomers,
  onCreateInvoice,
  onCreateJob,
  onCustomerChange,
  onDeleteCreatedJob,
  onDeleteInvoice,
  onExport,
  onExportPricedReport,
  onOpenCustomerWorkspace,
  onSaveReviewOverride,
  onSelectBatch,
  onSelectInvoice,
  onSelectTab,
  onToggleIncludeSla,
}: {
  activeInvoiceId: string
  activeInvoiceLabel: string
  activeTab: 'profile' | 'rate-cards' | 'create-job' | 'invoices' | 'review-queue' | 'technicians'
  batches: InvoiceBatch[]
  createdJobs: JobInput[]
  customer: Customer
  customers: Customer[]
  fortnoxArticles: FortnoxArticleMap
  includeSla: boolean
  invoiceJobs: PricedJob[]
  invoiceSummaries: InvoiceSummary[]
  documents: RunDocumentMeta[]
  reviewJobs: PricedJob[]
  reviewOverrides: Record<string, JobReviewOverride>
  selectedBatch: string
  warnings: string[]
  onAttachInvoiceDocuments: (input: { invoicePdf?: File; payinfoPdf?: File }) => Promise<void>
  onBulkMoveObh1ToReg: (jobIds: string[]) => void
  onUpdateInvoiceDocument: (document: RunDocumentMeta) => void
  onBackToCustomers: () => void
  onCreateInvoice: (input: { customerFile?: File; jiraFile?: File; invoicePdf?: File; payinfoPdf?: File; label: string; month: number; year: number }) => Promise<void>
  onCreateJob: (job: JobInput) => void
  onCustomerChange: (customer: Customer, previousKey?: string) => void
  onDeleteCreatedJob: (jobId: string) => void
  onDeleteInvoice: () => void
  onExport: (batch: InvoiceBatch) => void
  onExportPricedReport: () => void
  onOpenCustomerWorkspace: (customerKey: string) => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
  onSelectBatch: (batch: string) => void
  onSelectInvoice: (invoiceId: string) => void
  onSelectTab: (tab: 'profile' | 'rate-cards' | 'create-job' | 'invoices' | 'review-queue' | 'technicians') => void
  onToggleIncludeSla: () => void
}) {
  const showCreateJob = customer.locationCards.length > 0
  const showTechnicians = customer.customerKey === 'AKAM'
  const needsReviewCount = reviewJobs.filter((job) => job.queueState !== 'Ready').length
  const effectiveActiveTab = !showCreateJob && activeTab === 'create-job'
    ? 'rate-cards'
    : !showTechnicians && activeTab === 'technicians'
      ? 'profile'
      : activeTab

  return (
    <CustomerWorkspaceModule
      activeInvoiceLabel={effectiveActiveTab === 'invoices' ? activeInvoiceLabel : ''}
      activeTab={effectiveActiveTab}
      customer={customer}
      createJobContent={(
        <CreateJobModule
          customer={customer}
          fortnoxArticles={fortnoxArticles}
          jobs={createdJobs}
          onCreateJob={onCreateJob}
          onDeleteJob={onDeleteCreatedJob}
          onSaveReviewOverride={onSaveReviewOverride}
          reviewOverrides={reviewOverrides}
        />
      )}
      invoicesContent={(
        <InvoicePrepModule
          activeInvoiceId={activeInvoiceId}
          batches={batches}
          customer={customer}
          customers={customers}
          documents={documents}
          embedded
          includeSla={includeSla}
          invoiceLabel={activeInvoiceLabel}
          invoiceSummaries={invoiceSummaries}
          onAttachDocuments={onAttachInvoiceDocuments}
          onBulkMoveObh1ToReg={onBulkMoveObh1ToReg}
          onCreateInvoice={onCreateInvoice}
          onDeleteInvoice={onDeleteInvoice}
          onExport={onExport}
          onExportPricedReport={onExportPricedReport}
          onSaveReviewOverride={onSaveReviewOverride}
          onSelectBatch={onSelectBatch}
          onSelectCustomer={onOpenCustomerWorkspace}
          onSelectInvoice={onSelectInvoice}
          onToggleIncludeSla={onToggleIncludeSla}
          onUpdateDocument={onUpdateInvoiceDocument}
          pricedJobs={invoiceJobs}
          selectedBatch={selectedBatch}
          warnings={warnings}
        />
      )}
      onBackToCustomers={onBackToCustomers}
      onSelectTab={onSelectTab}
      profileContent={(
        <CustomerProfileModule
          customer={customer}
          customers={customers}
          invoiceCount={invoiceSummaries.length}
          needsReviewCount={needsReviewCount}
          onCustomerChange={onCustomerChange}
        />
      )}
      rateCardsContent={(
        <CustomersModule
          customers={customers}
          embedded
          fortnoxArticles={fortnoxArticles}
          onCustomerChange={onCustomerChange}
          onSelectCustomer={onOpenCustomerWorkspace}
          selectedCustomerKey={customer.customerKey}
        />
      )}
      showCreateJob={showCreateJob}
      reviewQueueContent={(
        <ReviewQueueModule
          customer={customer}
          customers={customers}
          embedded
          onSaveReviewOverride={onSaveReviewOverride}
          onSelectCustomer={onOpenCustomerWorkspace}
          pricedJobs={reviewJobs}
        />
      )}
      showTechnicians={showTechnicians}
      techniciansContent={(
        <TechniciansModule
          customer={customer}
          onCustomerChange={onCustomerChange}
        />
      )}
    />
  )
}
