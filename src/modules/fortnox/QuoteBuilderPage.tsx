import { Button, Card, Input, Select, Space } from 'antd'
import { useMemo, useState } from 'react'
import type { Customer, InvoiceMode } from '../../domain/types'
import { PageHeader } from '../../design-system/PageHeader'
import type { QuoteBuilderTab } from '../../state/appState'
import type { SavedQuote } from './quoteTypes'
import { QuoteBuilderModule } from './QuoteBuilderModule'
import { SavedQuotesPanel } from './SavedQuotesPanel'

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

export function QuoteBuilderPage({
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
  const [builderStartMode, setBuilderStartMode] = useState<'draft' | 'new'>('new')
  const [manualCustomerName, setManualCustomerName] = useState('')
  const [manualCustomerKey, setManualCustomerKey] = useState('')
  const [editorCustomer, setEditorCustomer] = useState<Customer | null>(null)
  const [requestedQuoteId, setRequestedQuoteId] = useState('')
  const [builderInstanceKey, setBuilderInstanceKey] = useState(0)
  const manualCustomer = useMemo(() => {
    const trimmedName = manualCustomerName.trim()
    if (!trimmedName) return null
    return createQuoteCustomerStub(trimmedName, normalizeManualCustomerKey(trimmedName, manualCustomerKey.trim()))
  }, [manualCustomerKey, manualCustomerName])
  const visibleSavedQuotes = quotes
  const selectedExistingCustomerKey = customers.some((customer) => customer.customerKey === editorCustomer?.customerKey)
    ? editorCustomer?.customerKey
    : undefined
  const customerOptions = useMemo(
    () => [...customers]
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
      .map((customer) => ({ value: customer.customerKey, label: customer.name })),
    [customers],
  )

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

  function selectExistingCustomer(customerKey?: string) {
    const selectedCustomer = customers.find((item) => item.customerKey === customerKey) ?? null
    setEditorCustomer(selectedCustomer)
    setRequestedQuoteId('')
    setBuilderStartMode('new')
    setManualCustomerName('')
    setManualCustomerKey('')
    setBuilderInstanceKey((current) => current + 1)
    if (selectedCustomer) onSelectCustomer(selectedCustomer.customerKey)
  }

  function useManualCustomer() {
    if (!manualCustomer) return
    setEditorCustomer(manualCustomer)
    setRequestedQuoteId('')
    setBuilderStartMode('new')
    setBuilderInstanceKey((current) => current + 1)
    onSelectTab('builder')
  }

  return (
    <>
      <PageHeader title="Quote Builder" />
      <Card className="workspace-card" variant="borderless">
        <div hidden={activeTab !== 'builder'}>
          <section className="fortnox-quote-customer-strip">
            <label>
              <span>Existing customer</span>
              <Select
                allowClear
                onChange={(value) => selectExistingCustomer(value)}
                options={customerOptions}
                placeholder="Pick customer if already in system"
                showSearch
                value={selectedExistingCustomerKey}
              />
            </label>
            <div className="fortnox-quote-new-customer">
              <label><span>New customer</span><Input onChange={(event) => setManualCustomerName(event.target.value)} placeholder="Customer name" value={manualCustomerName} /></label>
              <label><span>Customer key</span><Input onChange={(event) => setManualCustomerKey(event.target.value)} placeholder="Optional" value={manualCustomerKey} /></label>
              <Space>
                <Button disabled={!manualCustomer} onClick={useManualCustomer}>Use New Customer</Button>
              </Space>
            </div>
          </section>
            <QuoteBuilderModule
              customer={editorCustomer}
              key={`${editorCustomer?.customerKey || 'none'}-${builderInstanceKey}`}
              onDeleteQuote={onDeleteQuote}
              onQuoteLoaded={() => setRequestedQuoteId('')}
              onSaveQuote={onSaveQuote}
              requestedQuoteId={requestedQuoteId}
              savedQuotes={quotes}
              startMode={builderStartMode}
            />
          </div>
        <div hidden={activeTab !== 'saved'}>
          <SavedQuotesPanel
              onDeleteQuote={onDeleteQuote}
              onLoadQuote={(quoteId) => {
                const quoteCustomer = resolveCustomerForSavedQuote(quoteId)
                if (quoteCustomer) {
                const existingCustomer = customers.find((item) => item.customerKey === quoteCustomer.customerKey) ?? null
                if (existingCustomer) {
                  onSelectCustomer(existingCustomer.customerKey)
                } else {
                  setManualCustomerName(quoteCustomer.name)
                  setManualCustomerKey(quoteCustomer.customerKey)
                }
                setEditorCustomer(quoteCustomer)
                }
                setRequestedQuoteId(quoteId)
                setBuilderStartMode('draft')
                setBuilderInstanceKey((current) => current + 1)
                onSelectTab('builder')
              }}
              onSavePdfAs={saveQuotePdfAs}
              quotes={visibleSavedQuotes}
          />
        </div>
      </Card>
    </>
  )
}
