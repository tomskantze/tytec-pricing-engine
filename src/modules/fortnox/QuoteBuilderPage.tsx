import { Button, Card, Input, Select, Space } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { Customer, InvoiceMode } from '../../domain/types'
import { PageHeader } from '../../design-system/PageHeader'
import type { QuoteBuilderTab } from '../../state/appState'
import type { ServiceRequestRecord } from '../requests/requestTypes'
import type { QuoteDraft, SavedQuote } from './quoteTypes'
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

function normalizeEntityKey(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function requestCompanyName(request: ServiceRequestRecord) {
  return request.companyName.trim() || request.contactName.trim() || request.email.trim() || 'Request Customer'
}

function requestQuoteName(request: ServiceRequestRecord) {
  const company = requestCompanyName(request)
  const summary = request.requestSummary.trim()
  return summary ? `${company} - ${summary}` : `${company} quote`
}

function capRequestLabel(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 44 ? `${normalized.slice(0, 41).trimEnd()}...` : normalized
}

function requestDraftPrefill(request: ServiceRequestRecord): Partial<QuoteDraft> {
  return {
    sourceRequestId: request.id,
    quoteName: requestQuoteName(request),
    customerContactName: request.contactName,
    customerContactEmail: request.email,
    workLocation: request.locations,
    summaryText: request.requestSummary,
  }
}

function isPotentialQuoteRequest(request: ServiceRequestRecord) {
  return !['Applicant', 'Vendor', 'Spam'].includes(request.kind)
    && !['Applicant', 'Spam', 'Not relevant', 'Duplicate'].includes(request.status)
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
  requests,
  requestedRequestId,
  quotes,
  onDeleteQuote,
  onRequestLoaded,
  onSaveQuote,
  onSelectCustomer,
  onSelectTab,
}: {
  activeTab: QuoteBuilderTab
  customers: Customer[]
  requests: ServiceRequestRecord[]
  requestedRequestId?: string
  quotes: SavedQuote[]
  onDeleteQuote: (quoteId: string) => void
  onRequestLoaded?: () => void
  onSaveQuote: (quote: SavedQuote) => void
  onSelectCustomer: (customerKey: string) => void
  onSelectTab: (tab: QuoteBuilderTab) => void
}) {
  const [builderStartMode, setBuilderStartMode] = useState<'draft' | 'new'>('new')
  const [manualCustomerName, setManualCustomerName] = useState('')
  const [manualCustomerKey, setManualCustomerKey] = useState('')
  const [editorCustomer, setEditorCustomer] = useState<Customer | null>(null)
  const [sourceRequestId, setSourceRequestId] = useState('')
  const [draftPrefill, setDraftPrefill] = useState<Partial<QuoteDraft> | undefined>(undefined)
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
  const requestOptions = useMemo(
    () => requests
      .filter(isPotentialQuoteRequest)
      .map((request) => {
        const company = requestCompanyName(request)
        const contact = request.contactName.trim()
        const label = contact && normalizeEntityKey(contact) !== normalizeEntityKey(company)
          ? `${company} - ${contact}`
          : company
        const title = [company, contact, request.email, request.locations].filter(Boolean).join(' - ')
        return {
          value: request.id,
          label: capRequestLabel(label),
          sortLabel: company,
          title,
        }
      })
      .sort((left, right) => left.sortLabel.localeCompare(right.sortLabel, undefined, { sensitivity: 'base' }))
      .map(({ value, label, title }) => ({ value, label, title })),
    [requests],
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

  function findExistingCustomerForRequest(request: ServiceRequestRecord) {
    const requestNameKey = normalizeEntityKey(request.companyName || request.contactName)
    if (!requestNameKey) return null
    return customers.find((customer) => (
      normalizeEntityKey(customer.name) === requestNameKey
      || normalizeEntityKey(customer.customerLegalName || '') === requestNameKey
      || normalizeEntityKey(customer.customerKey) === requestNameKey
    )) ?? null
  }

  function startQuoteFromRequest(request: ServiceRequestRecord) {
    const existingCustomer = findExistingCustomerForRequest(request)
    const company = requestCompanyName(request)
    const quoteCustomer = existingCustomer || createQuoteCustomerStub(company, normalizeManualCustomerKey(company, ''))
    setEditorCustomer(quoteCustomer)
    setSourceRequestId(request.id)
    setDraftPrefill(requestDraftPrefill(request))
    setRequestedQuoteId('')
    setBuilderStartMode('new')
    setManualCustomerName('')
    setManualCustomerKey('')
    setBuilderInstanceKey((current) => current + 1)
    if (existingCustomer) onSelectCustomer(existingCustomer.customerKey)
    onSelectTab('builder')
  }

  function selectRequestContact(requestId?: string) {
    if (!requestId) {
      setSourceRequestId('')
      setDraftPrefill(undefined)
      return
    }
    const request = requests.find((item) => item.id === requestId)
    if (request) startQuoteFromRequest(request)
  }

  function selectExistingCustomer(customerKey?: string) {
    const selectedCustomer = customers.find((item) => item.customerKey === customerKey) ?? null
    setEditorCustomer(selectedCustomer)
    setSourceRequestId('')
    setDraftPrefill(undefined)
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
    setSourceRequestId('')
    setDraftPrefill(undefined)
    setRequestedQuoteId('')
    setBuilderStartMode('new')
    setBuilderInstanceKey((current) => current + 1)
    onSelectTab('builder')
  }

  useEffect(() => {
    if (!requestedRequestId) return
    const request = requests.find((item) => item.id === requestedRequestId)
    if (!request) return
    startQuoteFromRequest(request)
    onRequestLoaded?.()
  }, [requestedRequestId, requests])

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
            <label>
              <span>Request contact</span>
              <Select
                allowClear
                className="fortnox-quote-request-select"
                onChange={(value) => selectRequestContact(value)}
                optionFilterProp="title"
                options={requestOptions}
                placeholder="Pick from Requests"
                showSearch
                value={sourceRequestId || undefined}
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
              draftPrefill={draftPrefill}
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
