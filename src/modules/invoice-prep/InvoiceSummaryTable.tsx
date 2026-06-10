import { formatAmount } from '../../domain/money'
import type { InvoiceSummary } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'

function statusTone(status: InvoiceSummary['status']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

function formatUpdated(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const columns: ErpTableColumn<InvoiceSummary>[] = [
  { title: 'Period', dataIndex: 'label', width: 170 },
  { title: 'Jobs', dataIndex: 'jobs', width: 74 },
  { title: 'Needs Review', dataIndex: 'reviewCount', width: 110 },
  {
    title: 'Labor Total',
    width: 120,
    render: (_, invoice) => formatAmount(invoice.currency, invoice.laborTotal),
  },
  {
    title: 'SLA Total',
    width: 120,
    render: (_, invoice) => formatAmount(invoice.currency, invoice.slaTotal),
  },
  {
    title: 'Total',
    width: 120,
    render: (_, invoice) => formatAmount(invoice.currency, invoice.total),
  },
  {
    title: 'Updated',
    width: 110,
    render: (_, invoice) => formatUpdated(invoice.updatedAt),
  },
  {
    title: 'Status',
    width: 100,
    render: (_, invoice) => <StatusBadge label={invoice.status} tone={statusTone(invoice.status)} />,
  },
]

export function InvoiceSummaryTable({
  invoices,
  selectedInvoiceId,
  onSelectInvoice,
}: {
  invoices: InvoiceSummary[]
  selectedInvoiceId: string
  onSelectInvoice: (invoiceId: string) => void
}) {
  return (
    <ErpDataTable<InvoiceSummary>
      columnSizing="manual"
      columns={columns}
      dataSource={invoices}
      locale={{ emptyText: 'No invoices created yet.' }}
      onRow={(invoice) => ({ onClick: () => onSelectInvoice(invoice.invoiceId === selectedInvoiceId ? '' : invoice.invoiceId) })}
      rowClassName={(invoice) => (invoice.invoiceId === selectedInvoiceId ? 'selected-row' : '')}
      rowKey="invoiceId"
      scroll={{ x: 924 }}
    />
  )
}
