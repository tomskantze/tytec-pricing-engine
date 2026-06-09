import { Button, Card, Space, Table, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { formatFortnoxArticleNumbers } from '../../domain/fortnoxArticles'
import { formatAmount, formatHours, formatJobTotal, formatOptionalAmount } from '../../domain/money'
import type { Customer, InvoiceBatch, JobReviewOverride, PricedJob } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'
import { InvoiceManualOverridePanel } from './InvoiceManualOverridePanel'

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

function getColumns(): ErpTableColumn<PricedJob>[] {
  return [
    { title: 'Date', dataIndex: 'date', erpSize: 'date' },
    { title: 'Ticket', dataIndex: 'jiraIssueKey', erpSize: 'compact' },
    { title: 'Customer Ref', dataIndex: 'ticket', erpSize: 'compact' },
    { title: 'Articles', erpSize: 'compact', render: (_, job) => formatFortnoxArticleNumbers(job.pricing?.lineItems) },
    { title: 'Summary', render: (_, job) => job.jiraSummary || job.summary, erpSize: 'text' },
    { title: 'City', dataIndex: 'city', erpSize: 'normal' },
    {
      title: 'Call-Out',
      erpSize: 'money',
      render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null
        ? '-'
        : job.pricing?.crossedShift ? 'Split Shift' : formatOptionalAmount(job.currency, job.pricing?.callOutFee || 0),
    },
    { title: 'BH', erpSize: 'money', render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.bh || 0) },
    { title: 'BH Amount', erpSize: 'money', render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.bhAmount || 0) },
    { title: 'OBH', erpSize: 'money', render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.obh || 0) },
    { title: 'OBH Amount', erpSize: 'money', render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.obhAmount || 0) },
    { title: 'WH', erpSize: 'money', render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.wh || 0) },
    { title: 'WH Amount', erpSize: 'money', render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.whAmount || 0) },
    { title: 'Consumables', erpSize: 'money', render: (_, job) => formatOptionalAmount(job.currency, job.consumablesAmount) },
    { title: 'Final', erpSize: 'money', render: (_, job) => formatJobTotal(job.currency, job.totalAmount) },
    {
      title: 'Status',
      erpSize: 'status',
      render: (_, job) => <StatusBadge label={job.queueState} tone={statusTone(job.queueState)} />,
    },
  ]
}

function metaItem(label: string, value: string) {
  return (
    <span className="invoice-detail-item">
      <strong>{label}:</strong> {value}
    </span>
  )
}

export function InvoiceDetailPanel({
  batch,
  customer,
  includeSla,
  onExport,
  onSaveReviewOverride,
  onToggleIncludeSla,
}: {
  batch?: InvoiceBatch
  customer: Customer
  includeSla: boolean
  onExport: (batch: InvoiceBatch) => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
  onToggleIncludeSla: () => void
}) {
  const [selectedJobId, setSelectedJobId] = useState('')
  const jobs = batch?.items ?? []

  useEffect(() => {
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) setSelectedJobId('')
  }, [jobs, selectedJobId])

  if (!batch) return null
  const slaDisplayTotal = batch.slaLines.reduce((sum, line) => sum + line.amount, 0)
  const jobTotal = batch.items.some((job) => job.totalAmount == null)
    ? null
    : batch.items.reduce((sum, job) => sum + (job.totalAmount ?? 0), 0)

  return (
    <Card className="section-card invoice-detail-card" variant="borderless">
      <div className="invoice-detail-head">
        <div className="invoice-detail-meta">
          <Typography.Text strong>{batch.batch}</Typography.Text>
          <div className="invoice-detail-meta-items">
            {metaItem('Customer', batch.customer)}
            {metaItem('Mode', batch.invoiceMode)}
            {metaItem('Period', batch.period)}
            {metaItem('Jobs', `${batch.jobs}`)}
            {metaItem('Job Total', formatJobTotal(batch.currency, jobTotal))}
            {slaDisplayTotal > 0 ? metaItem('SLA', `${includeSla ? 'Included' : 'Excluded'} ${formatAmount(batch.currency, slaDisplayTotal)}`) : null}
            {metaItem('Total', formatJobTotal(batch.currency, batch.total))}
          </div>
        </div>
        <Space size={8}>
          <Button
            disabled={!slaDisplayTotal}
            onClick={onToggleIncludeSla}
            type={includeSla && slaDisplayTotal ? 'primary' : 'default'}
          >
            SLA {includeSla ? 'Included' : 'Excluded'}
          </Button>
          <Button onClick={() => onExport(batch)}>Export CSV</Button>
        </Space>
      </div>
      <ErpDataTable<PricedJob>
        className="nested-table invoice-job-table"
        columns={getColumns()}
        dataSource={batch.items}
        expandable={{
          expandedRowKeys: selectedJobId ? [selectedJobId] : [],
          expandedRowRender: (job) => (
            <InvoiceManualOverridePanel customer={customer} job={job} onSaveOverride={onSaveReviewOverride} />
          ),
          showExpandColumn: false,
        }}
        onRow={(job) => ({ onClick: () => setSelectedJobId((current) => (current === job.id ? '' : job.id)) })}
        rowClassName={(job) => (job.id === selectedJobId ? 'selected-row' : '')}
        rowKey="id"
        scroll={{ x: 1420 }}
        summary={() => (
          <Table.Summary>
            {batch.slaLines.map((line) => (
              <Table.Summary.Row className={`invoice-summary-row${includeSla ? '' : ' is-muted'}`} key={line.label}>
                <Table.Summary.Cell index={0} colSpan={3} />
                <Table.Summary.Cell index={3}>{line.articleNumber ?? '-'}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} colSpan={10}>{line.label}</Table.Summary.Cell>
                <Table.Summary.Cell index={14}>{formatAmount(line.currency, line.amount)}</Table.Summary.Cell>
                <Table.Summary.Cell index={15} />
              </Table.Summary.Row>
            ))}
            <Table.Summary.Row className="invoice-summary-row invoice-total-row">
              <Table.Summary.Cell index={0} colSpan={14}>
                <strong>Monthly Total</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={14}>
                <strong>{formatJobTotal(batch.currency, batch.total)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={15} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  )
}
