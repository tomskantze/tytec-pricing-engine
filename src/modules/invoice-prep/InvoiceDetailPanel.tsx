import { Button, Card, Space, Table, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { formatAmount, formatHours, formatJobTotal, formatOptionalAmount } from '../../domain/money'
import type { Customer, InvoiceBatch, JobReviewOverride, PricedJob, SlaLine } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'
import { InvoiceManualOverridePanel } from './InvoiceManualOverridePanel'

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

function stringSort(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function numberSort(left: number | null | undefined, right: number | null | undefined) {
  return (left ?? Number.NEGATIVE_INFINITY) - (right ?? Number.NEGATIVE_INFINITY)
}

function dateSort(left: string, right: string) {
  const parse = (value: string) => {
    const match = value.match(/^(\d{2})\s([A-Z]{3})\s(\d{4})$/)
    if (!match) return Number.NEGATIVE_INFINITY
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    return new Date(Number(match[3]), months.indexOf(match[2]), Number(match[1])).getTime()
  }
  return parse(left) - parse(right)
}

function getColumns(): ErpTableColumn<PricedJob>[] {
  return [
    { title: 'Date', dataIndex: 'date', erpSize: 'date', sorter: (left, right) => dateSort(left.date, right.date), width: 102 },
    { title: 'Ticket', dataIndex: 'jiraIssueKey', erpSize: 'compact', sorter: (left, right) => stringSort(left.jiraIssueKey || '', right.jiraIssueKey || ''), width: 88 },
    { title: 'Customer Ref', dataIndex: 'ticket', erpSize: 'compact', sorter: (left, right) => stringSort(left.ticket, right.ticket), width: 128 },
    { title: 'Technician', dataIndex: 'technician', erpSize: 'normal', sorter: (left, right) => stringSort(left.technician, right.technician), width: 124 },
    { title: 'Summary', render: (_, job) => job.jiraSummary || job.summary, erpSize: 'text', sorter: (left, right) => stringSort(left.jiraSummary || left.summary, right.jiraSummary || right.summary), width: 260 },
    { title: 'City', dataIndex: 'city', erpSize: 'normal', sorter: (left, right) => stringSort(left.city, right.city), width: 94 },
    {
      title: 'Call-Out',
      erpSize: 'money',
      sorter: (left, right) => numberSort(left.pricing?.callOutFee, right.pricing?.callOutFee),
      width: 84,
      render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null
        ? '-'
        : job.pricing?.crossedShift ? 'Split Shift' : formatOptionalAmount(job.currency, job.pricing?.callOutFee || 0),
    },
    { title: 'BH', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.hours.bh, right.pricing?.hours.bh), width: 64, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.bh || 0) },
    { title: 'BH Amount', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.bhAmount, right.pricing?.bhAmount), width: 96, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.bhAmount || 0) },
    { title: 'OBH', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.hours.obh, right.pricing?.hours.obh), width: 66, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.obh || 0) },
    { title: 'OBH Amount', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.obhAmount, right.pricing?.obhAmount), width: 102, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.obhAmount || 0) },
    { title: 'WH', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.hours.wh, right.pricing?.hours.wh), width: 60, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.wh || 0) },
    { title: 'WH Amount', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.whAmount, right.pricing?.whAmount), width: 96, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.whAmount || 0) },
    { title: 'Consumables', erpSize: 'money', sorter: (left, right) => numberSort(left.consumablesAmount, right.consumablesAmount), width: 100, render: (_, job) => formatOptionalAmount(job.currency, job.consumablesAmount) },
    { title: 'Final', erpSize: 'money', sorter: (left, right) => numberSort(left.totalAmount, right.totalAmount), width: 92, render: (_, job) => formatJobTotal(job.currency, job.totalAmount) },
    {
      title: 'Status',
      erpSize: 'status',
      sorter: (left, right) => stringSort(left.queueState, right.queueState),
      width: 84,
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

function getSlaColumns() {
  return [
    { title: 'Article', dataIndex: 'articleNumber', width: 120, render: (value: string | undefined) => value || '-' },
    { title: 'Description', dataIndex: 'label' as const },
    { title: 'Amount', width: 140, render: (_: unknown, line: SlaLine) => formatAmount(line.currency, line.amount) },
  ]
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
  const displayTotal = batch.batchKind === 'jobs' && includeSla && batch.combinedTotal != null ? batch.combinedTotal : batch.total
  const showSlaToggle = batch.batchKind === 'jobs' && slaDisplayTotal > 0

  return (
    <Card className="section-card invoice-detail-card" variant="borderless">
      <div className="invoice-detail-head">
        <div className="invoice-detail-meta">
          <Typography.Text strong>{batch.batch}</Typography.Text>
          <div className="invoice-detail-meta-items">
            {metaItem('Customer', batch.customer)}
            {metaItem('Mode', batch.invoiceMode)}
            {metaItem('Period', batch.period)}
            {metaItem(batch.batchKind === 'sla' ? 'Retainers' : 'Jobs', `${batch.jobs}`)}
            {batch.batchKind === 'jobs' ? metaItem('Job Total', formatJobTotal(batch.currency, jobTotal)) : null}
            {slaDisplayTotal > 0 ? metaItem('SLA Invoice', formatAmount(batch.currency, slaDisplayTotal)) : null}
            {batch.batchKind === 'jobs' && slaDisplayTotal > 0 ? metaItem('With SLA', formatJobTotal(batch.currency, batch.combinedTotal)) : null}
            {metaItem('Total', formatJobTotal(batch.currency, displayTotal))}
          </div>
        </div>
        <Space size={8}>
          {showSlaToggle ? (
            <Button onClick={onToggleIncludeSla} type={includeSla ? 'primary' : 'default'}>
              View with SLA
            </Button>
          ) : null}
          <Button onClick={() => onExport(batch)}>Export CSV</Button>
        </Space>
      </div>
      {batch.batchKind === 'sla' ? (
        <Table<SlaLine>
          className="nested-table invoice-job-table"
          columns={getSlaColumns()}
          dataSource={batch.slaLines}
          pagination={false}
          rowKey={(line) => line.label}
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row className="invoice-summary-row invoice-total-row">
                <Table.Summary.Cell index={0} colSpan={2}>
                  <strong>Retainer Total</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <strong className="invoice-total-value">{formatJobTotal(batch.currency, batch.total)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : (
        <ErpDataTable<PricedJob>
          className="nested-table invoice-job-table"
          columnSizing="manual"
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
          scroll={{ x: 'max-content' }}
          tableLayout="auto"
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row className="invoice-summary-row invoice-total-row">
                <Table.Summary.Cell index={0} colSpan={14}>
                  <strong>{includeSla && slaDisplayTotal > 0 ? 'Total with SLA' : 'Invoice Total'}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={14}>
                  <strong className="invoice-total-value">{formatJobTotal(batch.currency, displayTotal)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={15} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      )}
    </Card>
  )
}
