import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import type { Customer, LocationCard, ShiftLabel, ShiftRate } from '../../domain/types'

type ShiftFormValues = {
  shift?: ShiftLabel
  includedHours?: number | null
  callOutFee?: number | null
  additionalHours?: number | null
  fullShiftRate?: number | null
}

type LocationFormValues = {
  city?: string
  cityCode?: string
  country?: string
  currency?: string
  invoiceMode?: Customer['defaultInvoiceMode']
  slaEnabled?: boolean
  slaAmount?: number | null
  slaAttributedTo?: string
  slaNote?: string
  shifts?: ShiftFormValues[]
}

const shiftOptions: Array<{ value: ShiftLabel; label: ShiftLabel }> = [
  { value: '08:00-18:00', label: '08:00-18:00' },
  { value: '18:00-08:00', label: '18:00-08:00' },
  { value: 'Weekend / Holiday', label: 'Weekend / Holiday' },
]

const defaultShifts: ShiftRate[] = [
  { shift: '08:00-18:00', includedHours: 2, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
  { shift: '18:00-08:00', includedHours: 2, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
  { shift: 'Weekend / Holiday', includedHours: 3, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
]

function amount(value: number | null | undefined) {
  return Number(value ?? 0)
}

function locationId(values: LocationFormValues) {
  const basis = `${values.cityCode || values.city || 'location'}-${Date.now()}`
  return `loc-${basis.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function toShiftRate(shift: ShiftFormValues): ShiftRate {
  return {
    shift: shift.shift ?? '08:00-18:00',
    includedHours: amount(shift.includedHours),
    callOutFee: amount(shift.callOutFee),
    additionalHours: amount(shift.additionalHours),
    fullShiftRate: amount(shift.fullShiftRate),
  }
}

function makeLocation(values: LocationFormValues, location: LocationCard | null): LocationCard {
  const slaEnabled = Boolean(values.slaEnabled)
  return {
    id: location?.id ?? locationId(values),
    city: values.city?.trim() || '',
    cityCode: values.cityCode?.trim() || '',
    country: values.country?.trim() || '',
    currency: values.currency || 'EUR',
    invoiceMode: values.invoiceMode ?? 'monthly',
    slaEnabled,
    slaAmount: slaEnabled ? amount(values.slaAmount) : 0,
    slaAttributedTo: slaEnabled ? values.slaAttributedTo?.trim() || undefined : undefined,
    slaNote: slaEnabled ? values.slaNote?.trim() || undefined : undefined,
    endCustomerOverrides: location?.endCustomerOverrides ?? [],
    shifts: (values.shifts?.length ? values.shifts : defaultShifts).map(toShiftRate),
  }
}

export function CustomerLocationDrawer({
  location,
  mode,
  onCancel,
  onSave,
}: {
  location: LocationCard | null
  mode: 'add' | 'edit'
  onCancel: () => void
  onSave: (location: LocationCard) => void
}) {
  const [form] = Form.useForm<LocationFormValues>()
  const slaEnabled = Form.useWatch('slaEnabled', form) ?? location?.slaEnabled ?? false

  function save(values: LocationFormValues) {
    onSave(makeLocation(values, location))
  }

  return (
    <Form<LocationFormValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        city: location?.city,
        cityCode: location?.cityCode,
        country: location?.country,
        currency: location?.currency ?? 'EUR',
        invoiceMode: location?.invoiceMode ?? 'monthly',
        slaEnabled: location?.slaEnabled ?? false,
        slaAmount: location?.slaAmount,
        slaAttributedTo: location?.slaAttributedTo,
        slaNote: location?.slaNote,
        shifts: location?.shifts.length ? location.shifts : defaultShifts,
      }}
      layout="vertical"
      onFinish={save}
    >
      <Card className="section-card" variant="borderless">
        <div className="form-grid form-grid-two">
          <Form.Item name="city" label="City" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cityCode" label="City Code">
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="currency" label="Currency">
            <Select options={[{ value: 'EUR', label: 'EUR' }, { value: 'SEK', label: 'SEK' }, { value: 'NOK', label: 'NOK' }]} />
          </Form.Item>
          <Form.Item name="invoiceMode" label="Invoice Mode">
            <Select options={[{ value: 'monthly', label: 'Monthly' }, { value: 'task', label: 'Per Task' }]} />
          </Form.Item>
          <Form.Item name="slaEnabled" label="SLA Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          {slaEnabled ? (
            <>
              <Form.Item name="slaAmount" label="SLA Amount">
                <InputNumber min={0} precision={2} />
              </Form.Item>
              <Form.Item name="slaAttributedTo" label="SLA Attributed To">
                <Input />
              </Form.Item>
              <Form.Item name="slaNote" label="SLA Note">
                <Input />
              </Form.Item>
            </>
          ) : null}
        </div>
      </Card>

      <Card className="section-card" variant="borderless">
        <Form.List name="shifts">
          {(fields, { add, remove }) => (
            <div className="shift-edit-list">
              <div className="toolbar-row">
                <strong>Shift Rates</strong>
                <Button icon={<PlusOutlined />} onClick={() => add(defaultShifts[0])}>Add Shift</Button>
              </div>
              {fields.map((field) => (
                <div className="shift-edit-row" key={field.key}>
                  <Form.Item name={[field.name, 'shift']} label="Shift">
                    <Select options={shiftOptions} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'callOutFee']} label="Call-out Fee">
                    <InputNumber min={0} precision={2} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'includedHours']} label="Includes">
                    <InputNumber min={0} precision={2} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'additionalHours']} label="Additional Hour">
                    <InputNumber min={0} precision={2} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'fullShiftRate']} label="Full Shift">
                    <InputNumber min={0} precision={2} />
                  </Form.Item>
                  <Form.Item className="shift-remove-item" label=" ">
                    <Button aria-label="Remove shift" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </Form.Item>
                </div>
              ))}
            </div>
          )}
        </Form.List>
      </Card>

      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="submit" type="primary">{mode === 'add' ? 'Add Location' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
