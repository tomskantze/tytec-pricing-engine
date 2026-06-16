import { formatFortnoxArticleUsage } from './fortnoxArticles'
import { formatAmount, formatJobTotal } from './money'
import type { LineItem, PricedJob, ShiftLabel } from './types'

export type PricingExplanationLine = {
  text: string
  emphasized?: boolean
}

function shiftLabel(shift: ShiftLabel | undefined) {
  return shift || '-'
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

function itemLine(item: LineItem) {
  if (item.description === 'Call-Out Fee') return `Call-out ${formatAmount(item.currency, item.total)}`
  return `${item.description} ${formatQuantity(item.quantity)} h x ${formatAmount(item.currency, item.unitPrice)} = ${formatAmount(item.currency, item.total)}`
}

export function getPricingExplanationLines(job: PricedJob, includeArticles = true): PricingExplanationLine[] {
  const breakdown = job.pricing
  if (!breakdown) return (job.manualReasons.length ? job.manualReasons : ['No automatic pricing available']).map((text) => ({ text }))
  const lines: PricingExplanationLine[] = []
  if (breakdown.callOutShift) {
    const included = breakdown.includedHours == null ? '' : ` with ${breakdown.includedHours.toFixed(2)} h included`
    lines.push({ text: `Call-out shift: ${shiftLabel(breakdown.callOutShift)}${included}` })
  }
  breakdown.lineItems.forEach((item) => lines.push({ text: itemLine(item) }))
  lines.push({ text: `Labor result: ${formatAmount(job.currency, breakdown.totalAmount)}` })
  if (job.consumablesAmount > 0) lines.push({ text: `Consumables: ${formatAmount(job.currency, job.consumablesAmount)}` })
  lines.push({ text: `Invoice total: ${formatJobTotal(job.currency, job.totalAmount)}` })
  const articleUsage = includeArticles ? formatFortnoxArticleUsage(breakdown.lineItems, '') : ''
  if (articleUsage) lines.push({ text: `Articles: ${articleUsage}`, emphasized: true })
  return lines
}
