import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import type { Customer, TechnicianProfile, TechnicianTierAssignment, TierLevel } from '../../domain/types'

type AssignmentFormValue = {
  id?: string
  locationId?: string
  tier?: TierLevel
  obh1Enabled?: boolean
  dayRate?: number | null
  nightRate?: number | null
}

type TechnicianEditorValues = {
  name?: string
  aliases?: string
  active?: boolean
  assignments?: AssignmentFormValue[]
}

export type TechnicianEditorResult = {
  technician: TechnicianProfile
  assignments: TechnicianTierAssignment[]
}

function technicianId(name: string) {
  return `tech-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function assignmentId(technicianIdValue: string, locationId: string, tier: TierLevel) {
  return `${technicianIdValue}-${locationId}-${tier.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function makeTechnician(values: TechnicianEditorValues, technician: TechnicianProfile | null): TechnicianProfile {
  const name = values.name?.trim() || 'New Technician'
  return {
    id: technician?.id || technicianId(name),
    name,
    aliases: Array.from(new Set(
      String(values.aliases || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    )),
    active: values.active ?? technician?.active ?? true,
  }
}

function makeAssignments(values: AssignmentFormValue[] | undefined, technicianIdValue: string) {
  return (values || [])
    .filter((value) => value.locationId && value.tier)
    .map((value) => ({
      id: value.id || assignmentId(technicianIdValue, value.locationId || '', value.tier || 'Tier 1'),
      technicianId: technicianIdValue,
      locationId: value.locationId || '',
      tier: value.tier || 'Tier 1',
      obh1Enabled: Boolean(value.obh1Enabled),
      dayRate: value.obh1Enabled ? Number(value.dayRate ?? 0) : undefined,
      nightRate: value.obh1Enabled ? Number(value.nightRate ?? 0) : undefined,
    }))
}

export function TechnicianEditorDrawer({
  customer,
  technician,
  assignments,
  mode,
  onCancel,
  onSave,
}: {
  customer: Customer
  technician: TechnicianProfile | null
  assignments: TechnicianTierAssignment[]
  mode: 'add' | 'edit'
  onCancel: () => void
  onSave: (result: TechnicianEditorResult) => void
}) {
  const [form] = Form.useForm<TechnicianEditorValues>()
  const locationOptions = customer.locationCards.map((location) => ({
    value: location.id,
    label: `${location.city}${location.cityCode ? ` (${location.cityCode})` : ''}, ${location.country}`,
  }))

  function supportsObh1(locationId: string | undefined) {
    const location = customer.locationCards.find((card) => card.id === locationId)
    if (!location) return false
    return Boolean(
      location.tierRates?.some((rate) => rate.shift === 'OBH1')
      || location.shifts.some((shift) => shift.shift === 'OBH1' && shift.additionalHours > 0),
    )
  }

  function save(values: TechnicianEditorValues) {
    const nextTechnician = makeTechnician(values, technician)
    onSave({
      technician: nextTechnician,
      assignments: makeAssignments(values.assignments, nextTechnician.id),
    })
  }

  return (
    <Form<TechnicianEditorValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        name: technician?.name,
        aliases: (technician?.aliases || []).join(', '),
        active: technician?.active ?? true,
        assignments,
      }}
      layout="vertical"
      onFinish={save}
    >
      <Card className="section-card" variant="borderless">
        <div className="form-grid form-grid-two">
          <Form.Item name="name" label="Technician" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="aliases" label="Aliases">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Adrian Costas, Radu Zeida" />
          </Form.Item>
        </div>
      </Card>

      <Card className="section-card" variant="borderless">
        <Form.List name="assignments">
          {(fields, { add, remove }) => (
            <div className="shift-edit-list">
              <div className="toolbar-row">
                <strong>Location / Tier Assignments</strong>
                <Button icon={<PlusOutlined />} onClick={() => add({ tier: 'Tier 1', obh1Enabled: false })}>Add Assignment</Button>
              </div>
              {fields.map((field) => (
                  <div className="shift-edit-row" key={field.key}>
                  <Form.Item hidden name={[field.name, 'id']}>
                    <Input />
                  </Form.Item>
                  <Form.Item name={[field.name, 'locationId']} label="Location">
                    <Select options={locationOptions} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'tier']} label="Tier">
                    <Select options={[{ value: 'Tier 1', label: 'Tier 1' }, { value: 'Tier 2', label: 'Tier 2' }, { value: 'Tier 3', label: 'Tier 3' }]} />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(previous, next) => (
                    previous.assignments?.[field.name]?.locationId !== next.assignments?.[field.name]?.locationId
                    || previous.assignments?.[field.name]?.obh1Enabled !== next.assignments?.[field.name]?.obh1Enabled
                  )}>
                    {({ getFieldValue }) => {
                      const locationId = getFieldValue(['assignments', field.name, 'locationId'])
                      const obh1Allowed = supportsObh1(locationId)
                      const obh1Enabled = Boolean(getFieldValue(['assignments', field.name, 'obh1Enabled']))
                      return (
                        <>
                          <Form.Item
                            name={[field.name, 'obh1Enabled']}
                            label="OBH1"
                            tooltip={obh1Allowed ? undefined : 'Enable OBH1 on the location first'}
                            valuePropName="checked"
                          >
                            <Switch disabled={!obh1Allowed} />
                          </Form.Item>
                          <Form.Item name={[field.name, 'dayRate']} label="Day Rate">
                            <InputNumber disabled={!obh1Allowed || !obh1Enabled} min={0} precision={2} />
                          </Form.Item>
                          <Form.Item name={[field.name, 'nightRate']} label="Night Rate">
                            <InputNumber disabled={!obh1Allowed || !obh1Enabled} min={0} precision={2} />
                          </Form.Item>
                        </>
                      )
                    }}
                  </Form.Item>
                  <Form.Item className="shift-remove-item" label=" ">
                    <Button aria-label="Remove assignment" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </Form.Item>
                </div>
              ))}
            </div>
          )}
        </Form.List>
      </Card>

      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="submit" type="primary">{mode === 'add' ? 'Add Technician' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
