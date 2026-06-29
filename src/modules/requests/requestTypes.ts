export type RequestSource = 'Website' | 'Teams' | 'Email' | 'Phone' | 'LinkedIn' | 'Referral' | 'Other'
export type RequestKind = 'Service request' | 'Quote request' | 'General inquiry' | 'Applicant' | 'Vendor' | 'Spam'
export type RequestStatus = 'New' | 'Needs reply' | 'Replied' | 'Follow up' | 'Qualified' | 'Quote needed' | 'Quoted' | 'Won' | 'Lost' | 'Dormant' | 'Spam' | 'Applicant' | 'Not relevant' | 'Duplicate'

export type ServiceRequestRecord = {
  id: string
  receivedDate: string
  source: RequestSource
  sourceReference: string
  kind: RequestKind
  status: RequestStatus
  owner: string
  contactName: string
  companyName: string
  email: string
  phone: string
  website: string
  title: string
  locations: string
  requestSummary: string
  originalMessage: string
  notes: string
  lastContactDate: string
  nextFollowUpDate: string
  createdAt: string
  updatedAt: string
}

export const requestSources: RequestSource[] = ['Website', 'Teams', 'Email', 'Phone', 'LinkedIn', 'Referral', 'Other']
export const requestKinds: RequestKind[] = ['Service request', 'Quote request', 'General inquiry', 'Applicant', 'Vendor', 'Spam']
export const requestStatuses: RequestStatus[] = ['New', 'Needs reply', 'Replied', 'Follow up', 'Qualified', 'Quote needed', 'Quoted', 'Won', 'Lost', 'Dormant', 'Spam', 'Applicant', 'Not relevant', 'Duplicate']
const closedStatuses = new Set<RequestStatus>(['Won', 'Lost', 'Dormant', 'Spam', 'Applicant', 'Not relevant', 'Duplicate'])
const defaultFollowUpDays = 7

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function newRequestRecord(): ServiceRequestRecord {
  const now = new Date().toISOString()
  return {
    id: '',
    receivedDate: todayIsoDate(),
    source: 'Website',
    sourceReference: '',
    kind: 'Service request',
    status: 'New',
    owner: '',
    contactName: '',
    companyName: '',
    email: '',
    phone: '',
    website: '',
    title: '',
    locations: '',
    requestSummary: '',
    originalMessage: '',
    notes: '',
    lastContactDate: '',
    nextFollowUpDate: '',
    createdAt: now,
    updatedAt: now,
  }
}

function validIsoDate(value: string) {
  const isoDate = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : ''
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function getRequestReminderDate(request: ServiceRequestRecord) {
  const explicitDate = validIsoDate(request.nextFollowUpDate)
  if (explicitDate) return explicitDate
  if (request.status !== 'Replied') return ''
  const anchorDate = validIsoDate(request.lastContactDate) || validIsoDate(request.updatedAt) || validIsoDate(request.receivedDate)
  return anchorDate ? addDays(anchorDate, defaultFollowUpDays) : ''
}

export function effectiveRequestStatus(request: ServiceRequestRecord, today = todayIsoDate()): RequestStatus {
  if (closedStatuses.has(request.status)) return request.status
  const reminderDate = getRequestReminderDate(request)
  if (reminderDate && reminderDate <= today && !['New', 'Needs reply', 'Follow up'].includes(request.status)) return 'Follow up'
  return request.status
}

export function normalizeRequestStatus(request: ServiceRequestRecord, today = todayIsoDate(), now = new Date().toISOString()): ServiceRequestRecord {
  const status = effectiveRequestStatus(request, today)
  return status === request.status ? request : { ...request, status, updatedAt: now }
}

export function normalizeRequestStatuses(requests: ServiceRequestRecord[], today = todayIsoDate(), now = new Date().toISOString()) {
  let changed = false
  const normalized = requests.map((request) => {
    const next = normalizeRequestStatus(request, today, now)
    if (next !== request) changed = true
    return next
  })
  return changed ? normalized : requests
}

export function requestNeedsAttention(request: ServiceRequestRecord) {
  return ['New', 'Needs reply', 'Follow up', 'Quote needed'].includes(effectiveRequestStatus(request))
}
