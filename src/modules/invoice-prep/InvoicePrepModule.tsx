import { InboxOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Space, Typography, Upload } from 'antd'
import type { UploadProps } from 'antd'
import { formatAmount } from '../../domain/money'
import type { Customer, InvoiceBatch, JobReviewOverride, PricedJob } from '../../domain/types'
import { PageHeader } from '../../design-system/PageHeader'
import { CustomerIndexTable } from '../customers/CustomerIndexTable'
import { CustomerSummary } from '../customers/CustomerSummary'
import { InvoiceBatchTable } from './InvoiceBatchTable'
import { InvoiceDetailPanel } from './InvoiceDetailPanel'
import type { StoredDocumentMeta } from '../../state/localDb'

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function documentLabel(kind: StoredDocumentMeta['kind']) {
  return kind === 'customer-report' ? 'Customer Report' : 'Jira Report'
}

export function InvoicePrepModule({
  batches,
  customer,
  customers,
  customerReportFileName,
  filter,
  jiraFileName,
  includeSla,
  pricedJobs,
  selectedBatch,
  storedDocuments,
  warnings,
  onExport,
  onExportPricedReport,
  onImportCustomerReport,
  onImportJiraReport,
  onReset,
  onSaveReviewOverride,
  onSelectBatch,
  onSelectCustomer,
  onSetFilter,
  onToggleIncludeSla,
}: {
  batches: InvoiceBatch[]
  customer: Customer | null
  customers: Customer[]
  customerReportFileName: string
  filter: string
  jiraFileName: string
  includeSla: boolean
  pricedJobs: PricedJob[]
  selectedBatch: string
  storedDocuments: StoredDocumentMeta[]
  warnings: string[]
  onExport: (batch: InvoiceBatch) => void
  onExportPricedReport: () => void
  onImportCustomerReport: (file: File) => void | Promise<void>
  onImportJiraReport: (file: File) => void | Promise<void>
  onReset: () => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
  onSelectBatch: (batch: string) => void
  onSelectCustomer: (customerKey: string) => void
  onSetFilter: (value: string) => void
  onToggleIncludeSla: () => void
}) {
  if (!customer) {
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

  const selected = batches.find((batch) => batch.batch === selectedBatch) ?? batches[0]
  const readyJobs = pricedJobs.filter((job) => job.queueState === 'Ready')
  const manualJobs = pricedJobs.length - readyJobs.length
  const readyTotal = readyJobs.reduce((sum, job) => sum + (job.totalAmount || 0), 0)
  const metrics = [
    { label: 'Customer Report', value: customerReportFileName || 'Not loaded' },
    { label: 'Jira Report', value: jiraFileName || 'Not loaded' },
    { label: 'Local Documents', value: storedDocuments.length },
    { label: 'Auto Calculated', value: readyJobs.length },
    { label: 'Manual Calculations', value: manualJobs },
    { label: 'Invoice Batches', value: batches.length },
    { label: 'SLA', value: includeSla ? 'Included' : 'Excluded' },
    { label: 'Ready Revenue', value: formatAmount('EUR', readyTotal) },
  ]

  const customerUploadProps: UploadProps = {
    accept: '.xlsx,.csv',
    beforeUpload: (file) => {
      void onImportCustomerReport(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }
  const jiraUploadProps: UploadProps = {
    accept: '.csv',
    beforeUpload: (file) => {
      void onImportJiraReport(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }

  return (
    <>
      <PageHeader title={customer.name} />
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary customer={customer} />
        <div className="toolbar-row">
          <div>
            <Typography.Text strong>Invoice Prep</Typography.Text>
            <Typography.Text className="page-description">
              {customerReportFileName || 'No customer report loaded'} · {jiraFileName || 'No Jira report loaded'}
            </Typography.Text>
          </div>
          <Space size={8} wrap>
            <Button disabled={!pricedJobs.length} onClick={onExportPricedReport}>Export Priced Report</Button>
            <Button onClick={onReset}>Clear Report</Button>
          </Space>
        </div>
        <div className="metric-strip invoice-metric-strip">
          {metrics.map((metric) => (
            <div className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
        <div className="pricing-upload-row pricing-upload-grid">
          <Upload.Dragger {...customerUploadProps}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Upload customer report</p>
            <p className="ant-upload-hint">{customerReportFileName || 'XLSX first sheet or CSV'}</p>
          </Upload.Dragger>
          <Upload.Dragger {...jiraUploadProps}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Upload Jira report</p>
            <p className="ant-upload-hint">{jiraFileName || 'CSV export for the same month'}</p>
          </Upload.Dragger>
        </div>
        {storedDocuments.length ? (
          <div className="document-store-list">
            {storedDocuments.map((document) => (
              <div className="info-field" key={document.id}>
                <span>{documentLabel(document.kind)}</span>
                <strong>{document.fileName} · {formatFileSize(document.size)} · {new Date(document.uploadedAt).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {warnings.map((warning) => <Alert key={warning} message={warning} showIcon type="warning" />)}
      </Card>

      <Card className="workspace-card" variant="borderless">
        <div className="toolbar-row">
          <Input className="toolbar-search" placeholder="Search batch, period, ticket, city" value={filter} onChange={(event) => onSetFilter(event.target.value)} />
          <span className="toolbar-count">{batches.length} batches</span>
        </div>
        <InvoiceBatchTable batches={batches} selectedBatch={selected?.batch || ''} onSelectBatch={onSelectBatch} />
      </Card>

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
