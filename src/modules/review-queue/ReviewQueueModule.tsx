import { Card } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { Customer, JobReviewOverride, PricedJob } from '../../domain/types'
import { formatAmount } from '../../domain/money'
import { PageHeader } from '../../design-system/PageHeader'
import { CustomerIndexTable } from '../customers/CustomerIndexTable'
import { CustomerSummary } from '../customers/CustomerSummary'
import { ReviewDetailPanel } from './ReviewDetailPanel'
import { isPendingReviewJob, ReviewJobList } from './ReviewJobList'

export function ReviewQueueModule({
  customer,
  customers,
  pricedJobs,
  onSelectCustomer,
  onSaveReviewOverride,
}: {
  customer: Customer | null
  customers: Customer[]
  pricedJobs: PricedJob[]
  onSelectCustomer: (customerKey: string) => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
}) {
  const [selectedJobId, setSelectedJobId] = useState('')
  const reviewJobs = useMemo(() => pricedJobs.filter(isPendingReviewJob), [pricedJobs])
  const selectedJob = useMemo(
    () => reviewJobs.find((job) => job.id === selectedJobId) ?? reviewJobs[0] ?? null,
    [reviewJobs, selectedJobId],
  )

  useEffect(() => {
    if (selectedJob?.id && selectedJob.id !== selectedJobId) setSelectedJobId(selectedJob.id)
    if (!selectedJob && selectedJobId) setSelectedJobId('')
  }, [selectedJob, selectedJobId])

  if (!customer) {
    return (
      <>
        <PageHeader title="Review Queue" />
        <CustomerIndexTable
          customers={customers}
          emptyText="No customers are available for review."
          onOpenCustomer={onSelectCustomer}
        />
      </>
    )
  }

  const overrideJobs = pricedJobs.filter((job) => job.reviewOverride?.approved)
  const blockedJobs = pricedJobs.filter((job) => job.queueState === 'Blocked')
  const readyJobs = pricedJobs.filter((job) => job.queueState === 'Ready')
  const readyTotal = readyJobs.reduce((sum, job) => sum + (job.totalAmount || 0), 0)
  const metrics = [
    { label: 'Review Rows', value: reviewJobs.length },
    { label: 'Blocked', value: blockedJobs.length },
    { label: 'Overrides', value: overrideJobs.length },
    { label: 'Ready Jobs', value: readyJobs.length },
    { label: 'Ready Revenue', value: formatAmount('EUR', readyTotal) },
  ]

  return (
    <>
      <PageHeader title="Review Queue" description={customer.name} />
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary customer={customer} />
        <div className="metric-strip invoice-metric-strip">
          {metrics.map((metric) => (
            <div className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </Card>
      <div className="review-page-body">
        <Card className="workspace-card review-queue-list" variant="borderless">
          <ReviewJobList jobs={pricedJobs} selectedJobId={selectedJob?.id || ''} onSelectJob={setSelectedJobId} />
        </Card>
        <ReviewDetailPanel customer={customer} job={selectedJob} onSaveOverride={onSaveReviewOverride} />
      </div>
    </>
  )
}
