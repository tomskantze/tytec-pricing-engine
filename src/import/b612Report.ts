import { formatDisplayDate, normalizeServiceDate } from '../domain/dates'
import { ensureUniqueJobIds } from '../domain/jobIds'
import { getLocationCardForText } from '../domain/matching'
import { parseAmount } from '../domain/money'
import type { Customer, ImportResult, JobInput, ReportedHours } from '../domain/types'

function get(row: Record<string, string>, key: string) {
  return String(row[key] ?? '').trim()
}

function makeId(index: number, row: Record<string, string>) {
  const basis = get(row, 'Related Ticket') ? `${get(row, 'Related Ticket')}-${index + 2}` : `row-${index + 2}`
  return basis.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `row-${index + 2}`
}

function excelSerialDate(value: string) {
  const serial = Number(value)
  if (!Number.isFinite(serial) || serial < 1) return ''
  const date = new Date(1899, 11, 30)
  date.setDate(date.getDate() + Math.floor(serial))
  return formatDisplayDate(date)
}

function reportDate(value: string) {
  return excelSerialDate(value) || normalizeServiceDate(value)
}

function reportedHours(row: Record<string, string>): ReportedHours {
  return {
    bh: parseAmount(get(row, 'IBH_TF_Total_2025')),
    obh: parseAmount(get(row, 'OBH_TF_Total_2025')),
    wh: 0,
  }
}

function locationFields(customer: Customer, locationText: string) {
  const matched = getLocationCardForText(customer, locationText)
  if (matched) return { city: matched.city, country: matched.country }
  const city = locationText.split(/\s+/).filter(Boolean)[0] || ''
  return { city, country: '' }
}

function rowToJob(customer: Customer, row: Record<string, string>, index: number): JobInput {
  const locationText = get(row, 'Job Location')
  const ref = get(row, 'Related Ticket')
  const notes = get(row, 'Notes_2023')
  return {
    id: makeId(index, row),
    sourceRow: index + 2,
    date: reportDate(get(row, 'Date')),
    ticket: ref,
    customerRef: ref,
    ...locationFields(customer, locationText),
    endCustomer: get(row, 'Client'),
    technician: get(row, 'Name'),
    summary: locationText || get(row, 'Client'),
    reportStatus: 'Reported',
    completionNotes: notes,
    travelStart: '',
    onSite: '',
    offSite: '',
    travelFinish: '',
    reportedHours: reportedHours(row),
    consumablesAmount: 0,
    consumablesDescription: '',
    raw: row,
  }
}

export function importB612Rows(customer: Customer, rows: Record<string, string>[], headers: string[], sheetName?: string): ImportResult {
  const warnings: string[] = []
  const jobs = ensureUniqueJobIds(rows.map((row, index) => rowToJob(customer, row, index)).filter((job) => job.ticket))
  if (!jobs.length) warnings.push('No B-612 job rows were found in the customer report first sheet.')
  return { jobs, headers, sheetName, warnings }
}
