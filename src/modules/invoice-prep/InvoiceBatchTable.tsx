import type { InvoiceBatch } from '../../domain/types'
import { formatJobTotal } from '../../domain/money'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'

function statusTone(status: InvoiceBatch['status']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

const columns: ErpTableColumn<InvoiceBatch>[] = [
  { title: 'Batch', dataIndex: 'batch', erpSize: 'compact' },
  { title: 'Invoice Entity', dataIndex: 'customer', erpSize: 'text' },
  { title: 'Mode', dataIndex: 'invoiceMode', erpSize: 'compact' },
  { title: 'Period', dataIndex: 'period', erpSize: 'date' },
  { title: 'Jobs', dataIndex: 'jobs', erpSize: 'money' },
  {
    title: 'Total',
    erpSize: 'money',
    render: (_, batch) => formatJobTotal(batch.currency, batch.total),
  },
  {
    title: 'Status',
    erpSize: 'status',
    render: (_, batch) => <StatusBadge label={batch.status} tone={statusTone(batch.status)} />,
  },
]

export function InvoiceBatchTable({
  batches,
  selectedBatch,
  onSelectBatch,
}: {
  batches: InvoiceBatch[]
  selectedBatch: string
  onSelectBatch: (batch: string) => void
}) {
  return (
    <ErpDataTable<InvoiceBatch>
      columns={columns}
      dataSource={batches}
      locale={{ emptyText: 'Upload a customer report and Jira report to calculate invoice batches.' }}
      onRow={(batch) => ({ onClick: () => onSelectBatch(batch.batch) })}
      rowClassName={(batch) => (batch.batch === selectedBatch ? 'selected-row' : '')}
      rowKey="batch"
    />
  )
}
