import { Button, Card, Input, Typography } from 'antd'
import { useMemo, useState } from 'react'
import type { Customer, InvoiceMode } from '../../domain/types'
import { PageHeader } from '../../design-system/PageHeader'
import { CustomerIndexTable } from '../customers/CustomerIndexTable'
import type { QuoteBuilderTab } from '../../state/appState'
import type { SavedQuote } from './quoteTypes'
import { QuoteBuilderModule } from './QuoteBuilderModule'
import { SavedQuotesPanel } from './SavedQuotesPanel'

type QuoteBuilderView = 'launch' | 'editor'
type QuoteCustomerMode = 'existing' | 'manual'

type DesktopQuotePageApi = {
  saveAsDocument?: (payload: { storedPath: string; fileName: string }) => Promise<string>
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopQuotePageApi }).desktopWindow
}

function normalizeManualCustomerKey(name: string, explicitKey: string) {
  const normalized = (explicitKey || name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'QUOTE'
}

function createQuoteCustomerStub(name: string, customerKey: string): Customer {
  return {
    name,
    customerKey,
    defaultInvoiceMode: 'monthly' as InvoiceMode,
    customerLegalName: name,
    customerAddress: '',
    billingAddress: '',
    financeEmail: '',
    customerLegalId: '',
    locationCards: [],
  }
}

export function FortnoxQuotePage({
  activeTab,
  customers,
  quotes,
  onDeleteQuote,
  onSaveQuote,
  onSelectCustomer,
  onSelectTab,
}: {
  activeTab: QuoteBuilderTab
  customers: Customer[]
  quotes: SavedQuote[]
  onDeleteQuote: (quoteId: string) => void
  onSaveQuote: (quote: SavedQuote) => void
  onSelectCustomer: (customerKey: string) => void
  onSelectTab: (tab: QuoteBuilderTab) => void
}) {
  const [builderView, setBuilderView] = useState<QuoteBuilderView>('launch')
  const [builderStartMode, setBuilderStartMode] = useState<'draft' | 'new'>('draft')
  const [customerMode, setCustomerMode] = useState<QuoteCustomerMode>('existing')
  const [manualCustomerName, setManualCustomerName] = useState('')
  const [manualCustomerKey, setManualCustomerKey] = useState('')
  const [editorCustomer, setEditorCustomer] = useState<Customer | null>(null)
  const [requestedQuoteId, setRequestedQuoteId] = useState('')
  const manualCustomer = useMemo(() => {
    const trimmedName = manualCustomerName.trim()
    if (!trimmedName) return null
    return createQuoteCustomerStub(trimmedName, normalizeManualCustomerKey(trimmedName, manualCustomerKey.trim()))
  }, [manualCustomerKey, manualCustomerName])
  const visibleSavedQuotes = quotes

  async function saveQuotePdfAs(quoteId: string) {
    const quote = quotes.find((item) => item.id === quoteId)
    const storedPath = quote?.customerPdf?.storedPath
    const fileName = quote?.customerPdf?.fileName || `${quote?.quoteRef || quote?.quoteName || 'quote'}.pdf`
    if (!storedPath) return
    const api = desktopWindow()
    await api?.saveAsDocument?.({ storedPath, fileName })
  }

  function resolveCustomerForSavedQuote(quoteId: string) {
    const quote = quotes.find((item) => item.id === quoteId)
    if (!quote) return null
    const existingCustomer = customers.find((item) => item.customerKey === quote.customerKey) ?? null
    return existingCustomer || createQuoteCustomerStub(quote.customerName, quote.customerKey)
  }

  const showLaunch = activeTab === 'builder' && builderView === 'launch'

  return (
    <>
      <PageHeader title="Quote Builder" />
      {showLaunch ? (
        <>
          {customerMode === 'manual' ? (
            <Card className="workspace-card" variant="borderless">
              <section className="fortnox-quote-panel fortnox-quote-launch">
                <div className="fortnox-quote-doc-head">
                  <div>
                    <Typography.Text strong>One-off Quote</Typography.Text>
                    <div className="page-description">This does not create a customer record. Use it when the customer is not yet in the system.</div>
                  </div>
                </div>
                <div className="fortnox-quote-launch-bar">
                  <div className="fortnox-quote-launch-controls">
                    <Input
                      onChange={(event) => setManualCustomerName(event.target.value)}
                      placeholder="Customer name"
                      value={manualCustomerName}
                    />
                    <Input
                      onChange={(event) => setManualCustomerKey(event.target.value)}
                      placeholder="Customer key (optional)"
                      value={manualCustomerKey}
                    />
                  </div>
                  <div className="fortnox-quote-launch-actions">
                    <Button onClick={() => {
                      setCustomerMode('existing')
                      setManualCustomerName('')
                      setManualCustomerKey('')
                    }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!manualCustomer}
                      onClick={() => {
                        setRequestedQuoteId('')
                        setBuilderStartMode('new')
                        setEditorCustomer(manualCustomer)
                        setBuilderView('editor')
                      }}
                      type="primary"
                    >
                      New Quote
                    </Button>
                  </div>
                </div>
              </section>
            </Card>
          ) : null}
          {customerMode === 'existing' ? (
            <CustomerIndexTable
              actions={<Button onClick={() => setCustomerMode('manual')}>One-off Quote</Button>}
              customers={customers}
              emptyText="No customers match the current search."
              onOpenCustomer={(customerKey) => {
                const selectedCustomer = customers.find((item) => item.customerKey === customerKey) ?? null
                setCustomerMode('existing')
                onSelectCustomer(customerKey)
                if (selectedCustomer) {
                  setRequestedQuoteId('')
                  setBuilderStartMode('new')
                  setEditorCustomer(selectedCustomer)
                  setBuilderView('editor')
                  onSelectTab('builder')
                }
              }}
            />
          ) : null}
        </>
      ) : (
      <Card className="workspace-card" variant="borderless">
        {builderView === 'editor' ? (
          <div hidden={activeTab !== 'builder'}>
            <QuoteBuilderModule
              customer={editorCustomer}
              onBackToLaunch={() => {
                setBuilderView('launch')
                setEditorCustomer(null)
                setRequestedQuoteId('')
              }}
              onDeleteQuote={onDeleteQuote}
              onQuoteLoaded={() => setRequestedQuoteId('')}
              onSaveQuote={onSaveQuote}
              requestedQuoteId={requestedQuoteId}
              savedQuotes={quotes}
              startMode={builderStartMode}
            />
          </div>
        ) : null}
        <div hidden={activeTab !== 'saved'}>
          <SavedQuotesPanel
              onDeleteQuote={onDeleteQuote}
              onLoadQuote={(quoteId) => {
                const quoteCustomer = resolveCustomerForSavedQuote(quoteId)
                if (quoteCustomer) {
                const existingCustomer = customers.find((item) => item.customerKey === quoteCustomer.customerKey) ?? null
                if (existingCustomer) {
                  setCustomerMode('existing')
                  onSelectCustomer(existingCustomer.customerKey)
                } else {
                  setCustomerMode('manual')
                  setManualCustomerName(quoteCustomer.name)
                  setManualCustomerKey(quoteCustomer.customerKey)
                }
                setEditorCustomer(quoteCustomer)
                }
                setRequestedQuoteId(quoteId)
                setBuilderStartMode('draft')
                setBuilderView('editor')
                onSelectTab('builder')
              }}
              onSavePdfAs={saveQuotePdfAs}
              quotes={visibleSavedQuotes}
          />
        </div>
      </Card>
      )}
    </>
  )
}
