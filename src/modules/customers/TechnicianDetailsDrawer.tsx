import { Button, Form, Input, Space, Switch } from 'antd'
import type { TechnicianProfile } from '../../domain/types'

type TechnicianFormValues = {
  name?: string
  aliases?: string
  active?: boolean
}

function technicianId(values: TechnicianFormValues) {
  const basis = values.name || `technician-${Date.now()}`
  return `tech-${basis.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function makeTechnician(values: TechnicianFormValues, technician: TechnicianProfile | null): TechnicianProfile {
  return {
    id: technician?.id || technicianId(values),
    name: values.name?.trim() || 'New Technician',
    aliases: Array.from(new Set(
      String(values.aliases || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    )),
    active: values.active ?? technician?.active ?? true,
  }
}

export function TechnicianDetailsDrawer({
  mode,
  technician,
  onCancel,
  onSave,
}: {
  mode: 'add' | 'edit'
  technician: TechnicianProfile | null
  onCancel: () => void
  onSave: (technician: TechnicianProfile) => void
}) {
  const [form] = Form.useForm<TechnicianFormValues>()

  function save(values: TechnicianFormValues) {
    onSave(makeTechnician(values, technician))
  }

  return (
    <Form<TechnicianFormValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        name: technician?.name,
        aliases: (technician?.aliases || []).join(', '),
        active: technician?.active ?? true,
      }}
      layout="vertical"
      onFinish={save}
    >
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
      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="submit" type="primary">{mode === 'add' ? 'Add Technician' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
