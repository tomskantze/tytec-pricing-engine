import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import { buildInvoiceBatches } from '../../domain/invoices'
import { priceJobs } from '../../domain/pricing'
import type { Customer, InvoiceSummary } from '../../domain/types'
import type { ImportRun } from '../../state/appState'

const monthIndex = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }

function akamaiInvoiceLabel(month?: number, year?: number) {
  if (month == null || year == null) return 'AKAMAI'
  const monthText = new Date(year, month, 1).toLocaleString('en-US', { month: 'short' }).toUpperCase()
  return `AKAMAI-${monthText}-${year}`
}

function summaryPeriodKey(label: string) {
  const match = String(label || '').toUpperCase().match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/)
  return match ? new Date(Number(match[2]), monthIndex[match[1] as keyof typeof monthIndex], 1).getTime() : Number.NEGATIVE_INFINITY
}

export function compareInvoiceSummaries(left: InvoiceSummary, right: InvoiceSummary) {
  const periodSort = summaryPeriodKey(right.label) - summaryPeriodKey(left.label)
  return periodSort || right.updatedAt.localeCompare(left.updatedAt)
}

export function buildInvoiceSummary(
  customer: Customer,
  invoice: ImportRun,
  fortnoxArticles: FortnoxArticleMap,
): InvoiceSummary {
  const pricedJobs = priceJobs(customer, invoice.jobs, invoice.jobReviewOverrides, fortnoxArticles)
  const batches = buildInvoiceBatches(customer, pricedJobs, true)
  const laborTotal = batches
    .filter((batch) => batch.batchKind === 'jobs')
    .reduce((sum, batch) => sum + (batch.total ?? 0), 0)
  const slaTotal = batches
    .filter((batch) => batch.batchKind === 'sla')
    .reduce((sum, batch) => sum + (batch.total ?? 0), 0)
  const reviewCount = pricedJobs.filter((job) => job.queueState !== 'Ready').length

  return {
    invoiceId: invoice.id,
    label: customer.customerKey === 'AKAM'
      ? akamaiInvoiceLabel(invoice.invoiceMonth, invoice.invoiceYear)
      : invoice.label,
    sourceKind: 'import',
    jobs: pricedJobs.length,
    reviewCount,
    laborTotal,
    slaTotal,
    total: laborTotal + slaTotal,
    currency: batches[0]?.currency || 'EUR',
    status: reviewCount ? 'Blocked' : pricedJobs.length ? 'Ready' : 'Draft',
    updatedAt: invoice.updatedAt,
  }
}
