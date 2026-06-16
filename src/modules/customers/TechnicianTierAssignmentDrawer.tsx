import { Button, Form, Select, Space, Switch } from 'antd'
import type { Customer, TechnicianTierAssignment, TierLevel } from '../../domain/types'

type TechnicianTierAssignmentFormValues = {
  locationId?: string
  tier?: TierLevel
  obh1Enabled?: boolean
}

function assignmentId(values: TechnicianTierAssignmentFormValues, technicianId: string) {
  return `${technicianId}-${values.locationId || 'location'}-${String(values.tier || 'tier-1').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function makeAssignment(values: TechnicianTierAssignmentFormValues, technicianId: string, assignment: TechnicianTierAssignment | null): TechnicianTierAssignment {
  return {
    id: assignment?.id || assignmentId(values, technicianId),
    technicianId,
    locationId: values.locationId || '',
    tier: values.tier || 'Tier 1',
    obh1Enabled: Boolean(values.obh1Enabled),
  }
}

export function TechnicianTierAssignmentDrawer({
  customer,
  technicianId,
  assignment,
  mode,
  onCancel,
  onSave,
}: {
  customer: Customer
  technicianId: string
  assignment: TechnicianTierAssignment | null
  mode: 'add' | 'edit'
  onCancel: () => void
  onSave: (assignment: TechnicianTierAssignment) => void
}) {
  const [form] = Form.useForm<TechnicianTierAssignmentFormValues>()
  const locationOptions = customer.locationCards.map((location) => ({
    value: location.id,
    label: `${location.city}${location.cityCode ? ` (${location.cityCode})` : ''}, ${location.country}`,
  }))

  function save(values: TechnicianTierAssignmentFormValues) {
    onSave(makeAssignment(values, technicianId, assignment))
  }

  return (
    <Form<TechnicianTierAssignmentFormValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        locationId: assignment?.locationId,
        tier: assignment?.tier || 'Tier 1',
        obh1Enabled: assignment?.obh1Enabled ?? false,
      }}
      layout="vertical"
      onFinish={save}
    >
      <div className="form-grid form-grid-two">
        <Form.Item name="locationId" label="Location" rules={[{ required: true }]}>
          <Select options={locationOptions} />
        </Form.Item>
        <Form.Item name="tier" label="Tier" rules={[{ required: true }]}>
          <Select options={[{ value: 'Tier 1', label: 'Tier 1' }, { value: 'Tier 2', label: 'Tier 2' }, { value: 'Tier 3', label: 'Tier 3' }]} />
        </Form.Item>
        <Form.Item name="obh1Enabled" label="OBH1 Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </div>
      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="submit" type="primary">{mode === 'add' ? 'Add Assignment' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
