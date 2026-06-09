import type { Customer } from '../../domain/types'

function invoiceLabel(mode: Customer['defaultInvoiceMode']) {
  return mode === 'task' ? 'Per Task' : 'Monthly'
}

export function CustomerSummary({ customer }: { customer: Customer }) {
  const items = [
    { label: 'Legal ID', value: customer.customerLegalId || '-' },
    { label: 'Customer Key', value: customer.customerKey || '-' },
    { label: 'Rate Cards', value: customer.locationCards.length },
    { label: 'Jobs', value: 0 },
    { label: 'Invoice Mode', value: invoiceLabel(customer.defaultInvoiceMode) },
  ]

  return (
    <div className="metric-strip">
      {items.map((item) => (
        <div className="metric-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}
