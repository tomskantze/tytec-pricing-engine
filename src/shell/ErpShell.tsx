import { Layout } from 'antd'
import type { ReactNode } from 'react'
import type { ActiveView, CustomerWorkspaceTab, QuoteBuilderTab } from '../state/appState'
import { NavigationPanel } from './NavigationPanel'
import { WindowChrome } from './WindowChrome'

export function ErpShell({
  activeView,
  customerWorkspaceTab,
  customers,
  selectedCustomerKey,
  quoteBuilderTab,
  onOpenCustomer,
  onOpenCustomers,
  onOpenCustomerTab,
  onOpenHome,
  onOpenFortnox,
  onOpenQuoteTab,
  children,
}: {
  activeView: ActiveView
  customerWorkspaceTab: CustomerWorkspaceTab
  customers: Array<{
    key: string
    name: string
    invoicesLabel: string
    showCreateJob: boolean
    showTechnicians: boolean
  }>
  selectedCustomerKey: string
  quoteBuilderTab: QuoteBuilderTab
  onOpenCustomer: (customerKey: string) => void
  onOpenCustomers: () => void
  onOpenCustomerTab: (customerKey: string, tab: CustomerWorkspaceTab) => void
  onOpenHome: () => void
  onOpenFortnox: () => void
  onOpenQuoteTab: (tab: QuoteBuilderTab) => void
  children: ReactNode
}) {
  return (
    <Layout className="erp-v2-shell">
      <WindowChrome />
      <Layout className="erp-shell-body">
        <NavigationPanel
          activeView={activeView}
          customers={customers}
          customerWorkspaceTab={customerWorkspaceTab}
          onOpenCustomer={onOpenCustomer}
          onOpenCustomerTab={onOpenCustomerTab}
          onOpenHome={onOpenHome}
          onOpenCustomers={onOpenCustomers}
          onOpenFortnox={onOpenFortnox}
          onOpenQuoteTab={onOpenQuoteTab}
          quoteBuilderTab={quoteBuilderTab}
          selectedCustomerKey={selectedCustomerKey}
        />
        <Layout className="erp-main-layout">
          <div className="erp-main-scroll">
            <div className="erp-main-content">{children}</div>
          </div>
        </Layout>
      </Layout>
    </Layout>
  )
}
