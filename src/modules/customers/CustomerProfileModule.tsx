import { EditOutlined } from '@ant-design/icons'
import { Button, Card, Drawer } from 'antd'
import { useMemo, useState } from 'react'
import type { Customer } from '../../domain/types'
import { CustomerDetailsDrawer } from './CustomerDetailsDrawer'
import { CustomerSummary } from './CustomerSummary'

function activeTechnicians(customer: Customer) {
  return (customer.technicians || []).filter((technician) => technician.active).length
}

export function CustomerProfileModule({
  customer,
  customers,
  invoiceCount,
  needsReviewCount,
  onCustomerChange,
}: {
  customer: Customer
  customers: Customer[]
  invoiceCount: number
  needsReviewCount: number
  onCustomerChange: (customer: Customer, previousKey?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const reservedCustomerKeys = useMemo(() => customers.map((item) => item.customerKey), [customers])

  return (
    <>
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary customer={customer} />
        <div className="metric-strip customer-profile-secondary">
          <div className="metric-card"><span>Locations</span><strong>{customer.locationCards.length}</strong></div>
          <div className="metric-card"><span>Invoices / Settlements</span><strong>{invoiceCount}</strong></div>
          <div className="metric-card"><span>Needs Review</span><strong>{needsReviewCount}</strong></div>
          <div className="metric-card"><span>Technicians</span><strong>{activeTechnicians(customer)}</strong></div>
        </div>
        <div className="toolbar-row">
          <div className="customer-profile-head">
            <span className="customer-profile-label">Customer Profile</span>
            <strong className="customer-profile-value">{customer.name}</strong>
          </div>
          <Button icon={<EditOutlined />} type="primary" onClick={() => setEditing(true)}>Edit Customer</Button>
        </div>
        <div className="customer-profile-grid">
          <div className="info-field"><span>Legal Name</span><strong className="info-field-value-wrap">{customer.customerLegalName || '-'}</strong></div>
          <div className="info-field"><span>Finance Email</span><strong className="info-field-value-wrap">{customer.financeEmail || '-'}</strong></div>
          <div className="info-field"><span>Customer Address</span><strong className="info-field-value-wrap">{customer.customerAddress || '-'}</strong></div>
          <div className="info-field"><span>Billing Address</span><strong className="info-field-value-wrap">{customer.billingAddress || '-'}</strong></div>
        </div>
      </Card>

      <Drawer
        destroyOnHidden
        onClose={() => setEditing(false)}
        open={editing}
        title="Edit Customer"
        width={620}
      >
        <CustomerDetailsDrawer
          customer={customer}
          mode="edit"
          onCancel={() => setEditing(false)}
          onSave={(nextCustomer) => {
            onCustomerChange(nextCustomer, customer.customerKey)
            setEditing(false)
          }}
          reservedCustomerKeys={reservedCustomerKeys}
        />
      </Drawer>
    </>
  )
}
