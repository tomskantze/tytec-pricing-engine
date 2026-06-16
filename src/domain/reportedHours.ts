import { getFortnoxArticleNumber } from './fortnoxArticles'
import type { FortnoxArticleMap } from './fortnoxArticles'
import { roundMoney } from './money'
import { getRateCardMode } from './rateCards'
import { getTechnicianProfile, getTechnicianRate, getTechnicianTierAssignment } from './technicians'
import type { CategoryRateLabel, Customer, JobInput, JobReviewOverride, LocationCard, PricingBreakdown, ShiftBucket, ShiftLabel } from './types'

function roundHours(value: number) {
  return Number((Math.max(0, value) || 0).toFixed(2))
}

function categoryHours(job: JobInput, override?: JobReviewOverride) {
  const direct = job.reportedHoursByLabel
  const reg = roundHours(direct?.REG ?? job.reportedHours?.bh ?? 0)
  const obh1 = roundHours(direct?.OBH1 ?? job.reportedHours?.obh ?? 0)
  if (override?.manualRateLabel) {
    const total = roundHours(reg + obh1 || Number(job.raw.vendorInvoiceHours || 0))
    return override.manualRateLabel === 'OBH1'
      ? { reg: 0, obh1: total }
      : { reg: total, obh1: 0 }
  }
  return { reg, obh1 }
}

export function getReportedHourBuckets(job: JobInput): ShiftBucket | null {
  if (!job.reportedHours) return null
  return {
    bh: roundHours(job.reportedHours.bh),
    night: roundHours(job.reportedHours.obh),
    weekend: roundHours(job.reportedHours.wh),
  }
}

function shiftRate(card: LocationCard, shift: ShiftLabel) {
  return card.shifts.find((row) => row.shift === shift)
}

function amount(rate: number, hours: number) {
  return roundMoney(roundHours(hours) * rate)
}

function lineItem(
  card: LocationCard,
  shift: ShiftLabel,
  hours: number,
  unitPrice: number,
  total: number,
  fortnoxArticles?: FortnoxArticleMap,
  description?: string,
) {
  if (!hours) return null
  return {
    articleNumber: getFortnoxArticleNumber(card.id, shift, 'additionalHour', fortnoxArticles),
    description: description || (shift === '08:00-18:00' ? 'BH Hours'
      : shift === '18:00-08:00' ? 'OBH/Night Hours'
      : shift === 'Weekend / Holiday' ? 'Weekend / Holiday Hours'
      : `${shift} Hours`),
    quantity: hours,
    unitPrice,
    total,
    currency: card.currency,
  }
}

function isLineItem<T>(value: T | null): value is T {
  return value != null
}

function categoryRate(
  customer: Customer,
  card: LocationCard,
  job: JobInput,
  shift: CategoryRateLabel,
  override?: JobReviewOverride,
) {
  const technician = getTechnicianProfile(customer, job.technician)
  const assignment = technician ? getTechnicianTierAssignment(customer, technician.id, card.id) : undefined
  if (shift === 'OBH1' && assignment && !assignment.obh1Enabled) return null
  const effectiveRateType = shift === 'OBH1'
    ? String(override?.manualRateType || job.raw.rateType || '')
    : String(job.raw.rateType || '')
  const technicianRate = getTechnicianRate(customer, card, job.technician, shift, effectiveRateType)
  if (technicianRate) return technicianRate.rate
  const locationRate = shiftRate(card, shift)
  return locationRate && locationRate.additionalHours > 0 ? locationRate.additionalHours : null
}

export function getReportedHoursPricing(
  customer: Customer,
  card: LocationCard,
  job: JobInput,
  fortnoxArticles?: FortnoxArticleMap,
  override?: JobReviewOverride,
): PricingBreakdown | null {
  if (getRateCardMode(card) === 'category') {
    const hours = categoryHours(job, override)
    const regRate = hours.reg ? categoryRate(customer, card, job, 'REG', override) : 0
    const obh1Rate = hours.obh1 ? categoryRate(customer, card, job, 'OBH1', override) : 0
    if ((hours.reg && regRate == null) || (hours.obh1 && obh1Rate == null) || (!hours.reg && !hours.obh1)) return null
    const bhAmount = regRate ? amount(regRate, hours.reg) : 0
    const obhAmount = obh1Rate ? amount(obh1Rate, hours.obh1) : 0
    const rateTypeSuffix = String(override?.manualRateType || job.raw.rateType || '').trim()
    const lineItems = [
      lineItem(card, 'REG', hours.reg, regRate || 0, bhAmount, fortnoxArticles, rateTypeSuffix ? `REG ${rateTypeSuffix} Hours` : 'REG Hours'),
      lineItem(card, 'OBH1', hours.obh1, obh1Rate || 0, obhAmount, fortnoxArticles, rateTypeSuffix ? `OBH1 ${rateTypeSuffix} Hours` : 'OBH1 Hours'),
    ].filter(isLineItem)
    return {
      currency: card.currency,
      crossedShift: hours.reg > 0 && hours.obh1 > 0,
      method: 'split-shift',
      callOutFee: 0,
      hours: { bh: hours.reg, obh: hours.obh1, wh: 0 },
      splitHours: { bh: hours.reg, night: hours.obh1, weekend: 0 },
      bhAmount,
      obhAmount,
      whAmount: 0,
      totalAmount: roundMoney(bhAmount + obhAmount),
      lineItems,
    }
  }

  const buckets = getReportedHourBuckets(job)
  if (!buckets) return null
  const bhRate = shiftRate(card, '08:00-18:00')
  const nightRate = shiftRate(card, '18:00-08:00')
  const weekendRate = shiftRate(card, 'Weekend / Holiday')
  if ((buckets.bh && !bhRate) || (buckets.night && !nightRate) || (buckets.weekend && !weekendRate)) return null

  const bhAmount = bhRate ? amount(bhRate.additionalHours, buckets.bh) : 0
  const obhAmount = nightRate ? amount(nightRate.additionalHours, buckets.night) : 0
  const whAmount = weekendRate ? amount(weekendRate.additionalHours, buckets.weekend) : 0
  const lineItems = [
    lineItem(card, '08:00-18:00', buckets.bh, bhRate?.additionalHours || 0, bhAmount, fortnoxArticles),
    lineItem(card, '18:00-08:00', buckets.night, nightRate?.additionalHours || 0, obhAmount, fortnoxArticles),
    lineItem(card, 'Weekend / Holiday', buckets.weekend, weekendRate?.additionalHours || 0, whAmount, fortnoxArticles),
  ].filter(isLineItem)

  return {
    currency: card.currency,
    crossedShift: [buckets.bh, buckets.night, buckets.weekend].filter((value) => value > 0).length > 1,
    method: 'split-shift',
    callOutFee: 0,
    hours: { bh: buckets.bh, obh: buckets.night, wh: buckets.weekend },
    splitHours: buckets,
    bhAmount,
    obhAmount,
    whAmount,
    totalAmount: roundMoney(bhAmount + obhAmount + whAmount),
    lineItems,
  }
}
