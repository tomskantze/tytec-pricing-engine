import { CheckSquareOutlined, LeftOutlined, TableOutlined, TeamOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { ReactNode } from 'react'
import { PageHeader } from '../../design-system/PageHeader'
import type { Customer } from '../../domain/types'
import type { CustomerWorkspaceTab } from '../../state/appState'

function workspaceContext(tab: CustomerWorkspaceTab, invoiceLabel: string) {
  if (tab === 'invoices') return invoiceLabel ? `Invoices / ${invoiceLabel}` : 'Invoices'
  if (tab === 'review-queue') return 'Review Queue'
  return 'Overview'
}

export function CustomerWorkspaceModule({
  customer,
  activeTab,
  activeInvoiceLabel,
  onBackToCustomers,
  onSelectTab,
  overviewContent,
  invoicesContent,
  reviewQueueContent,
}: {
  customer: Customer
  activeTab: CustomerWorkspaceTab
  activeInvoiceLabel: string
  onBackToCustomers: () => void
  onSelectTab: (tab: CustomerWorkspaceTab) => void
  overviewContent: ReactNode
  invoicesContent: ReactNode
  reviewQueueContent: ReactNode
}) {
  const tabs: Array<{ key: CustomerWorkspaceTab; label: string; icon: ReactNode }> = [
    { key: 'overview', label: 'Overview', icon: <TeamOutlined /> },
    { key: 'invoices', label: 'Invoices', icon: <TableOutlined /> },
    { key: 'review-queue', label: 'Review Queue', icon: <CheckSquareOutlined /> },
  ]

  return (
    <>
      <div className="customer-workspace-topbar">
        <nav aria-label="Customer workspace" className="customer-workspace-nav">
          {tabs.map((tab) => (
            <button
              aria-current={activeTab === tab.key ? 'page' : undefined}
              className={`customer-workspace-nav-item${activeTab === tab.key ? ' is-active' : ''}`}
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              type="button"
            >
              <span aria-hidden="true" className="customer-workspace-nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="customer-workspace-meta">
          <span className="customer-workspace-current">{customer.name}</span>
          <Button className="customer-workspace-back" icon={<LeftOutlined />} onClick={onBackToCustomers} type="text">
            All Customers
          </Button>
        </div>
      </div>
      <div className="customer-workspace-header">
        <PageHeader
          title={`${customer.name} - ${workspaceContext(activeTab, activeInvoiceLabel)}`}
        />
      </div>
      {activeTab === 'overview' ? overviewContent : null}
      {activeTab === 'invoices' ? invoicesContent : null}
      {activeTab === 'review-queue' ? reviewQueueContent : null}
    </>
  )
}
