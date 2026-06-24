import type { ReactNode } from 'react'
import { PageHeader } from '../../design-system/PageHeader'
import type { Customer } from '../../domain/types'
import type { CustomerWorkspaceTab } from '../../state/appState'

export function CustomerWorkspaceModule({
  customer,
  activeTab,
  activeInvoiceLabel: _activeInvoiceLabel,
  showCreateJob: _showCreateJob = true,
  showTechnicians: _showTechnicians = false,
  onBackToCustomers: _onBackToCustomers,
  onSelectTab: _onSelectTab,
  profileContent,
  rateCardsContent,
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
  profileContent: ReactNode
  rateCardsContent: ReactNode
  createJobContent: ReactNode
  invoicesContent: ReactNode
  reviewQueueContent: ReactNode
  techniciansContent: ReactNode
}) {
  return (
    <>
      <div className="customer-workspace-header">
        <PageHeader
          title={customer.name}
        />
      </div>
      {activeTab === 'profile' ? profileContent : null}
      {activeTab === 'rate-cards' ? rateCardsContent : null}
      {activeTab === 'create-job' ? createJobContent : null}
      {activeTab === 'invoices' ? invoicesContent : null}
      {activeTab === 'review-queue' ? reviewQueueContent : null}
      {activeTab === 'technicians' ? techniciansContent : null}
    </>
  )
}
