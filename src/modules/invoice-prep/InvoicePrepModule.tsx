import { Alert, Button, Card, Popconfirm, Space, Typography } from 'antd'
import { useState } from 'react'
import { getRateCardMode } from '../../domain/rateCards'
import type { Customer, InvoiceBatch, InvoiceSummary, JobReviewOverride, PricedJob } from '../../domain/types'
import type { RunDocumentMeta } from '../../state/appState'
import { PageHeader } from '../../design-system/PageHeader'
import { CustomerIndexTable } from '../customers/CustomerIndexTable'
import { CustomerSummary } from '../customers/CustomerSummary'
import { InvoiceBatchTable } from './InvoiceBatchTable'
import { InvoiceCreateModal } from './InvoiceCreateModal'
import { InvoiceDetailPanel } from './InvoiceDetailPanel'
import { InvoiceSummaryTable } from './InvoiceSummaryTable'

export function InvoicePrepModule({
  activeInvoiceId,
  batches,
  customer,
  customers,
  documents,
  embedded,
  includeSla,
  invoiceLabel,
  invoiceSummaries,
  pricedJobs,
  selectedBatch,
  warnings,
  onCreateInvoice,
  onAttachDocuments,
  onBulkMoveObh1ToReg,
  onUpdateDocument,
  onDeleteInvoice,
  onExport,
  onExportPricedReport,
  onSaveReviewOverride,
  onSelectBatch,
  onSelectCustomer,
  onSelectInvoice,
  onToggleIncludeSla,
}: {
  activeInvoiceId: string
  batches: InvoiceBatch[]
  customer: Customer | null
  customers: Customer[]
  documents: RunDocumentMeta[]
  embedded?: boolean
  includeSla: boolean
  invoiceLabel: string
  invoiceSummaries: InvoiceSummary[]
  pricedJobs: PricedJob[]
  selectedBatch: string
  warnings: string[]
  onCreateInvoice: (input: { customerFile?: File; jiraFile?: File; invoicePdf?: File; payinfoPdf?: File; label: string; month: number; year: number }) => Promise<void>
  onAttachDocuments: (input: { invoicePdf?: File; payinfoPdf?: File }) => Promise<void>
  onBulkMoveObh1ToReg: (jobIds: string[]) => void
  onUpdateDocument: (document: RunDocumentMeta) => void
  onDeleteInvoice: () => void
  onExport: (batch: InvoiceBatch) => void
  onExportPricedReport: () => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
  onSelectBatch: (batch: string) => void
  onSelectCustomer: (customerKey: string) => void
  onSelectInvoice: (invoiceId: string) => void
  onToggleIncludeSla: () => void
}) {
  const [createOpen, setCreateOpen] = useState(false)

  if (!customer) {
    if (embedded) return null
    return (
      <>
        <PageHeader title="Invoice Prep" />
        <CustomerIndexTable
          customers={customers}
          emptyText="No customers are available for invoice preparation."
          onOpenCustomer={onSelectCustomer}
        />
      </>
    )
  }

  const selected = batches.find((batch) => batch.batch === selectedBatch)
  const activeInvoice = invoiceSummaries.find((invoice) => invoice.invoiceId === activeInvoiceId) || null
  const jiraRequired = customer.locationCards.some((location) => getRateCardMode(location) === 'time-window')
  const settlementMode = customer.customerKey === 'AKAM'
  const visibleWarnings = jiraRequired
    ? warnings
    : warnings.filter((warning) => !warning.toLowerCase().includes('jira'))

  return (
    <>
      {!embedded ? <PageHeader title={`${customer.name} - ${settlementMode ? 'Settlements' : 'Invoices'}${activeInvoice ? ` ${activeInvoice.label}` : ''}`} /> : null}
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary
          customer={customer}
          items={[
            { label: 'Legal ID', value: customer.customerLegalId || '-' },
            { label: 'Customer Key', value: customer.customerKey || '-' },
            { label: settlementMode ? 'In Settlement' : 'On Invoice', value: activeInvoice?.jobs ?? 0 },
            { label: 'Need Review', value: activeInvoice?.reviewCount ?? 0 },
            { label: 'Invoice Mode', value: customer.defaultInvoiceMode === 'task' ? 'Per Task' : 'Monthly' },
          ]}
        />
        <div className="toolbar-row">
          <div />
          <Space size={8} wrap>
            <Button onClick={() => setCreateOpen(true)} type="primary">{settlementMode ? 'Import Settlement' : 'Create New Invoice'}</Button>
            <Popconfirm
              cancelText="Cancel"
              description={settlementMode ? 'This removes the current imported settlement run.' : 'This removes the current imported invoice run.'}
              okText={settlementMode ? 'Delete Settlement' : 'Delete Invoice'}
              okType="danger"
              title={settlementMode ? 'Delete this settlement?' : 'Delete this invoice?'}
              onConfirm={onDeleteInvoice}
            >
              <Button disabled={!activeInvoice || activeInvoice.sourceKind !== 'import'}>
                {settlementMode ? 'Delete Settlement' : 'Delete Invoice'}
              </Button>
            </Popconfirm>
          </Space>
        </div>
        <InvoiceSummaryTable invoices={invoiceSummaries} onSelectInvoice={onSelectInvoice} selectedInvoiceId={activeInvoiceId} />
      </Card>

      <InvoiceCreateModal
        existingPeriods={invoiceSummaries.map((invoice) => invoice.label)}
        jiraRequired={jiraRequired}
        settlementMode={settlementMode}
        onClose={() => setCreateOpen(false)}
        onCreateInvoice={onCreateInvoice}
        open={createOpen}
      />

      {activeInvoice ? (
        <Card className="workspace-card" variant="borderless">
          <div className="toolbar-row">
            <div>
              <Typography.Text strong>{invoiceLabel}</Typography.Text>
              <Typography.Text className="page-description">
                {activeInvoice.jobs} jobs · {activeInvoice.reviewCount} need review
              </Typography.Text>
            </div>
            <Space size={8} wrap>
              {activeInvoice.sourceKind === 'import' && jiraRequired ? <Button disabled={!pricedJobs.length} onClick={onExportPricedReport}>Export Priced Report</Button> : null}
            </Space>
          </div>
          {visibleWarnings.map((warning) => <Alert key={warning} message={warning} showIcon type="warning" />)}
          <InvoiceBatchTable batches={batches} onSelectBatch={onSelectBatch} selectedBatch={selected?.batch || ''} />
        </Card>
      ) : null}

      <InvoiceDetailPanel
        batch={selected}
        customer={customer}
        documents={activeInvoice?.sourceKind === 'import' ? documents : []}
        includeSla={includeSla}
        onAttachDocuments={activeInvoice?.sourceKind === 'import' ? onAttachDocuments : undefined}
        onBulkMoveObh1ToReg={onBulkMoveObh1ToReg}
        onExport={onExport}
        onSaveReviewOverride={onSaveReviewOverride}
        onUpdateDocument={activeInvoice?.sourceKind === 'import' ? onUpdateDocument : undefined}
        onToggleIncludeSla={onToggleIncludeSla}
      />
    </>
  )
}
