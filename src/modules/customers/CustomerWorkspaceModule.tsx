import { CheckSquareOutlined, FileAddOutlined, LeftOutlined, TableOutlined, TeamOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { ReactNode } from 'react'
import { PageHeader } from '../../design-system/PageHeader'
import type { Customer } from '../../domain/types'
import type { CustomerWorkspaceTab } from '../../state/appState'

function workspaceContext(customer: Customer, tab: CustomerWorkspaceTab, invoiceLabel: string) {
  if (tab === 'invoices') {
    const label = customer.customerKey === 'AKAM' ? 'Settlements' : 'Invoices'
    return invoiceLabel ? `${label} / ${invoiceLabel}` : label
  }
  if (tab === 'create-job') return 'Create Job'
  if (tab === 'review-queue') return 'Review Queue'
  if (tab === 'technicians') return 'Technicians'
  return 'Rate Cards'
}

export function CustomerWorkspaceModule({
  customer,
  activeTab,
  activeInvoiceLabel,
  showCreateJob = true,
  showTechnicians = false,
  onBackToCustomers,
  onSelectTab,
  overviewContent,
  createJobContent,
  invoicesContent,
  reviewQueueContent,
  techniciansContent,
}: {
  customer: Customer
  activeTab: CustomerWorkspaceTab
  activeInvoiceLabel: string
  showCreateJob?: boolean
  showTechnicians?: boolean
  onBackToCustomers: () => void
  onSelectTab: (tab: CustomerWorkspaceTab) => void
  overviewContent: ReactNode
  createJobContent: ReactNode
  invoicesContent: ReactNode
  reviewQueueContent: ReactNode
  techniciansContent: ReactNode
}) {
  const tabs: Array<{ key: CustomerWorkspaceTab; label: string; icon: ReactNode }> = [
    ...(showCreateJob ? [{ key: 'create-job' as const, label: 'Create Job', icon: <FileAddOutlined /> }] : []),
    { key: 'invoices', label: customer.customerKey === 'AKAM' ? 'Settlements' : 'Invoices', icon: <TableOutlined /> },
    { key: 'review-queue', label: 'Review Queue', icon: <CheckSquareOutlined /> },
    { key: 'overview', label: 'Rate Cards', icon: <TeamOutlined /> },
    ...(showTechnicians ? [{ key: 'technicians' as const, label: 'Technicians', icon: <TeamOutlined /> }] : []),
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
          title={`${customer.name} - ${workspaceContext(customer, activeTab, activeInvoiceLabel)}`}
        />
      </div>
      {activeTab === 'overview' ? overviewContent : null}
      {activeTab === 'create-job' ? createJobContent : null}
      {activeTab === 'invoices' ? invoicesContent : null}
      {activeTab === 'review-queue' ? reviewQueueContent : null}
      {activeTab === 'technicians' ? techniciansContent : null}
    </>
  )
}
