import { Button, Form, InputNumber, Select, Space } from 'antd'
import type { CategoryRateType, Customer, LocationCard, TechnicianRate } from '../../domain/types'

type TechnicianRateFormValues = {
  locationId?: string
  shift?: TechnicianRate['shift']
  rateType?: CategoryRateType
  rate?: number | null
}

function rateId(values: TechnicianRateFormValues, technicianId: string) {
  return `${technicianId}-${values.locationId || 'location'}-${String(values.shift || 'reg').toLowerCase()}-${String(values.rateType || 'day').toLowerCase()}`
}

function makeTechnicianRate(values: TechnicianRateFormValues, technicianId: string, rate: TechnicianRate | null): TechnicianRate {
  return {
    id: rate?.id || rateId(values, technicianId),
    technicianId,
    locationId: values.locationId || '',
    shift: values.shift || 'REG',
    rateType: values.rateType || 'Day',
    rate: Number(values.rate ?? 0),
  }
}

export function TechnicianRateDrawer({
  customer,
  mode,
  rate,
  technicianId,
  onCancel,
  onSave,
}: {
  customer: Customer
  mode: 'add' | 'edit'
  rate: TechnicianRate | null
  technicianId: string
  onCancel: () => void
  onSave: (rate: TechnicianRate) => void
}) {
  const [form] = Form.useForm<TechnicianRateFormValues>()
  const locationOptions = customer.locationCards.map((location: LocationCard) => ({
    value: location.id,
    label: `${location.city}${location.cityCode ? ` (${location.cityCode})` : ''}, ${location.country}`,
  }))

  function save(values: TechnicianRateFormValues) {
    onSave(makeTechnicianRate(values, technicianId, rate))
  }

  return (
    <Form<TechnicianRateFormValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        locationId: rate?.locationId,
        shift: rate?.shift || 'REG',
        rateType: rate?.rateType || 'Day',
        rate: rate?.rate ?? 0,
      }}
      layout="vertical"
      onFinish={save}
    >
      <div className="form-grid form-grid-two">
        <Form.Item name="locationId" label="Location" rules={[{ required: true }]}>
          <Select options={locationOptions} />
        </Form.Item>
        <Form.Item name="shift" label="Rate Bucket" rules={[{ required: true }]}>
          <Select options={[{ value: 'REG', label: 'REG' }, { value: 'OBH1', label: 'OBH1' }]} />
        </Form.Item>
        <Form.Item name="rateType" label="Rate Type" rules={[{ required: true }]}>
          <Select options={[{ value: 'Day', label: 'Day' }, { value: 'Night', label: 'Night' }]} />
        </Form.Item>
        <Form.Item name="rate" label="Rate" rules={[{ required: true }]}>
          <InputNumber min={0} precision={2} />
        </Form.Item>
      </div>
      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="submit" type="primary">{mode === 'add' ? 'Add Rate' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
