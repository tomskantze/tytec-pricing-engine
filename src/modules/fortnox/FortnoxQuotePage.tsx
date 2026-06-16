import { Card, Select } from 'antd'
import { FileTextOutlined, SaveOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { Customer } from '../../domain/types'
import type { SavedQuote } from './quoteTypes'
import { CustomerSummary } from '../customers/CustomerSummary'
import { QuoteBuilderModule } from './QuoteBuilderModule'
import { SavedQuotesPanel } from './SavedQuotesPanel'

type QuotePageTab = 'builder' | 'saved'

type DesktopQuotePageApi = {
  saveAsDocument?: (payload: { storedPath: string; fileName: string }) => Promise<string>
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopQuotePageApi }).desktopWindow
}

export function FortnoxQuotePage({
  customer,
  customers,
  quotes,
  onDeleteQuote,
  onSaveQuote,
  onSelectCustomer,
}: {
  customer: Customer | null
  customers: Customer[]
  quotes: SavedQuote[]
  onDeleteQuote: (quoteId: string) => void
  onSaveQuote: (quote: SavedQuote) => void
  onSelectCustomer: (customerKey: string) => void
}) {
  const activeCustomer = customer ?? customers[0] ?? null
  const [activeTab, setActiveTab] = useState<QuotePageTab>('builder')
  const [requestedQuoteId, setRequestedQuoteId] = useState('')
  const customerQuotes = quotes
    .filter((quote) => !activeCustomer || quote.customerKey === activeCustomer.customerKey)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  async function saveQuotePdfAs(quoteId: string) {
    const quote = customerQuotes.find((item) => item.id === quoteId)
    const storedPath = quote?.customerPdf?.storedPath
    const fileName = quote?.customerPdf?.fileName || `${quote?.quoteRef || quote?.quoteName || 'quote'}.pdf`
    if (!storedPath) return
    const api = desktopWindow()
    await api?.saveAsDocument?.({ storedPath, fileName })
  }

  return (
    <>
      <div className="customer-workspace-topbar global-workspace-topbar">
        <nav aria-label="Quote workspace" className="customer-workspace-nav">
          <button
            aria-current={activeTab === 'builder' ? 'page' : undefined}
            className={`customer-workspace-nav-item${activeTab === 'builder' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('builder')}
            type="button"
          >
            <span aria-hidden="true" className="customer-workspace-nav-icon"><FileTextOutlined /></span>
            <span>Builder</span>
          </button>
          <button
            aria-current={activeTab === 'saved' ? 'page' : undefined}
            className={`customer-workspace-nav-item${activeTab === 'saved' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('saved')}
            type="button"
          >
            <span aria-hidden="true" className="customer-workspace-nav-icon"><SaveOutlined /></span>
            <span>Saved Quotes</span>
          </button>
        </nav>
        <div className="customer-workspace-meta quote-workspace-meta">
          <span className="customer-workspace-current">{activeCustomer?.name || 'Select customer'}</span>
          <Select
            className="global-workspace-select quote-workspace-select"
            onChange={onSelectCustomer}
            options={customers.map((item) => ({ label: item.name, value: item.customerKey }))}
            placeholder="Change customer"
            size="small"
            value={activeCustomer?.customerKey}
          />
        </div>
      </div>
      <Card className="workspace-card" variant="borderless">
        {activeCustomer ? <CustomerSummary customer={activeCustomer} /> : null}
        {activeTab === 'builder' ? (
          <QuoteBuilderModule
            customer={activeCustomer}
            onDeleteQuote={onDeleteQuote}
            onQuoteLoaded={() => setRequestedQuoteId('')}
            onSaveQuote={onSaveQuote}
            requestedQuoteId={requestedQuoteId}
            savedQuotes={quotes}
          />
        ) : (
          <SavedQuotesPanel
            onDeleteQuote={onDeleteQuote}
            onLoadQuote={(quoteId) => {
              setRequestedQuoteId(quoteId)
              setActiveTab('builder')
            }}
            onSavePdfAs={saveQuotePdfAs}
            quotes={customerQuotes}
          />
        )}
      </Card>
    </>
  )
}
