import { normalizeServiceDate } from '../domain/dates'
import { ensureUniqueJobIds } from '../domain/jobIds'
import { getLocationCardForText, normalizeLocationText } from '../domain/matching'
import { parseAmount } from '../domain/money'
import { getRateCardMode } from '../domain/rateCards'
import type { Customer, ImportResult, JobInput, LocationCard, ReportedHours } from '../domain/types'

function get(row: Record<string, string>, key: string) {
  return String(row[key] ?? '').trim()
}

function makeId(index: number, row: Record<string, string>) {
  const basis = get(row, 'externalKey')
    || [get(row, 'invoiceNumber'), get(row, 'serviceDate'), get(row, 'technician'), get(row, 'rateBucket'), get(row, 'timePeriod')].filter(Boolean).join('-')
    || `row-${index + 2}`
  return basis.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `row-${index + 2}`
}

function reportedHours(row: Record<string, string>): ReportedHours {
  const bucket = get(row, 'rateBucket').toUpperCase()
  const hours = parseAmount(get(row, 'hours'))
  if (bucket === 'REG' || bucket === 'OBH1') {
    return {
      bh: bucket === 'REG' ? hours : 0,
      obh: bucket === 'OBH1' ? hours : 0,
      wh: 0,
    }
  }
  return {
    bh: parseAmount(get(row, 'regHours')),
    obh: parseAmount(get(row, 'obh1Hours')),
    wh: 0,
  }
}

function osloFallbackLocation(customer: Customer, site: string): LocationCard | undefined {
  const normalized = normalizeLocationText(site)
  const akamaiSharedOsloSite = !normalized || normalized === 'bulk' || normalized === 'stack' || normalized === 'bulkstack'
  if (!akamaiSharedOsloSite) return undefined
  return customer.locationCards.find((card) => {
    if (getRateCardMode(card) !== 'category') return false
    const city = normalizeLocationText(card.city)
    const code = normalizeLocationText(card.cityCode)
    return city.includes('oslo') || code === 'osl'
  })
}

function locationFields(customer: Customer, site: string) {
  const matched = getLocationCardForText(customer, site) || osloFallbackLocation(customer, site)
  if (matched) return { city: matched.city, country: matched.country }
  return { city: site, country: '' }
}

function rowToJob(customer: Customer, row: Record<string, string>, index: number): JobInput {
  const site = get(row, 'site')
  const hours = reportedHours(row)
  const note = get(row, 'note')
  const bucket = get(row, 'rateBucket').toUpperCase()
  const reportedHoursByLabel = bucket === 'REG' || bucket === 'OBH1'
    ? { [bucket]: parseAmount(get(row, 'hours')) }
    : { REG: hours.bh, OBH1: hours.obh }
  const rateType = get(row, 'rateType')
  const invoiceNumber = get(row, 'invoiceNumber')
  return {
    id: makeId(index, row),
    sourceRow: index + 2,
    customerKey: customer.customerKey,
    date: normalizeServiceDate(get(row, 'serviceDate')),
    ticket: '',
    customerRef: '',
    ...locationFields(customer, site),
    endCustomer: customer.name,
    technician: get(row, 'technician'),
    summary: [invoiceNumber, site, rateType].filter(Boolean).join(' · ') || site || get(row, 'technician') || customer.name,
    reportStatus: 'Reported',
    completionNotes: note,
    travelStart: '',
    onSite: '',
    offSite: '',
    travelFinish: '',
    reportedHours: hours,
    reportedHoursByLabel,
    consumablesAmount: 0,
    consumablesDescription: '',
    raw: row,
  }
}

export function importAkamaiRows(
  customer: Customer,
  rows: Record<string, string>[],
  headers: string[],
  sheetName?: string,
): ImportResult {
  const warnings: string[] = []
  const jobs = ensureUniqueJobIds(
    rows.map((row, index) => rowToJob(customer, row, index))
      .filter((job) => job.technician && (job.reportedHours?.bh || job.reportedHours?.obh)),
  )
  if (!jobs.length) warnings.push('No Akamai billing rows were found in the customer report.')
  return { jobs, headers, sheetName, warnings }
}
