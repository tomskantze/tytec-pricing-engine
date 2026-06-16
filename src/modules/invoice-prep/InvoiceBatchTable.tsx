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
  { title: 'Batch', dataIndex: 'batch', width: 300 },
  { title: 'Invoice Entity', dataIndex: 'customer', width: 260 },
  { title: 'Mode', dataIndex: 'invoiceMode', width: 110 },
  { title: 'Period', dataIndex: 'period', width: 110 },
  { title: 'Jobs', dataIndex: 'jobs', width: 80 },
  {
    title: 'Total',
    width: 120,
    render: (_, batch) => formatJobTotal(batch.currency, batch.total),
  },
  {
    title: 'Status',
    width: 105,
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
      columnSizing="manual"
      columns={columns}
      dataSource={batches}
      locale={{ emptyText: 'Upload a customer report to calculate invoice batches.' }}
      onRow={(batch) => ({ onClick: () => onSelectBatch(batch.batch) })}
      rowClassName={(batch) => (batch.batch === selectedBatch ? 'selected-row' : '')}
      rowKey="batch"
      scroll={{ x: 1085 }}
    />
  )
}
