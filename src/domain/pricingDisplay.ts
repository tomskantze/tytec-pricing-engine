import { formatHours } from './money'
import { getRateCardMode } from './rateCards'
import type { LocationCard, PricedJob, RateCardMode } from './types'

type PricingDisplayMode = 'time-window' | 'category'

type BucketDisplay = {
  mode: PricingDisplayMode
  hourLabels: [string, string, string?]
  amountLabels: [string, string, string?]
}

type PricingDisplaySource =
  | Pick<PricedJob, 'matchedLocation'>
  | Pick<LocationCard, 'rateCardMode'>
  | LocationCard
  | null

function locationFromValue(value?: PricingDisplaySource): Pick<LocationCard, 'rateCardMode'> | null {
  if (!value) return null
  if ('matchedLocation' in value) {
    return value.matchedLocation ? { rateCardMode: value.matchedLocation.rateCardMode } : null
  }
  const location = value as LocationCard | Pick<LocationCard, 'rateCardMode'>
  return { rateCardMode: location.rateCardMode }
}

export function getPricingDisplay(value?: PricingDisplaySource): BucketDisplay {
  if (
    value
    && 'reportedHoursByLabel' in value
    && value.reportedHoursByLabel
  ) {
    const labels = value.reportedHoursByLabel as Partial<Record<'REG' | 'OBH1', number>>
    if (labels.REG != null || labels.OBH1 != null) {
      return {
        mode: 'category',
        hourLabels: ['REG', 'OBH1'],
        amountLabels: ['REG Amount', 'OBH1 Amount'],
      }
    }
  }
  const location = locationFromValue(value)
  if (getRateCardMode(location) === 'category') {
    return {
      mode: 'category',
      hourLabels: ['REG', 'OBH1'],
      amountLabels: ['REG Amount', 'OBH1 Amount'],
    }
  }
  return {
    mode: 'time-window',
    hourLabels: ['BH', 'OBH', 'WH'],
    amountLabels: ['BH Amount', 'OBH Amount', 'WH Amount'],
  }
}

export function getPricingDisplayForMode(rateCardMode: RateCardMode): BucketDisplay {
  return getPricingDisplay({ rateCardMode })
}

export function formatPricingHoursSummary(job: PricedJob): string {
  const display = getPricingDisplay(job)
  const hours = job.pricing?.hours
  const values = [
    formatHours(hours?.bh || 0),
    formatHours(hours?.obh || 0),
    formatHours(hours?.wh || 0),
  ]
  if (display.mode === 'category') return `${values[0]} / ${values[1]}`
  return `${values[0]} / ${values[1]} / ${values[2]}`
}

export function pricingHoursSummaryLabel(job: PricedJob): string {
  const display = getPricingDisplay(job)
  return display.mode === 'category' ? 'REG / OBH1' : 'BH / OBH / WH'
}
