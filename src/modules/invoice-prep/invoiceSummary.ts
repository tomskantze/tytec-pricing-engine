import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import { buildInvoiceBatches } from '../../domain/invoices'
import { priceJobs } from '../../domain/pricing'
import type { Customer, InvoiceSummary } from '../../domain/types'
import type { ImportRun } from '../../state/appState'

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
    label: invoice.label,
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
