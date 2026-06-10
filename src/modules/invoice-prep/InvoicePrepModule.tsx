import { Alert, Button, Card, Space, Typography } from 'antd'
import { useState } from 'react'
import type { Customer, InvoiceBatch, InvoiceSummary, JobReviewOverride, PricedJob } from '../../domain/types'
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
  embedded,
  includeSla,
  invoiceLabel,
  invoiceSummaries,
  pricedJobs,
  selectedBatch,
  warnings,
  onCreateInvoice,
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
  embedded?: boolean
  includeSla: boolean
  invoiceLabel: string
  invoiceSummaries: InvoiceSummary[]
  pricedJobs: PricedJob[]
  selectedBatch: string
  warnings: string[]
  onCreateInvoice: (input: { customerFile: File; jiraFile: File; label: string; month: number; year: number }) => Promise<void>
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

  return (
    <>
      {!embedded ? <PageHeader title={`${customer.name} - Invoices${activeInvoice ? ` ${activeInvoice.label}` : ''}`} /> : null}
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary
          customer={customer}
          items={[
            { label: 'Legal ID', value: customer.customerLegalId || '-' },
            { label: 'Customer Key', value: customer.customerKey || '-' },
            { label: 'On Invoice', value: activeInvoice?.jobs ?? 0 },
            { label: 'Need Review', value: activeInvoice?.reviewCount ?? 0 },
            { label: 'Invoice Mode', value: customer.defaultInvoiceMode === 'task' ? 'Per Task' : 'Monthly' },
          ]}
        />
        <div className="toolbar-row">
          <div>
            <Typography.Text strong>Invoices</Typography.Text>
            <Typography.Text className="page-description">
              Open an invoice period or create a new invoice from the customer report and Jira report.
            </Typography.Text>
          </div>
          <Space size={8} wrap>
            <Button onClick={() => setCreateOpen(true)} type="primary">Create New Invoice</Button>
            <Button disabled={!activeInvoice} onClick={onDeleteInvoice}>Delete Invoice</Button>
          </Space>
        </div>
        <InvoiceSummaryTable invoices={invoiceSummaries} onSelectInvoice={onSelectInvoice} selectedInvoiceId={activeInvoiceId} />
      </Card>

      <InvoiceCreateModal
        existingPeriods={invoiceSummaries.map((invoice) => invoice.label)}
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
              <Button disabled={!pricedJobs.length} onClick={onExportPricedReport}>Export Priced Report</Button>
            </Space>
          </div>
          {warnings.map((warning) => <Alert key={warning} message={warning} showIcon type="warning" />)}
          <div className="toolbar-row"><span className="toolbar-count">{batches.length} batches</span></div>
          <InvoiceBatchTable batches={batches} onSelectBatch={onSelectBatch} selectedBatch={selected?.batch || ''} />
        </Card>
      ) : null}

      <InvoiceDetailPanel
        batch={selected}
        customer={customer}
        includeSla={includeSla}
        onExport={onExport}
        onSaveReviewOverride={onSaveReviewOverride}
        onToggleIncludeSla={onToggleIncludeSla}
      />
    </>
  )
}
