import { normalizeServiceDate, normalizeTimestamp } from '../../domain/dates'
import { parseAmount } from '../../domain/money'
import type { Customer, JobInput } from '../../domain/types'

const summaryMonths: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

const baseAliases: Record<string, { city: string; cityCode: string; country: string }> = {
  STO: { city: 'Stockholm', cityCode: 'STO', country: 'Sweden' },
  STHLM: { city: 'Stockholm', cityCode: 'STO', country: 'Sweden' },
  OSL: { city: 'Oslo', cityCode: 'OSL', country: 'Norway' },
  OSLO: { city: 'Oslo', cityCode: 'OSL', country: 'Norway' },
  CPH: { city: 'Copenhagen', cityCode: 'CPH', country: 'Denmark' },
  HEL: { city: 'Helsinki', cityCode: 'HEL', country: 'Finland' },
}

type DraftResult = {
  job: JobInput | null
  warnings: string[]
}

function normalizeKey(value: string) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function locationAliases(customer: Customer) {
  const aliases = { ...baseAliases }
  customer.locationCards.forEach((card) => {
    const canonical = { city: card.city, cityCode: card.cityCode, country: card.country }
    ;[card.cityCode, card.city].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean).forEach((token) => {
      aliases[token] = canonical
    })
  })
  return aliases
}

function parseSummaryDate(value: string) {
  const match = String(value || '').trim().toUpperCase().match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/)
  if (!match) return ''
  const month = summaryMonths[match[2]]
  return month ? `${match[3]}-${month}-${String(match[1]).padStart(2, '0')}` : ''
}

function parseSummary(customer: Customer, value: string) {
  const segments = String(value || '').split(':').map((part) => part.trim())
  if (segments.length < 3) return null
  const serviceDate = parseSummaryDate(segments[0])
  const location = locationAliases(customer)[String(segments[1] || '').toUpperCase()] || null
  return {
    raw: String(value || '').trim(),
    serviceDate,
    location,
    ticket: String(segments[2] || '').trim(),
  }
}

function parseDateToken(value: string) {
  const iso = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dotted = String(value || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dotted) return `${dotted[3]}-${String(dotted[2]).padStart(2, '0')}-${String(dotted[1]).padStart(2, '0')}`
  const slashed = String(value || '').match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (slashed) return `${slashed[3]}-${String(slashed[2]).padStart(2, '0')}-${String(slashed[1]).padStart(2, '0')}`
  return ''
}

function parseTimeToken(value: string) {
  const match = String(value || '').match(/\b(\d{1,2}):(\d{2})\b/)
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : ''
}

function formatLocalIsoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function extractFields(text: string) {
  const fields: Record<string, string> = {}
  let current = ''
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || /^Part \d+\/\d+ submitted on:/i.test(line)) continue
    if (/^With kind regards,/i.test(line)) break
    const field = line.match(/^([^:]+):\s*(.*)$/)
    if (field) {
      current = normalizeKey(field[1])
      fields[current] = field[2].trim()
      continue
    }
    if (current) fields[current] = [fields[current], line].filter(Boolean).join('\n')
  }
  return fields
}

function pick(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields[normalizeKey(key)]
    if (String(value || '').trim()) return String(value).trim()
  }
  return ''
}

function withDates(serviceDate: string, ...times: string[]) {
  if (!serviceDate) return ['', '', '', '']
  const stamped: string[] = []
  let dayOffset = 0
  let previous = ''
  times.forEach((time) => {
    if (!time) {
      stamped.push('')
      return
    }
    if (previous && time < previous) dayOffset += 1
    const date = new Date(`${serviceDate}T00:00:00`)
    date.setDate(date.getDate() + dayOffset)
    stamped.push(normalizeTimestamp(`${formatLocalIsoDate(date)} ${time}`))
    previous = time
  })
  return stamped
}

export function parseCreateJobDraft(customer: Customer, input: {
  summary: string
  sow: string
  workReport: string
  tytecTicket: string
  sourceRow: number
}): DraftResult {
  const warnings: string[] = []
  const summary = parseSummary(customer, input.summary)
  if (!summary) warnings.push('Summary could not be parsed.')
  const fields = extractFields(input.workReport)
  const serviceDate = summary?.serviceDate || parseDateToken(pick(fields, ['Date of Execution', 'Date Departure Site']))
  const travelStartTime = parseTimeToken(pick(fields, ['Time Start Travel to Site']))
  const onSiteTime = parseTimeToken(pick(fields, ['Time Arrived On-Site']))
  const offSiteTime = parseTimeToken(pick(fields, ['Time Departure Site']))
  const travelFinishTime = parseTimeToken(pick(fields, ['(Estimated) Time Back to Base']))
  const [travelStart, onSite, offSite, travelFinish] = withDates(serviceDate, travelStartTime, onSiteTime, offSiteTime, travelFinishTime)
  if (!summary?.location) warnings.push('Location token did not match a configured city.')
  if (!serviceDate) warnings.push('Service date could not be parsed.')
  if (!onSite || !offSite) warnings.push('On-site or off-site timestamps are incomplete.')
  if (!input.tytecTicket.trim()) warnings.push('Tytec ticket is required.')
  if (!summary?.ticket) warnings.push('Customer ticket could not be parsed from the summary.')

  const rawPublicHoliday = pick(fields, ['Public Holiday'])
  const publicHoliday = /^true$/i.test(rawPublicHoliday)
  const job: JobInput | null = summary?.ticket ? {
    id: `${input.tytecTicket || summary.ticket}-${input.sourceRow}`,
    sourceRow: input.sourceRow,
    customerKey: customer.customerKey,
    businessEntity: pick(fields, ['Telesol Invoice Entity']) || customer.name,
    serviceAppointment: pick(fields, ['TTR Number']),
    serviceDate,
    date: serviceDate ? normalizeServiceDate(serviceDate) : '-',
    ticket: summary.ticket,
    jiraIssueKey: input.tytecTicket.trim() || undefined,
    jiraSummary: summary.raw,
    customerRef: summary.ticket,
    city: summary.location?.city || '',
    country: summary.location?.country || '',
    endCustomer: '',
    technician: pick(fields, ['Engineer Name', 'Technician Name']),
    summary: summary.raw,
    sow: String(input.sow || '').trim(),
    reportStatus: pick(fields, ['Did you successfully completed your work?']),
    completionNotes: pick(fields, ['Work Completion Notes']),
    travelStart,
    onSite,
    offSite,
    travelFinish,
    publicHoliday,
    consumablesAmount: parseAmount(pick(fields, ['Consumables Cost'])),
    consumablesDescription: pick(fields, ['Description of Purchased Consumables']),
    raw: {
      summary: String(input.summary || '').trim(),
      sow: String(input.sow || '').trim(),
      workReport: String(input.workReport || '').trim(),
      publicHoliday: rawPublicHoliday,
      customerName: pick(fields, ['Customer Name']),
      customerReference: pick(fields, ['Customer Reference']),
    },
  } : null

  return { job, warnings }
}

export function repairCreatedJobFromRaw(customer: Customer, job: JobInput): JobInput {
  const rawSummary = String(job.raw?.summary || '').trim()
  const rawWorkReport = String(job.raw?.workReport || '').trim()
  if (!rawSummary || !rawWorkReport) return job

  const repaired = parseCreateJobDraft(customer, {
    summary: rawSummary,
    sow: String(job.raw?.sow || job.sow || '').trim(),
    workReport: rawWorkReport,
    tytecTicket: String(job.jiraIssueKey || '').trim(),
    sourceRow: job.sourceRow,
  }).job

  if (!repaired) return job

  return {
    ...job,
    serviceDate: repaired.serviceDate || job.serviceDate,
    date: repaired.date || job.date,
    city: repaired.city || job.city,
    country: repaired.country || job.country,
    travelStart: repaired.travelStart || job.travelStart,
    onSite: repaired.onSite || job.onSite,
    offSite: repaired.offSite || job.offSite,
    travelFinish: repaired.travelFinish || job.travelFinish,
    publicHoliday: repaired.publicHoliday ?? job.publicHoliday,
  }
}
