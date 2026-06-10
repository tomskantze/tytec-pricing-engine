import { getFortnoxArticleNumber } from './fortnoxArticles'
import type { FortnoxArticleMap } from './fortnoxArticles'
import { roundMoney } from './money'
import type { JobInput, LocationCard, PricingBreakdown, ShiftBucket, ShiftLabel } from './types'

function roundHours(value: number) {
  return Number((Math.max(0, value) || 0).toFixed(2))
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

function lineItem(card: LocationCard, shift: ShiftLabel, hours: number, total: number, fortnoxArticles?: FortnoxArticleMap) {
  const rate = shiftRate(card, shift)
  if (!rate || !hours) return null
  return {
    articleNumber: getFortnoxArticleNumber(card.id, shift, 'additionalHour', fortnoxArticles),
    description: shift === '08:00-18:00' ? 'BH Hours' : shift === '18:00-08:00' ? 'OBH/Night Hours' : 'Weekend / Holiday Hours',
    quantity: hours,
    unitPrice: rate.additionalHours,
    total,
    currency: card.currency,
  }
}

function isLineItem<T>(value: T | null): value is T {
  return value != null
}

export function getReportedHoursPricing(card: LocationCard, job: JobInput, fortnoxArticles?: FortnoxArticleMap): PricingBreakdown | null {
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
    lineItem(card, '08:00-18:00', buckets.bh, bhAmount, fortnoxArticles),
    lineItem(card, '18:00-08:00', buckets.night, obhAmount, fortnoxArticles),
    lineItem(card, 'Weekend / Holiday', buckets.weekend, whAmount, fortnoxArticles),
  ].filter(isLineItem)

  return {
    currency: card.currency,
    crossedShift: [buckets.bh, buckets.night, buckets.weekend].filter((value) => value > 0).length > 1,
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
