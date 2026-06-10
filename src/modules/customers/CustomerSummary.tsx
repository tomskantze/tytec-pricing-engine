import type { Customer } from '../../domain/types'

type SummaryItem = {
  label: string
  value: string | number
}

function invoiceLabel(mode: Customer['defaultInvoiceMode']) {
  return mode === 'task' ? 'Per Task' : 'Monthly'
}

export function CustomerSummary({
  customer,
  items,
}: {
  customer: Customer
  items?: SummaryItem[]
}) {
  const summaryItems = items || [
    { label: 'Legal ID', value: customer.customerLegalId || '-' },
    { label: 'Customer Key', value: customer.customerKey || '-' },
    { label: 'Rate Cards', value: customer.locationCards.length },
    { label: 'Invoice Mode', value: invoiceLabel(customer.defaultInvoiceMode) },
  ]

  return (
    <div className="metric-strip">
      {summaryItems.map((item) => (
        <div className="metric-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}
