import type { PricedJob } from '../../domain/types'
import { formatJobTotal } from '../../domain/money'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
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

  return (
    <ErpDataTable<PricedJob>
      columns={columns}
      dataSource={[...jobs].sort((left, right) => right.sourceRow - left.sourceRow)}
      locale={{ emptyText: 'No created jobs yet.' }}
      onRow={(job) => ({ onClick: () => onSelectJob(job.id) })}
      rowClassName={(job) => (job.id === selectedJobId ? 'selected-row' : '')}
      rowKey="id"
    />
  )
}
