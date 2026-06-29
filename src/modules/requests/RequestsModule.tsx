import { CheckSquareOutlined, SearchOutlined, TableOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Card, Input, Modal, Select, Space } from 'antd'
import { useMemo, useState } from 'react'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { PageHeader } from '../../design-system/PageHeader'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'
import {
  effectiveRequestStatus,
  getRequestReminderDate,
  newRequestRecord,
  requestKinds,
  requestNeedsAttention,
  requestSources,
  requestStatuses,
  type RequestStatus,
  type ServiceRequestRecord,
} from './requestTypes'

const { TextArea } = Input
type RequestView = 'queue' | 'all' | 'contacts'

function statusTone(status: RequestStatus): StatusTone {
  if (['Won', 'Qualified', 'Quoted'].includes(status)) return 'success'
  if (['Follow up', 'Needs reply', 'Quote needed'].includes(status)) return 'warning'
  if (['Spam', 'Lost', 'Not relevant'].includes(status)) return 'critical'
  return 'neutral'
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function searchable(request: ServiceRequestRecord) {
  return [
    request.companyName,
    request.contactName,
    request.email,
    request.phone,
    request.locations,
    request.requestSummary,
    request.originalMessage,
    request.notes,
    request.owner,
    request.sourceReference,
  ].join(' ').toLowerCase()
}

function sortRequests(requests: ServiceRequestRecord[]) {
  return [...requests].sort((left, right) => {
    const leftAttention = requestNeedsAttention(left) ? 0 : 1
    const rightAttention = requestNeedsAttention(right) ? 0 : 1
    if (leftAttention !== rightAttention) return leftAttention - rightAttention
    return String(getRequestReminderDate(right) || right.receivedDate).localeCompare(String(getRequestReminderDate(left) || left.receivedDate))
  })
}

function contactRows(requests: ServiceRequestRecord[]) {
  const contacts = new Map<string, {
    key: string
    companyName: string
    contactName: string
    email: string
    phone: string
    requestCount: number
    attentionCount: number
    latestDate: string
  }>()
  requests.forEach((request) => {
    const key = (request.email || request.companyName || request.contactName || request.id).toLowerCase()
    const current = contacts.get(key)
    contacts.set(key, {
      key,
      companyName: current?.companyName || request.companyName,
      contactName: current?.contactName || request.contactName,
      email: current?.email || request.email,
      phone: current?.phone || request.phone,
      requestCount: (current?.requestCount || 0) + 1,
      attentionCount: (current?.attentionCount || 0) + (requestNeedsAttention(request) ? 1 : 0),
      latestDate: [current?.latestDate || '', request.updatedAt || request.receivedDate].sort().at(-1) || '',
    })
  })
  return [...contacts.values()].sort((left, right) => right.latestDate.localeCompare(left.latestDate))
}

function requestId() {
  return `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function field(label: string, value: string, wrap = false, className = '') {
  return (
    <div className={['info-field', className].filter(Boolean).join(' ')}>
      <span>{label}</span>
      <strong className={wrap ? 'info-field-value-wrap' : undefined}>{value || '-'}</strong>
    </div>
  )
}

export function RequestsModule({
  requests,
  onDeleteRequest,
  onSaveRequest,
}: {
  requests: ServiceRequestRecord[]
  onDeleteRequest: (requestId: string) => void
  onSaveRequest: (request: ServiceRequestRecord) => void
}) {
  const [activeView, setActiveView] = useState<RequestView>('all')
  const [query, setQuery] = useState('')
  const [expandedRequestId, setExpandedRequestId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isNewDraft, setIsNewDraft] = useState(false)
  const [draft, setDraft] = useState<ServiceRequestRecord>(() => newRequestRecord())
  const effectiveStatus = effectiveRequestStatus(draft)
  const contacts = useMemo(() => contactRows(requests), [requests])
  const visibleRequests = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const base = activeView === 'queue' ? requests.filter(requestNeedsAttention) : activeView === 'all' ? requests : []
    return sortRequests(base).filter((request) => !needle || searchable(request).includes(needle))
  }, [activeView, query, requests])
  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return contacts.filter((contact) => !needle || [
      contact.companyName,
      contact.contactName,
      contact.email,
      contact.phone,
    ].join(' ').toLowerCase().includes(needle))
  }, [contacts, query])
  const followUps = requests.filter((request) => effectiveRequestStatus(request) === 'Follow up').length
  const openRequests = requests.filter((request) => !['Won', 'Lost', 'Dormant', 'Spam', 'Applicant', 'Not relevant', 'Duplicate'].includes(request.status)).length
  const canSave = Boolean(draft.contactName.trim() || draft.companyName.trim() || draft.email.trim() || draft.requestSummary.trim() || draft.originalMessage.trim())
  const topTabs = [
    { key: 'queue' as const, label: 'Action Queue', icon: <CheckSquareOutlined /> },
    { key: 'all' as const, label: 'All Requests', icon: <TableOutlined /> },
    { key: 'contacts' as const, label: 'Contacts', icon: <TeamOutlined /> },
  ]

  function editRequest(request: ServiceRequestRecord) {
    setExpandedRequestId(request.id)
    setIsNewDraft(false)
    setDraft(request)
    setIsEditorOpen(true)
  }

  function startNewRequest() {
    setExpandedRequestId('')
    setIsNewDraft(true)
    setDraft(newRequestRecord())
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
  }

  function updateDraft<K extends keyof ServiceRequestRecord>(key: K, value: ServiceRequestRecord[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function saveDraft() {
    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const next = {
      ...draft,
      id: draft.id || requestId(),
      createdAt: draft.createdAt || now,
      lastContactDate: draft.status === 'Replied' && !draft.lastContactDate ? today : draft.lastContactDate,
      updatedAt: now,
    }
    onSaveRequest(next)
    setExpandedRequestId(next.id)
    setIsNewDraft(false)
    setDraft(next)
    setIsEditorOpen(false)
    setActiveView('all')
  }

  function deleteDraft() {
    if (!draft.id) return
    onDeleteRequest(draft.id)
    setExpandedRequestId('')
    setDraft(newRequestRecord())
    setIsNewDraft(false)
    setIsEditorOpen(false)
  }

  function toggleRequest(requestId: string) {
    setExpandedRequestId((current) => (current === requestId ? '' : requestId))
  }

  const requestColumns: ErpTableColumn<ServiceRequestRecord>[] = [
    { title: 'Received', dataIndex: 'receivedDate', width: '12%', render: (_, request) => formatDate(request.receivedDate) },
    { title: 'Contact', width: '24%', render: (_, request) => (
      <span className="table-primary-text">{request.companyName || request.contactName || request.email || '-'}</span>
    ) },
    { title: 'Source', dataIndex: 'source', width: '13%' },
    { title: 'Locations', dataIndex: 'locations', width: '23%' },
    { title: 'Status', width: '15%', render: (_, request) => {
      const status = effectiveRequestStatus(request)
      return <StatusBadge label={status} tone={statusTone(status)} />
    } },
    { title: 'Next', dataIndex: 'nextFollowUpDate', width: '13%', render: (_, request) => formatDate(getRequestReminderDate(request)) },
  ]
  const contactColumns: ErpTableColumn<ReturnType<typeof contactRows>[number]>[] = [
    { title: 'Company', dataIndex: 'companyName', width: '24%' },
    { title: 'Contact', dataIndex: 'contactName', width: '18%' },
    { title: 'Email', dataIndex: 'email', width: '27%' },
    { title: 'Phone', dataIndex: 'phone', width: '15%' },
    { title: 'Requests', dataIndex: 'requestCount', width: '8%' },
    { title: 'Attention', dataIndex: 'attentionCount', width: '8%' },
  ]

  function renderRequestExpanded(request: ServiceRequestRecord) {
    const status = effectiveRequestStatus(request)
    return (
      <div className="request-expanded-panel">
        <div className="toolbar-row">
          <div className="home-section-head">
            <span className="home-section-label">Request Detail</span>
            <strong className="home-section-value">{request.companyName || request.contactName || request.email || '-'}</strong>
          </div>
          <Button onClick={(event) => {
            event.stopPropagation()
            editRequest(request)
          }}
          >
            Edit Request
          </Button>
        </div>
        <div className="request-expanded-grid">
          <span className="request-expanded-section-title">Request</span>
          {field('Received', formatDate(request.receivedDate))}
          {field('Status', status)}
          {field('Type', request.kind)}
          {field('Source', request.source)}
          {field('Last contact', formatDate(request.lastContactDate))}
          {field('Reminder date', formatDate(getRequestReminderDate(request)))}
          {field('Handled by', request.owner)}
          {field('Channel link / ref', request.sourceReference, true)}
          {field('Locations', request.locations, true, 'request-expanded-wide')}
          {field('Summary', request.requestSummary, true, 'request-expanded-full')}
          <span className="request-expanded-section-title">Contact</span>
          {field('Company', request.companyName)}
          {field('Contact name', request.contactName)}
          {field('Email', request.email, true)}
          {field('Phone', request.phone)}
          {field('Website', request.website, true)}
          {field('Title / role', request.title)}
          <span className="request-expanded-section-title">Message / Notes</span>
          {field('Original message', request.originalMessage, true, 'request-expanded-full')}
          {field('Internal notes', request.notes, true, 'request-expanded-full')}
          <span className="request-expanded-section-title">Record</span>
          {field('Created', formatDate(request.createdAt))}
          {field('Updated', formatDate(request.updatedAt))}
        </div>
      </div>
    )
  }

  const requestForm = (
    <>
      <div className="request-status-row">
        {field('Current status', effectiveStatus)}
        {field('Last contact', formatDate(draft.lastContactDate))}
        {field('Reminder date', formatDate(getRequestReminderDate(draft)))}
      </div>
      <div className="request-form-grid">
        <span className="request-form-section-title">Request</span>
        <label className="request-form-field"><span>Received</span><Input type="date" value={draft.receivedDate} onChange={(event) => updateDraft('receivedDate', event.target.value)} /></label>
        <label className="request-form-field"><span>Source</span><Select options={requestSources.map((value) => ({ value, label: value }))} value={draft.source} onChange={(value) => updateDraft('source', value)} /></label>
        <label className="request-form-field"><span>Type</span><Select options={requestKinds.map((value) => ({ value, label: value }))} value={draft.kind} onChange={(value) => updateDraft('kind', value)} /></label>
        <label className="request-form-field"><span>Status</span><Select options={requestStatuses.map((value) => ({ value, label: value }))} value={draft.status} onChange={(value) => updateDraft('status', value)} /></label>
        <label className="request-form-field"><span>Last Contact</span><Input type="date" value={draft.lastContactDate} onChange={(event) => updateDraft('lastContactDate', event.target.value)} /></label>
        <label className="request-form-field"><span>Next Follow-up Override</span><Input type="date" value={draft.nextFollowUpDate} onChange={(event) => updateDraft('nextFollowUpDate', event.target.value)} /></label>
        <label className="request-form-field"><span>Handled By</span><Input value={draft.owner} onChange={(event) => updateDraft('owner', event.target.value)} /></label>
        <label className="request-form-field"><span>Channel Link / Ref</span><Input value={draft.sourceReference} onChange={(event) => updateDraft('sourceReference', event.target.value)} placeholder="Teams link, email subject, form ID" /></label>
        <label className="request-form-field request-form-span-2"><span>Locations</span><Input value={draft.locations} onChange={(event) => updateDraft('locations', event.target.value)} placeholder="Stockholm, Oslo, Frankfurt..." /></label>
        <label className="request-form-field request-form-span-2"><span>Summary</span><Input value={draft.requestSummary} onChange={(event) => updateDraft('requestSummary', event.target.value)} placeholder="Short description of the request" /></label>
        <span className="request-form-section-title">Contact</span>
        <label className="request-form-field"><span>Company</span><Input value={draft.companyName} onChange={(event) => updateDraft('companyName', event.target.value)} /></label>
        <label className="request-form-field"><span>Contact Name</span><Input value={draft.contactName} onChange={(event) => updateDraft('contactName', event.target.value)} /></label>
        <label className="request-form-field"><span>Email</span><Input value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} /></label>
        <label className="request-form-field"><span>Phone</span><Input value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} /></label>
        <label className="request-form-field"><span>Website</span><Input value={draft.website} onChange={(event) => updateDraft('website', event.target.value)} /></label>
        <label className="request-form-field"><span>Title / Role</span><Input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
        <span className="request-form-section-title">Message / Notes</span>
        <label className="request-form-field request-form-span-2"><span>Original Message</span><TextArea rows={8} value={draft.originalMessage} onChange={(event) => updateDraft('originalMessage', event.target.value)} /></label>
        <label className="request-form-field request-form-span-2"><span>Internal Notes</span><TextArea rows={7} value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></label>
      </div>
    </>
  )

  return (
    <>
      <div className="customer-workspace-topbar global-workspace-topbar requests-topbar">
        <nav className="customer-workspace-nav" aria-label="Request sections">
          {topTabs.map((tab) => (
            <button
              className={`customer-workspace-nav-item${activeView === tab.key ? ' is-active' : ''}`}
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              type="button"
            >
              <span className="customer-workspace-nav-icon" aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <PageHeader
        title="Requests"
        actions={<Button type="primary" onClick={startNewRequest}>New Request</Button>}
      />
      <div className="metric-strip">
        <div className="metric-card"><span>Requests</span><strong>{requests.length}</strong></div>
        <div className="metric-card"><span>Open</span><strong>{openRequests}</strong></div>
        <div className="metric-card"><span>Follow up</span><strong>{followUps}</strong></div>
        <div className="metric-card"><span>Contacts</span><strong>{contacts.length}</strong></div>
      </div>

      <div className="requests-tab-shell">
        <Card className="workspace-card" variant="borderless">
          <div className="toolbar-row">
            <span className="toolbar-count">
              {activeView === 'contacts' ? `${visibleContacts.length} contacts` : `${visibleRequests.length} requests`}
            </span>
            <Input
              allowClear
              className="toolbar-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={activeView === 'contacts' ? 'Search contacts' : 'Search requests'}
              prefix={<SearchOutlined />}
              value={query}
            />
          </div>
          {activeView === 'contacts' ? (
            <ErpDataTable
              columnSizing="manual"
              columns={contactColumns}
              dataSource={visibleContacts}
              locale={{ emptyText: 'No stored contacts yet.' }}
              rowKey="key"
            />
          ) : (
            <ErpDataTable<ServiceRequestRecord>
              columnSizing="manual"
              columns={requestColumns}
              dataSource={visibleRequests}
              expandable={{
                expandedRowKeys: expandedRequestId && visibleRequests.some((request) => request.id === expandedRequestId) ? [expandedRequestId] : [],
                expandedRowRender: renderRequestExpanded,
                onExpand: (expanded, request) => setExpandedRequestId(expanded ? request.id : ''),
                showExpandColumn: false,
              }}
              locale={{ emptyText: activeView === 'queue' ? 'No requests need attention.' : 'No requests logged yet.' }}
              onRow={(request) => ({ onClick: () => toggleRequest(request.id) })}
              rowClassName={(request) => (request.id === expandedRequestId ? 'selected-row expanded-row' : '')}
              rowKey="id"
            />
          )}
        </Card>
      </div>
      <Modal
        footer={(
          <Space>
            <Button onClick={closeEditor}>Cancel</Button>
            <Button disabled={!draft.id} onClick={deleteDraft}>Delete</Button>
            <Button disabled={!canSave} onClick={saveDraft} type="primary">Save</Button>
          </Space>
        )}
        onCancel={closeEditor}
        open={isEditorOpen}
        title={isNewDraft ? 'New Request' : 'Edit Request'}
        width={900}
      >
        {requestForm}
      </Modal>
    </>
  )
}
