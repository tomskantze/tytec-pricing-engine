import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Drawer, Space } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { Customer } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { CustomerSummary } from './CustomerSummary'
import { TechnicianEditorDrawer, type TechnicianEditorResult } from './TechnicianEditorDrawer'

type TechnicianTableRow = {
  id: string
  name: string
  aliases: string[]
  active: boolean
  assignments: string
}

function technicianColumns(): ErpTableColumn<TechnicianTableRow>[] {
  return [
    { title: 'Technician', dataIndex: 'name', erpSize: 'normal' },
    { title: 'Aliases', erpSize: 'text', render: (_, row) => row.aliases.join(', ') || '-', width: 220 },
    { title: 'Status', erpSize: 'compact', render: (_, row) => row.active ? 'Active' : 'Inactive', width: 88 },
    { title: 'Location / Tier', dataIndex: 'assignments', erpSize: 'text', width: 320, render: (value: string) => value || '-' },
  ]
}

export function TechniciansModule({
  customer,
  onCustomerChange,
}: {
  customer: Customer
  onCustomerChange: (customer: Customer, previousKey?: string) => void
}) {
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(customer.technicians?.[0]?.id ?? null)
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit' | null>(null)
  const technicians = customer.technicians || []
  const assignments = customer.technicianTierAssignments || []
  const overrides = customer.technicianRates || []
  const activeTechnicianCount = technicians.filter((technician) => technician.active).length

  const rows = useMemo<TechnicianTableRow[]>(() => (
    technicians.map((technician) => {
      const technicianAssignments = assignments.filter((assignment) => assignment.technicianId === technician.id)
      const assignmentText = technicianAssignments
        .map((assignment) => {
          const location = customer.locationCards.find((card) => card.id === assignment.locationId)
          const label = location ? `${location.city}${location.cityCode ? ` (${location.cityCode})` : ''}` : assignment.locationId
          const rates = assignment.obh1Enabled && (assignment.dayRate || assignment.nightRate)
            ? ` (${assignment.dayRate ?? 0} / ${assignment.nightRate ?? 0})`
            : ''
          return `${label}: ${assignment.tier}${assignment.obh1Enabled ? ' + OBH1' : ''}${rates}`
        })
        .join(' · ')
      return {
        id: technician.id,
        name: technician.name,
        aliases: technician.aliases || [],
        active: technician.active,
        assignments: assignmentText,
      }
    })
  ), [assignments, customer.locationCards, overrides, technicians])

  const selectedTechnician = technicians.find((technician) => technician.id === selectedTechnicianId) || null

  useEffect(() => {
    if (!rows.length) {
      setSelectedTechnicianId(null)
      return
    }
    if (!selectedTechnicianId || !rows.some((row) => row.id === selectedTechnicianId)) {
      setSelectedTechnicianId(rows[0].id)
    }
  }, [rows, selectedTechnicianId])

  function updateCustomer(next: Partial<Customer>) {
    onCustomerChange({ ...customer, ...next }, customer.customerKey)
  }

  function saveTechnician(result: TechnicianEditorResult) {
    const exists = technicians.some((technician) => technician.id === result.technician.id)
    updateCustomer({
      technicians: exists
        ? technicians.map((technician) => (technician.id === result.technician.id ? result.technician : technician))
        : [...technicians, result.technician],
      technicianTierAssignments: [
        ...assignments.filter((assignment) => assignment.technicianId !== result.technician.id),
        ...result.assignments,
      ],
      technicianRates: overrides,
    })
    setSelectedTechnicianId(result.technician.id)
    setDrawerMode(null)
  }

  function deleteTechnician() {
    if (!selectedTechnician) return
    updateCustomer({
      technicians: technicians.filter((technician) => technician.id !== selectedTechnician.id),
      technicianTierAssignments: assignments.filter((assignment) => assignment.technicianId !== selectedTechnician.id),
      technicianRates: overrides.filter((override) => override.technicianId !== selectedTechnician.id),
    })
    setSelectedTechnicianId(null)
  }

  return (
    <>
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary customer={customer} />
        <div className="toolbar-row">
          <span className="toolbar-count">
            {technicians.length} technicians · {activeTechnicianCount} active
          </span>
          <Space size={8} wrap>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setDrawerMode('add')}>Add Technician</Button>
            <Button disabled={!selectedTechnician} icon={<EditOutlined />} onClick={() => setDrawerMode('edit')}>Edit Technician</Button>
            <Button danger disabled={!selectedTechnician} icon={<DeleteOutlined />} onClick={deleteTechnician}>Delete Technician</Button>
          </Space>
        </div>
        <ErpDataTable<TechnicianTableRow>
          columns={technicianColumns()}
          dataSource={rows}
          onRow={(row) => ({ onClick: () => setSelectedTechnicianId(row.id) })}
          rowClassName={(row) => (row.id === selectedTechnicianId ? 'selected-row' : '')}
          rowKey="id"
        />
      </Card>

      <Drawer
        destroyOnHidden
        onClose={() => setDrawerMode(null)}
        open={drawerMode !== null}
        title={drawerMode === 'add' ? 'Add Technician' : 'Edit Technician'}
        width={760}
      >
        <TechnicianEditorDrawer
          assignments={selectedTechnician ? assignments.filter((assignment) => assignment.technicianId === selectedTechnician.id) : []}
          customer={customer}
          mode={drawerMode ?? 'add'}
          onCancel={() => setDrawerMode(null)}
          onSave={saveTechnician}
          technician={drawerMode === 'edit' ? selectedTechnician : null}
        />
      </Drawer>
    </>
  )
}
