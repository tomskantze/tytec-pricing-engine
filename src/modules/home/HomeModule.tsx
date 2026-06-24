import { Button, Card, Space } from 'antd'
import { PageHeader } from '../../design-system/PageHeader'
import type { Customer } from '../../domain/types'
import type { SavedQuote } from '../fortnox/quoteTypes'

type HomeRun = {
  id: string
  customerKey: string
  customerName: string
  label: string
  updatedAt: string
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatAmount(currency: string, amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0)
}

export function HomeModule({
  customers,
  importRuns,
  quotes,
  onOpenCustomer,
  onOpenCustomerInvoices,
  onOpenCustomers,
  onOpenFortnox,
  onOpenQuoteBuilder,
  onOpenSavedQuotes,
}: {
  customers: Customer[]
  importRuns: HomeRun[]
  quotes: SavedQuote[]
  onOpenCustomer: (customerKey: string) => void
  onOpenCustomerInvoices: (customerKey: string) => void
  onOpenCustomers: () => void
  onOpenFortnox: () => void
  onOpenQuoteBuilder: () => void
  onOpenSavedQuotes: () => void
}) {
  const totalLocations = customers.reduce((sum, customer) => sum + customer.locationCards.length, 0)
  const recentRuns = [...importRuns]
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, 6)
  const recentQuotes = [...quotes]
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, 6)
  const customerList = [...customers]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
    .slice(0, 8)

  return (
    <>
      <PageHeader
        title="Home"
        description="Operational overview across customers, runs, and quotes."
        actions={(
          <Space size={8} wrap>
            <Button onClick={onOpenCustomers}>Customers</Button>
            <Button onClick={onOpenFortnox}>Fortnox</Button>
            <Button type="primary" onClick={onOpenQuoteBuilder}>Quote Builder</Button>
          </Space>
        )}
      />

      <div className="metric-strip">
        <div className="metric-card"><span>Customers</span><strong>{customers.length}</strong></div>
        <div className="metric-card"><span>Rate Cards</span><strong>{totalLocations}</strong></div>
        <div className="metric-card"><span>Runs</span><strong>{importRuns.length}</strong></div>
        <div className="metric-card"><span>Saved Quotes</span><strong>{quotes.length}</strong></div>
      </div>

      <div className="home-grid">
        <Card className="workspace-card" variant="borderless">
          <div className="toolbar-row">
            <div className="home-section-head">
              <span className="home-section-label">Customers</span>
              <strong className="home-section-value">{customers.length} active records</strong>
            </div>
            <Button type="link" onClick={onOpenCustomers}>Open customers</Button>
          </div>
          <div className="home-list">
            {customerList.length ? customerList.map((customer) => (
              <button className="home-list-item" key={customer.customerKey} onClick={() => onOpenCustomer(customer.customerKey)} type="button">
                <span className="home-list-copy">
                  <strong>{customer.name}</strong>
                  <span>{customer.customerKey} · {customer.locationCards.length} rate cards</span>
                </span>
                <span className="home-list-meta">{customer.defaultInvoiceMode === 'task' ? 'Per Task' : 'Monthly'}</span>
              </button>
            )) : <div className="home-list-empty">No customers yet.</div>}
          </div>
        </Card>

        <Card className="workspace-card" variant="borderless">
          <div className="toolbar-row">
            <div className="home-section-head">
              <span className="home-section-label">Recent Runs</span>
              <strong className="home-section-value">{importRuns.length} imported periods</strong>
            </div>
          </div>
          <div className="home-list">
            {recentRuns.length ? recentRuns.map((run) => (
              <button className="home-list-item" key={run.id} onClick={() => onOpenCustomerInvoices(run.customerKey)} type="button">
                <span className="home-list-copy">
                  <strong>{run.label}</strong>
                  <span>{run.customerName}</span>
                </span>
                <span className="home-list-meta">{formatDate(run.updatedAt)}</span>
              </button>
            )) : <div className="home-list-empty">No invoice or settlement runs yet.</div>}
          </div>
        </Card>

        <Card className="workspace-card" variant="borderless">
          <div className="toolbar-row">
            <div className="home-section-head">
              <span className="home-section-label">Saved Quotes</span>
              <strong className="home-section-value">{quotes.length} quote records</strong>
            </div>
            <Button type="link" onClick={onOpenSavedQuotes}>Open saved quotes</Button>
          </div>
          <div className="home-list">
            {recentQuotes.length ? recentQuotes.map((quote) => (
              <button className="home-list-item" key={quote.id} onClick={onOpenSavedQuotes} type="button">
                <span className="home-list-copy">
                  <strong>{quote.quoteRef || quote.quoteName || 'Unnamed Quote'}</strong>
                  <span>{quote.customerName || quote.customerKey || '-'}{quote.quoteName ? ` · ${quote.quoteName}` : ''}</span>
                </span>
                <span className="home-list-meta">{formatAmount(quote.currency, quote.grandTotal)}</span>
              </button>
            )) : <div className="home-list-empty">No saved quotes yet.</div>}
          </div>
        </Card>
      </div>
    </>
  )
}
