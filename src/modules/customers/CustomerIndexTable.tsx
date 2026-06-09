import { SearchOutlined } from '@ant-design/icons'
import { Card, Input, Typography } from 'antd'
import { useMemo, useState } from 'react'
import type { Customer } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'

type CustomerRow = {
  key: string
  customer: Customer
}

function invoiceLabel(mode: Customer['defaultInvoiceMode']) {
  return mode === 'task' ? 'Per Task' : 'Monthly'
}

function normalize(value: string) {
  return value.toLowerCase().trim()
}

function customerSearchText(customer: Customer) {
  return [
    customer.name,
    customer.customerKey,
    customer.customerLegalName,
    customer.customerLegalId,
    customer.financeEmail,
    customer.locationCards.map((location) => `${location.city} ${location.cityCode} ${location.country}`).join(' '),
  ].join(' ')
}

const columns: ErpTableColumn<CustomerRow>[] = [
  { title: 'Customer', erpSize: 'text', render: (_, row) => <strong className="table-primary-text">{row.customer.name}</strong> },
  { title: 'Key', erpSize: 'compact', render: (_, row) => row.customer.customerKey || '-' },
  { title: 'Legal ID', erpSize: 'compact', render: (_, row) => row.customer.customerLegalId || '-' },
  { title: 'Billing Email', erpSize: 'wide', render: (_, row) => row.customer.financeEmail || '-' },
  { title: 'Rate Cards', erpSize: 'compact', render: (_, row) => row.customer.locationCards.length },
  { title: 'Jobs', erpSize: 'compact', render: () => 0 },
  { title: 'Invoice Mode', erpSize: 'normal', render: (_, row) => invoiceLabel(row.customer.defaultInvoiceMode) },
]

export function CustomerIndexTable({
  customers,
  emptyText,
  onOpenCustomer,
}: {
  customers: Customer[]
  emptyText: string
  onOpenCustomer: (customerKey: string) => void
}) {
  const [query, setQuery] = useState('')
  const rows = useMemo<CustomerRow[]>(() => {
    const needle = normalize(query)
    return customers
      .map((customer) => ({ key: customer.customerKey, customer }))
      .filter((row) => !needle || normalize(customerSearchText(row.customer)).includes(needle))
      .sort((left, right) => left.customer.name.localeCompare(right.customer.name, undefined, { sensitivity: 'base' }))
  }, [customers, query])

  return (
    <Card className="workspace-card" variant="borderless">
      <div className="toolbar-row">
        <Input
          allowClear
          className="toolbar-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer, key, legal ID, billing email, location"
          prefix={<SearchOutlined />}
          value={query}
        />
        <Typography.Text className="toolbar-count">
          {rows.length} customer{rows.length === 1 ? '' : 's'}
        </Typography.Text>
      </div>
      <ErpDataTable<CustomerRow>
        columns={columns}
        dataSource={rows}
        locale={{ emptyText }}
        onRow={(row) => ({ onClick: () => onOpenCustomer(row.key) })}
        rowKey="key"
      />
    </Card>
  )
}
