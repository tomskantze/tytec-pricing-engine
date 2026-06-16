import { Button, Card, Input, Space, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import { formatOptionalAmount } from '../../domain/money'
import { priceJob } from '../../domain/pricing'
import type { Customer, JobInput, JobReviewOverride } from '../../domain/types'
import { CustomerSummary } from '../customers/CustomerSummary'
import { ReviewDetailPanel } from '../review-queue/ReviewDetailPanel'
import { PricingExplanationPanel } from '../shared/PricingExplanationPanel'
import { CreateJobList } from './CreateJobList'
import { parseCreateJobDraft } from './createJobParser'

const { TextArea } = Input

function field(label: string, value: string) {
  return (
    <div className="info-field">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function noteBlock(label: string, value: string) {
  return (
    <section className="create-job-note-block">
      <h3 className="section-title">{label}</h3>
      <div className="create-job-note-copy">{value || '-'}</div>
    </section>
  )
}

export function CreateJobModule({
  customer,
  fortnoxArticles,
  jobs,
  reviewOverrides,
  onCreateJob,
  onDeleteJob,
  onSaveReviewOverride,
}: {
  customer: Customer
  fortnoxArticles: FortnoxArticleMap
  jobs: JobInput[]
  reviewOverrides: Record<string, JobReviewOverride>
  onCreateJob: (job: JobInput) => void
  onDeleteJob: (jobId: string) => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
}) {
  const [summary, setSummary] = useState('')
  const [sow, setSow] = useState('')
  const [workReport, setWorkReport] = useState('')
  const [tytecTicket, setTytecTicket] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const draft = useMemo(
    () => parseCreateJobDraft(customer, { summary, sow, workReport, tytecTicket, sourceRow: jobs.length + 2 }),
    [customer, jobs.length, sow, summary, tytecTicket, workReport],
  )
  const pricedDraft = useMemo(
    () => (draft.job ? priceJob(customer, draft.job, undefined, fortnoxArticles) : null),
    [customer, draft.job, fortnoxArticles],
  )
  const pricedJobs = useMemo(
    () => jobs.map((job) => priceJob(customer, job, reviewOverrides[job.id], fortnoxArticles)),
    [customer, fortnoxArticles, jobs, reviewOverrides],
  )
  const selectedJob = useMemo(
    () => pricedJobs.find((job) => job.id === selectedJobId) ?? pricedJobs[0] ?? null,
    [pricedJobs, selectedJobId],
  )

  useEffect(() => {
    if (selectedJob?.id && selectedJob.id !== selectedJobId) setSelectedJobId(selectedJob.id)
    if (!selectedJob && selectedJobId) setSelectedJobId('')
  }, [selectedJob, selectedJobId])

  function resetForm() {
    setSummary('')
    setSow('')
    setWorkReport('')
    setTytecTicket('')
  }

  function createJob() {
    if (!draft.job || !tytecTicket.trim()) return
    onCreateJob(draft.job)
    resetForm()
  }

  const blockedJobs = pricedJobs.filter((job) => job.queueState === 'Blocked').length
  const readyJobs = pricedJobs.filter((job) => job.queueState === 'Ready').length

  return (
    <>
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary
          customer={customer}
          items={[
            { label: 'Legal ID', value: customer.customerLegalId || '-' },
            { label: 'Customer Key', value: customer.customerKey || '-' },
            { label: 'Created Jobs', value: jobs.length },
            { label: 'Need Review', value: blockedJobs },
            { label: 'Ready Jobs', value: readyJobs },
          ]}
        />
        <div className="toolbar-row">
          <div>
            <Typography.Text strong>Create Job</Typography.Text>
            <Typography.Text className="page-description">Paste Jira summary, Jira SOW, and the customer work report.</Typography.Text>
          </div>
          <Space size={8}>
            <Button disabled={!draft.job || !tytecTicket.trim()} onClick={createJob} type="primary">Save Job</Button>
            <Button onClick={resetForm}>Clear</Button>
          </Space>
        </div>
        <div className="create-job-entry-grid">
          <label className="create-job-entry-field">
            <span>Tytec Ticket</span>
            <Input onChange={(event) => setTytecTicket(event.target.value)} placeholder="Manual Tytec ticket" value={tytecTicket} />
          </label>
          <label className="create-job-entry-field create-job-entry-field-span-3">
            <span>Jira Summary</span>
            <Input onChange={(event) => setSummary(event.target.value)} placeholder="13 MAY 2026: CPH: T97148: GTT:" value={summary} />
          </label>
          <label className="create-job-entry-field create-job-entry-field-span-2">
            <span>Scope / SOW</span>
            <TextArea onChange={(event) => setSow(event.target.value)} placeholder="Paste Jira SOW" rows={9} value={sow} />
          </label>
          <label className="create-job-entry-field create-job-entry-field-span-2">
            <span>Customer Work Report</span>
            <TextArea onChange={(event) => setWorkReport(event.target.value)} placeholder="Paste customer work report" rows={9} value={workReport} />
          </label>
        </div>
        {pricedDraft ? (
          <div className="create-job-preview-grid">
            <section>
              <h3 className="section-title">Parsed Fields</h3>
              <div className="review-info-grid">
                {field('Customer Ticket', pricedDraft.ticket)}
                {field('Tytec Ticket', pricedDraft.jiraIssueKey || '-')}
                {field('Location', pricedDraft.city)}
                {field('Engineer', pricedDraft.technician)}
                {field('Invoice Entity', pricedDraft.businessEntity || '-')}
                {field('Public Holiday', pricedDraft.publicHoliday ? 'True' : 'False')}
                {field('Travel Start', pricedDraft.travelStart)}
                {field('On Site', pricedDraft.onSite)}
                {field('Off Site', pricedDraft.offSite)}
                {field('Travel Finish', pricedDraft.travelFinish)}
                {field('Consumables', formatOptionalAmount(pricedDraft.currency, pricedDraft.consumablesAmount))}
                {field('Preview Status', pricedDraft.queueState)}
              </div>
            </section>
            {noteBlock('Scope / SOW', pricedDraft.sow || '')}
            {noteBlock('Completion Notes', pricedDraft.completionNotes)}
            <PricingExplanationPanel job={pricedDraft} />
          </div>
        ) : null}
      </Card>

      <div className="review-page-body">
        <Card className="workspace-card review-queue-list" variant="borderless">
          <div className="toolbar-row">
            <span className="toolbar-count">{jobs.length} created jobs</span>
            <Button disabled={!selectedJob} onClick={() => selectedJob && onDeleteJob(selectedJob.id)}>Delete Job</Button>
          </div>
          <CreateJobList jobs={pricedJobs} onSelectJob={setSelectedJobId} selectedJobId={selectedJob?.id || ''} />
        </Card>
        <ReviewDetailPanel customer={customer} job={selectedJob} onSaveOverride={onSaveReviewOverride} />
      </div>
    </>
  )
}
