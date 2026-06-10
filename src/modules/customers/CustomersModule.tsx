import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Drawer, Space } from 'antd'
import { useEffect, useState } from 'react'
import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import type { Customer, LocationCard } from '../../domain/types'
import { PageHeader } from '../../design-system/PageHeader'
import { CustomerDetailsDrawer } from './CustomerDetailsDrawer'
import { CustomerIndexTable } from './CustomerIndexTable'
import { CustomerLocationDrawer } from './CustomerLocationDrawer'
import { CustomerSummary } from './CustomerSummary'
import { RateCardsTable } from './RateCardsTable'

export function CustomersModule({
  customers,
  embedded,
  fortnoxArticles,
  selectedCustomerKey,
  onCustomerChange,
  onSelectCustomer,
}: {
  customers: Customer[]
  embedded?: boolean
  fortnoxArticles: FortnoxArticleMap
  selectedCustomerKey: string
  onCustomerChange: (customer: Customer, previousKey?: string) => void
  onSelectCustomer: (customerKey: string) => void
}) {
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null)
  const [expandedLocationKeys, setExpandedLocationKeys] = useState<string[]>([])
  const [customerDrawerMode, setCustomerDrawerMode] = useState<'add' | 'edit' | null>(null)
  const [locationDrawerMode, setLocationDrawerMode] = useState<'add' | 'edit' | null>(null)
  const customer = customers.find((item) => item.customerKey === selectedCustomerKey) ?? null
  const selectedLocation = customer?.locationCards.find((location) => location.id === selectedLocationKey) ?? null
  const allLocationKeys = customer?.locationCards.map((location) => location.id) ?? []
  const allExpanded = allLocationKeys.length > 0 && expandedLocationKeys.length === allLocationKeys.length

  useEffect(() => {
    setSelectedLocationKey(null)
    setExpandedLocationKeys([])
  }, [selectedCustomerKey])

  function saveCustomer(nextCustomer: Customer) {
    onCustomerChange(nextCustomer, customerDrawerMode === 'edit' ? customer?.customerKey : undefined)
    setCustomerDrawerMode(null)
  }

  function saveLocation(location: LocationCard) {
    if (!customer) return
    const exists = customer.locationCards.some((currentLocation) => currentLocation.id === location.id)
    const locationCards = exists
      ? customer.locationCards.map((currentLocation) => (currentLocation.id === location.id ? location : currentLocation))
      : [...customer.locationCards, location]
    onCustomerChange({ ...customer, locationCards }, customer.customerKey)
    setSelectedLocationKey(location.id)
    setExpandedLocationKeys((currentKeys) => (currentKeys.includes(location.id) ? currentKeys : [...currentKeys, location.id]))
    setLocationDrawerMode(null)
  }

  const customerDrawer = (
    <Drawer
      destroyOnHidden
      onClose={() => setCustomerDrawerMode(null)}
      open={customerDrawerMode !== null}
      title={customerDrawerMode === 'add' ? 'Add Customer' : 'Edit Customer'}
      width={620}
    >
      <CustomerDetailsDrawer
        key={`${customerDrawerMode ?? 'closed'}-${customer?.customerKey ?? 'new'}`}
        customer={customerDrawerMode === 'edit' ? customer : null}
        mode={customerDrawerMode ?? 'add'}
        onCancel={() => setCustomerDrawerMode(null)}
        onSave={saveCustomer}
        reservedCustomerKeys={customers.map((item) => item.customerKey)}
      />
    </Drawer>
  )

  if (!customer) {
    if (embedded) return null
    return (
      <>
        <div className="customer-workspace-topbar global-workspace-topbar">
          <div className="global-workspace-spacer" />
          <Space size={8} wrap>
            <Button type="primary" onClick={() => setCustomerDrawerMode('add')}>Add Customer</Button>
          </Space>
        </div>
        <CustomerIndexTable customers={customers} emptyText="No customers match the current search." onOpenCustomer={onSelectCustomer} />
        {customerDrawer}
      </>
    )
  }

  return (
    <>
      {!embedded ? (
        <PageHeader
          title={customer.name}
          actions={<Button icon={<EditOutlined />} onClick={() => setCustomerDrawerMode('edit')}>Edit Customer</Button>}
        />
      ) : null}
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary customer={customer} />
        <div className="toolbar-row">
          <Space size={8} wrap>
            {embedded ? <Button icon={<EditOutlined />} onClick={() => setCustomerDrawerMode('edit')}>Edit Customer</Button> : null}
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setLocationDrawerMode('add')}>Add Location</Button>
            <Button disabled={!selectedLocation} onClick={() => setLocationDrawerMode('edit')}>Edit Location</Button>
            <Button disabled={!allLocationKeys.length} onClick={() => setExpandedLocationKeys(allExpanded ? [] : allLocationKeys)}>
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </Button>
          </Space>
        </div>
        <RateCardsTable
          customer={customer}
          expandedLocationKeys={expandedLocationKeys}
          fortnoxArticles={fortnoxArticles}
          onExpandedLocationKeysChange={setExpandedLocationKeys}
          onSelectedLocationKeyChange={setSelectedLocationKey}
          selectedLocationKey={selectedLocationKey}
        />
      </Card>
      {customerDrawer}
      <Drawer
        destroyOnHidden
        onClose={() => setLocationDrawerMode(null)}
        open={locationDrawerMode !== null}
        title={locationDrawerMode === 'add' ? 'Add Location' : 'Edit Location'}
        width={760}
      >
        <CustomerLocationDrawer
          key={`${locationDrawerMode ?? 'closed'}-${selectedLocation?.id ?? 'new'}`}
          location={locationDrawerMode === 'edit' ? selectedLocation : null}
          mode={locationDrawerMode ?? 'add'}
          onCancel={() => setLocationDrawerMode(null)}
          onSave={saveLocation}
        />
      </Drawer>
    </>
  )
}
