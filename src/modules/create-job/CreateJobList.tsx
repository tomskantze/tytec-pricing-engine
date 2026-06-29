import { Table } from 'antd'
import type { PricedJob } from '../../domain/types'
import { formatAmount, formatJobTotal } from '../../domain/money'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

function formatRecordTotals(jobs: PricedJob[]) {
  const totalsByCurrency = jobs.reduce((totals, job) => {
    if (job.totalAmount == null) return totals
    totals.set(job.currency, (totals.get(job.currency) || 0) + job.totalAmount)
    return totals
  }, new Map<string, number>())

  const totals = Array.from(totalsByCurrency.entries())
    .sort(([leftCurrency], [rightCurrency]) => leftCurrency.localeCompare(rightCurrency))
    .map(([currency, total]) => formatAmount(currency, total))

  return totals.length ? totals.join(' · ') : '-'
}

export function CreateJobList({
  jobs,
  selectedJobId,
  onSelectJob,
}: {
  jobs: PricedJob[]
  selectedJobId: string
  onSelectJob: (jobId: string) => void
}) {
  const columns: ErpTableColumn<PricedJob>[] = [
    { title: 'Date', dataIndex: 'date', erpSize: 'date' },
    { title: 'Customer Ticket', dataIndex: 'ticket', erpSize: 'compact' },
    { title: 'Tytec', dataIndex: 'jiraIssueKey', erpSize: 'compact' },
    { title: 'Location', dataIndex: 'city', erpSize: 'normal' },
    { title: 'Engineer', dataIndex: 'technician', erpSize: 'normal' },
    { title: 'Status', erpSize: 'status', render: (_, job) => <StatusBadge label={job.queueState} tone={statusTone(job.queueState)} /> },
    { title: 'Total', erpSize: 'money', render: (_, job) => formatJobTotal(job.currency, job.totalAmount) },
  ]
  const sortedJobs = [...jobs].sort((left, right) => right.sourceRow - left.sourceRow)
  const recordTotals = formatRecordTotals(sortedJobs)

  return (
    <ErpDataTable<PricedJob>
      columns={columns}
      dataSource={sortedJobs}
      locale={{ emptyText: 'No created jobs yet.' }}
      onRow={(job) => ({ onClick: () => onSelectJob(job.id) })}
      rowClassName={(job) => (job.id === selectedJobId ? 'selected-row' : '')}
      rowKey="id"
      summary={() => (
        <Table.Summary>
          <Table.Summary.Row className="invoice-summary-row invoice-total-row create-job-record-total-row">
            <Table.Summary.Cell index={0} colSpan={6}>
              <strong>Total</strong>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6}>
              <strong className="invoice-total-value">{recordTotals}</strong>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        </Table.Summary>
      )}
    />
  )
}
