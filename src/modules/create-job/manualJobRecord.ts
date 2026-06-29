import { getShiftLabelForDate, normalizeServiceDate, normalizeTimestamp, parseWorkTimestamp } from '../../domain/dates'
import { getLocationLabel } from '../../domain/matching'
import { roundMoney } from '../../domain/money'
import { getRateCardMode } from '../../domain/rateCards'
import type { Customer, JobInput, ShiftBucket } from '../../domain/types'
import { snapQuarterHour } from './timeSteps'

export const manualOtherLocationId = '__other__'

type DraftResult = {
  job: JobInput | null
  warnings: string[]
}

export type ManualJobRecordInput = {
  completionNotes: string
  consumablesAmount: number
  consumablesDescription: string
  customerTicket: string
  locationId: string
  manualCurrency: string
  manualHourlyRate: number
  manualLaborTotal: number
  manualOtherLocation: string
  offSiteTime: string
  onSiteTime: string
  publicHoliday: boolean
  serviceDate: string
  sourceRow: number
  summary: string
  technician: string
  travelFinishTime: string
  travelStartTime: string
  tytecTicket: string
}

function formatLocalIsoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function stampSequence(serviceDate: string, times: string[]) {
  if (!serviceDate) return times.map(() => '')
  const stamped: string[] = []
  let dayOffset = 0
  let previous = ''
  times.forEach((time) => {
    const normalizedTime = snapQuarterHour(time)
    if (!normalizedTime) {
      stamped.push('')
      return
    }
    if (previous && normalizedTime < previous) dayOffset += 1
    const date = new Date(`${serviceDate}T00:00:00`)
    date.setDate(date.getDate() + dayOffset)
    stamped.push(normalizeTimestamp(`${formatLocalIsoDate(date)} ${normalizedTime}`))
    previous = normalizedTime
  })
  return stamped
}

function roundedBuckets(buckets: ShiftBucket): ShiftBucket {
  return {
    bh: Number(buckets.bh.toFixed(2)),
    night: Number(buckets.night.toFixed(2)),
    weekend: Number(buckets.weekend.toFixed(2)),
  }
}

function positiveAmount(value: number) {
  return Math.max(0, Number(value) || 0)
}

function totalHours(buckets: ShiftBucket) {
  return Number((buckets.bh + buckets.night + buckets.weekend).toFixed(2))
}

function splitTimestamps(onSite: string, offSite: string, publicHoliday: boolean): ShiftBucket {
  const start = parseWorkTimestamp(onSite)
  const parsedEnd = parseWorkTimestamp(offSite)
  if (!start || !parsedEnd) return { bh: 0, night: 0, weekend: 0 }
  const end = new Date(parsedEnd.getTime())
  if (end < start) end.setDate(end.getDate() + 1)
  const buckets = { bh: 0, night: 0, weekend: 0 }
  let current = new Date(start.getTime())
  while (current < end) {
    const next = new Date(Math.min(current.getTime() + 15 * 60 * 1000, end.getTime()))
    const hours = (next.getTime() - current.getTime()) / 3600000
    const label = publicHoliday ? 'Weekend / Holiday' : getShiftLabelForDate(current)
    if (label === '08:00-18:00') buckets.bh += hours
    else if (label === '18:00-08:00') buckets.night += hours
    else buckets.weekend += hours
    current = next
  }
  return roundedBuckets(buckets)
}

function makeManualId(input: ManualJobRecordInput) {
  const basis = input.customerTicket || input.tytecTicket || `manual-${input.sourceRow}`
  return `${basis}-${input.sourceRow}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `manual-${input.sourceRow}`
}

export function createManualJobRecordDraft(customer: Customer, input: ManualJobRecordInput): DraftResult {
  const warnings: string[] = []
  const otherLocation = input.locationId === manualOtherLocationId
  const location = otherLocation ? null : customer.locationCards.find((card) => card.id === input.locationId) ?? null
  const ticket = input.customerTicket.trim() || input.tytecTicket.trim()
  const serviceDate = input.serviceDate.trim()
  const [travelStart, onSite, offSite, travelFinish] = stampSequence(serviceDate, [
    input.travelStartTime,
    input.onSiteTime,
    input.offSiteTime,
    input.travelFinishTime,
  ])
  if (!ticket) warnings.push('Customer reference or Tytec ticket is required.')
  if (!serviceDate) warnings.push('Service date is required.')
  if (!location && !otherLocation) warnings.push('Rate card location is required.')
  if (otherLocation && !input.manualOtherLocation.trim()) warnings.push('Manual location is required.')
  if (!onSite || !offSite) warnings.push('On-site and off-site timestamps are required.')
  if (!input.technician.trim()) warnings.push('Technician is recommended for technician-specific pricing.')
  if (!ticket || !serviceDate || (!location && !otherLocation) || (otherLocation && !input.manualOtherLocation.trim()) || !onSite || !offSite) return { job: null, warnings }

  const buckets = splitTimestamps(onSite, offSite, input.publicHoliday)
  const hours = totalHours(buckets)
  const hourlyRate = positiveAmount(input.manualHourlyRate)
  const laborTotal = positiveAmount(input.manualLaborTotal) || roundMoney(hours * hourlyRate)
  if (otherLocation && laborTotal <= 0) warnings.push('Hourly rate or labor total is required for Other location.')
  if (otherLocation && laborTotal <= 0) return { job: null, warnings }

  const categoryMode = location ? getRateCardMode(location) === 'category' : false
  const categoryHours = categoryMode ? { REG: buckets.bh, OBH1: Number((buckets.night + buckets.weekend).toFixed(2)) } : undefined
  const city = location?.city || input.manualOtherLocation.trim()
  const country = location?.country || ''
  const currency = input.manualCurrency.trim() || customer.locationCards[0]?.currency || 'EUR'
  const manualPricing: Record<string, string> = otherLocation ? {
    manualCurrency: currency,
    manualHourlyRate: hourlyRate ? hourlyRate.toFixed(2) : '',
    manualLaborTotal: laborTotal.toFixed(2),
    manualPricingMode: positiveAmount(input.manualLaborTotal) > 0 ? 'fixed-total' : 'hourly-rate',
    manualTotalHours: hours.toFixed(2),
  } : {}

  return {
    warnings,
    job: {
      id: makeManualId(input),
      sourceRow: input.sourceRow,
      customerKey: customer.customerKey,
      businessEntity: customer.name,
      serviceDate,
      date: normalizeServiceDate(serviceDate),
      ticket,
      jiraIssueKey: input.tytecTicket.trim() || undefined,
      customerRef: input.customerTicket.trim() || ticket,
      city,
      country,
      endCustomer: '',
      technician: input.technician.trim(),
      summary: input.summary.trim() || `${city} job record`,
      sow: input.summary.trim(),
      reportStatus: 'Reported',
      completionNotes: input.completionNotes.trim(),
      travelStart,
      onSite,
      offSite,
      travelFinish,
      publicHoliday: input.publicHoliday,
      reportedHours: categoryHours ? { bh: categoryHours.REG, obh: categoryHours.OBH1, wh: 0 } : otherLocation ? { bh: buckets.bh, obh: buckets.night, wh: buckets.weekend } : undefined,
      reportedHoursByLabel: categoryHours,
      consumablesAmount: Math.max(0, Number(input.consumablesAmount) || 0),
      consumablesDescription: input.consumablesDescription.trim(),
      raw: {
        derivedBHHours: buckets.bh.toFixed(2),
        derivedNightHours: buckets.night.toFixed(2),
        derivedWeekendHours: buckets.weekend.toFixed(2),
        jobRecordSource: 'manual',
        location: location ? getLocationLabel(location) : city,
        locationId: location?.id || manualOtherLocationId,
        ...manualPricing,
        notes: input.completionNotes.trim(),
        summary: input.summary.trim(),
        tytecTicket: input.tytecTicket.trim(),
      },
    },
  }
}
