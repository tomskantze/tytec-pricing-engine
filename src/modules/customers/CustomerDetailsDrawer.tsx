import { Button, Form, Input, Select, Space } from 'antd'
import type { Customer } from '../../domain/types'

type CustomerFormValues = {
  name?: string
  customerKey?: string
  defaultInvoiceMode?: Customer['defaultInvoiceMode']
  customerLegalName?: string
  customerAddress?: string
  billingAddress?: string
  financeEmail?: string
  customerLegalId?: string
}

function cleanKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-')
}

function makeCustomer(values: CustomerFormValues, customer: Customer | null): Customer {
  return {
    name: values.name?.trim() || 'New Customer',
    customerKey: cleanKey(values.customerKey || ''),
    defaultInvoiceMode: values.defaultInvoiceMode ?? 'monthly',
    customerLegalName: values.customerLegalName?.trim() || values.name?.trim() || 'New Customer',
    customerAddress: values.customerAddress?.trim() || '',
    billingAddress: values.billingAddress?.trim() || values.customerAddress?.trim() || '',
    financeEmail: values.financeEmail?.trim() || '',
    customerLegalId: values.customerLegalId?.trim() || '',
    locationCards: customer?.locationCards ?? [],
    technicians: customer?.technicians ?? [],
    technicianRates: customer?.technicianRates ?? [],
    technicianTierAssignments: customer?.technicianTierAssignments ?? [],
  }
}

export function CustomerDetailsDrawer({
  customer,
  mode,
  reservedCustomerKeys,
  onCancel,
  onSave,
}: {
  customer: Customer | null
  mode: 'add' | 'edit'
  reservedCustomerKeys: string[]
  onCancel: () => void
  onSave: (customer: Customer) => void
}) {
  const [form] = Form.useForm<CustomerFormValues>()
  const currentKey = customer?.customerKey ?? ''

  function isReservedKey(value: string) {
    const nextKey = cleanKey(value)
    return nextKey && nextKey !== currentKey && reservedCustomerKeys.includes(nextKey)
  }

  function save(values: CustomerFormValues) {
    onSave(makeCustomer(values, customer))
  }

  return (
    <Form<CustomerFormValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        name: customer?.name,
        customerKey: customer?.customerKey,
        defaultInvoiceMode: customer?.defaultInvoiceMode ?? 'monthly',
        customerLegalName: customer?.customerLegalName,
        customerAddress: customer?.customerAddress,
        billingAddress: customer?.billingAddress,
        financeEmail: customer?.financeEmail,
        customerLegalId: customer?.customerLegalId,
      }}
      layout="vertical"
      onFinish={save}
    >
      <div className="form-grid form-grid-two">
        <Form.Item name="name" label="Customer" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="customerKey"
          label="Customer Key"
          normalize={(value) => cleanKey(String(value ?? ''))}
          rules={[
            { required: true },
            {
              validator: async (_, value) => {
                if (isReservedKey(String(value ?? ''))) throw new Error('Customer key already exists.')
              },
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="customerLegalName" label="Legal Name">
          <Input />
        </Form.Item>
        <Form.Item name="customerLegalId" label="Legal ID">
          <Input />
        </Form.Item>
        <Form.Item name="financeEmail" label="Finance Email">
          <Input />
        </Form.Item>
        <Form.Item name="defaultInvoiceMode" label="Invoice Mode">
          <Select options={[{ value: 'monthly', label: 'Monthly' }, { value: 'task', label: 'Per Task' }]} />
        </Form.Item>
        <Form.Item name="customerAddress" label="Customer Address">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
        <Form.Item name="billingAddress" label="Billing Address">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </div>

      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="submit" type="primary">{mode === 'add' ? 'Add Customer' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
