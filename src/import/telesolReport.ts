import { formatDisplayDate, normalizeServiceDate, normalizeTimestamp, parseWorkTimestamp } from '../domain/dates'
import { ensureUniqueJobIds } from '../domain/jobIds'
import { parseAmount } from '../domain/money'
import type { ImportResult, JobInput } from '../domain/types'

function get(row: Record<string, string>, key: string) {
  return String(row[key] ?? '').trim()
}

function combinedTimestamp(row: Record<string, string>, dateKey: string, timeKey: string) {
  const date = get(row, dateKey)
  const time = get(row, timeKey)
  if (!time) return ''
  if (parseWorkTimestamp(time)) return normalizeTimestamp(time)
  return normalizeTimestamp(`${date} ${time}`)
}

function serviceDate(row: Record<string, string>) {
  const value = get(row, 'Date Departure (Site date)') || get(row, 'Requested date')
  const parsed = parseWorkTimestamp(`${value} 00:00`)
  return parsed ? formatDisplayDate(parsed) : normalizeServiceDate(value)
}

function makeId(index: number, row: Record<string, string>) {
  const basis = `${get(row, 'Ticket')}-${get(row, 'Service Appointment') || index + 2}`
  return basis.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `row-${index + 2}`
}

function rowToJob(row: Record<string, string>, index: number): JobInput {
  const requestDateKey = 'Requested date'
  const departureDateKey = 'Date Departure (Site date)'
  return {
    id: makeId(index, row),
    sourceRow: index + 2,
    date: serviceDate(row),
    businessEntity: get(row, 'Telesol Business Entity'),
    serviceAppointment: get(row, 'Service Appointment'),
    ticket: get(row, 'Ticket'),
    customerRef: get(row, 'Service Appointment'),
    city: get(row, 'City'),
    country: get(row, 'Country'),
    endCustomer: get(row, 'Customer'),
    technician: get(row, 'Field Engineer'),
    summary: get(row, 'Subject'),
    reportStatus: get(row, 'Status'),
    completionNotes: get(row, 'Completion Notes'),
    travelStart: combinedTimestamp(row, requestDateKey, 'Travel Start'),
    onSite: combinedTimestamp(row, requestDateKey, 'Time on-site'),
    offSite: combinedTimestamp(row, departureDateKey, 'Time off-site'),
    travelFinish: combinedTimestamp(row, departureDateKey, 'Travel Finish'),
    consumablesAmount: parseAmount(get(row, 'Consumables cost (local)')),
    consumablesDescription: get(row, 'Consumables purchased'),
    raw: row,
  }
}

export function importTelesolRows(rows: Record<string, string>[], headers: string[], sheetName?: string): ImportResult {
  const warnings: string[] = []
  const jobs = ensureUniqueJobIds(rows.map(rowToJob).filter((job) => job.ticket))
  if (!jobs.length) warnings.push('No Telesol job rows were found in the customer report first sheet.')
  return { jobs, headers, sheetName, warnings }
}
