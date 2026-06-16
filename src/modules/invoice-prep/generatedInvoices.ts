import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import { formatInvoicePeriod } from '../../domain/dates'
import { buildInvoiceBatches } from '../../domain/invoices'
import { priceJobs } from '../../domain/pricing'
import type { Customer, InvoiceBatch, InvoiceSummary, JobInput, JobReviewOverride, PricedJob } from '../../domain/types'

export type GeneratedInvoiceEntry = {
  summary: InvoiceSummary
  batches: InvoiceBatch[]
  jobs: PricedJob[]
}

function updatedAt(jobs: PricedJob[]) {
  const stamp = [...jobs]
    .map((job) => job.raw.savedAt || job.serviceDate || job.onSite || job.date)
    .filter(Boolean)
    .sort()
    .at(-1)
  return stamp?.includes('T') ? stamp : stamp ? new Date(stamp).toISOString() : new Date().toISOString()
}

export function buildGeneratedInvoiceEntries(
  customer: Customer,
  jobs: JobInput[],
  overrides: Record<string, JobReviewOverride>,
  fortnoxArticles: FortnoxArticleMap,
): GeneratedInvoiceEntry[] {
  const pricedJobs = priceJobs(customer, jobs, overrides, fortnoxArticles)
  const groups = pricedJobs.reduce<Record<string, PricedJob[]>>((accumulator, job) => {
    const period = formatInvoicePeriod(job.date)
    ;(accumulator[period] ||= []).push(job)
    return accumulator
  }, {})

  return Object.entries(groups).map(([period, periodJobs]) => {
    const batches = buildInvoiceBatches(customer, periodJobs, true)
    const laborTotal = batches.filter((batch) => batch.batchKind === 'jobs').reduce((sum, batch) => sum + (batch.total ?? 0), 0)
    const slaTotal = batches.filter((batch) => batch.batchKind === 'sla').reduce((sum, batch) => sum + (batch.total ?? 0), 0)
    const reviewCount = periodJobs.filter((job) => job.queueState !== 'Ready').length
    return {
      summary: {
        invoiceId: `generated-${customer.customerKey}-${period.replace(/[^A-Z0-9]+/gi, '-')}`,
        label: period,
        sourceKind: 'generated',
        jobs: periodJobs.length,
        reviewCount,
        laborTotal,
        slaTotal,
        total: laborTotal + slaTotal,
        currency: batches[0]?.currency || 'EUR',
        status: reviewCount ? 'Blocked' : periodJobs.length ? 'Ready' : 'Draft',
        updatedAt: updatedAt(periodJobs),
      },
      batches,
      jobs: periodJobs,
    }
  })
}
