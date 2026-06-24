import { Button, Card, Input, InputNumber, Segmented, Select, Space, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { FortnoxArticleMap } from '../../domain/fortnoxArticles'
import { getLocationLabel } from '../../domain/matching'
import { formatOptionalAmount } from '../../domain/money'
import { priceJob } from '../../domain/pricing'
import { getRateCardMode } from '../../domain/rateCards'
import type { Customer, JobInput, JobReviewOverride } from '../../domain/types'
import { CustomerSummary } from '../customers/CustomerSummary'
import { ReviewDetailPanel } from '../review-queue/ReviewDetailPanel'
import { PricingExplanationPanel } from '../shared/PricingExplanationPanel'
import { CreateJobList } from './CreateJobList'
import { createManualJobRecordDraft, parseCreateJobDraft } from './createJobParser'

const { TextArea } = Input
type EntryMode = 'manual' | 'report'

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
  const [entryMode, setEntryMode] = useState<EntryMode>(() => (customer.customerKey === 'TELE' || customer.customerKey === 'TELE-US' ? 'report' : 'manual'))
  const [customerTicket, setCustomerTicket] = useState('')
  const [manualServiceDate, setManualServiceDate] = useState('')
  const [manualLocationId, setManualLocationId] = useState(customer.locationCards[0]?.id || '')
  const [manualTechnician, setManualTechnician] = useState('')
  const [manualRegularHours, setManualRegularHours] = useState<number | null>(0)
  const [manualObhHours, setManualObhHours] = useState<number | null>(0)
  const [manualWeekendHours, setManualWeekendHours] = useState<number | null>(0)
  const [manualConsumablesAmount, setManualConsumablesAmount] = useState<number | null>(0)
  const [manualConsumablesDescription, setManualConsumablesDescription] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const selectedManualLocation = customer.locationCards.find((location) => location.id === manualLocationId) ?? customer.locationCards[0] ?? null
  const manualCategoryMode = selectedManualLocation ? getRateCardMode(selectedManualLocation) === 'category' : false
  const draft = useMemo(
    () => entryMode === 'report'
      ? parseCreateJobDraft(customer, { summary, sow, workReport, tytecTicket, sourceRow: jobs.length + 2 })
      : createManualJobRecordDraft(customer, {
        completionNotes: workReport,
        consumablesAmount: manualConsumablesAmount || 0,
        consumablesDescription: manualConsumablesDescription,
        customerTicket,
        locationId: manualLocationId,
        obhHours: manualObhHours || 0,
        regularHours: manualRegularHours || 0,
        serviceDate: manualServiceDate,
        sourceRow: jobs.length + 2,
        summary,
        technician: manualTechnician,
        tytecTicket,
        weekendHours: manualCategoryMode ? 0 : manualWeekendHours || 0,
      }),
    [customer, customerTicket, entryMode, jobs.length, manualCategoryMode, manualConsumablesAmount, manualConsumablesDescription, manualLocationId, manualObhHours, manualRegularHours, manualServiceDate, manualTechnician, manualWeekendHours, sow, summary, tytecTicket, workReport],
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

  useEffect(() => {
    setEntryMode(customer.customerKey === 'TELE' || customer.customerKey === 'TELE-US' ? 'report' : 'manual')
    setManualLocationId(customer.locationCards[0]?.id || '')
  }, [customer])

  function resetForm() {
    setSummary('')
    setSow('')
    setWorkReport('')
    setTytecTicket('')
    setCustomerTicket('')
    setManualServiceDate('')
    setManualTechnician('')
    setManualRegularHours(0)
    setManualObhHours(0)
    setManualWeekendHours(0)
    setManualConsumablesAmount(0)
    setManualConsumablesDescription('')
  }

  function createJob() {
    if (!draft.job) return
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
            { label: 'Job Records', value: jobs.length },
            { label: 'Need Review', value: blockedJobs },
            { label: 'Ready Records', value: readyJobs },
          ]}
        />
        <div className="toolbar-row">
          <div>
            <Typography.Text strong>Job Records</Typography.Text>
            <Typography.Text className="page-description">Create a billable record from a structured work report or technician notes.</Typography.Text>
          </div>
          <Space size={8}>
            <Button disabled={!draft.job} onClick={createJob} type="primary">Save Record</Button>
            <Button onClick={resetForm}>Clear</Button>
          </Space>
        </div>
        <label className="create-job-entry-field create-job-mode">
          <span>Entry Type</span>
          <Segmented
            onChange={(value) => setEntryMode(value as EntryMode)}
            options={[{ value: 'manual', label: 'Manual Record' }, { value: 'report', label: 'Work Report' }]}
            value={entryMode}
          />
        </label>
        <div className="create-job-entry-grid">
          {entryMode === 'report' ? (
            <>
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
            </>
          ) : (
            <>
              <label className="create-job-entry-field">
                <span>Customer Ref</span>
                <Input onChange={(event) => setCustomerTicket(event.target.value)} placeholder="Customer ticket or reference" value={customerTicket} />
              </label>
              <label className="create-job-entry-field">
                <span>Tytec Ticket</span>
                <Input onChange={(event) => setTytecTicket(event.target.value)} placeholder="Optional" value={tytecTicket} />
              </label>
              <label className="create-job-entry-field">
                <span>Service Date</span>
                <Input onChange={(event) => setManualServiceDate(event.target.value)} type="date" value={manualServiceDate} />
              </label>
              <label className="create-job-entry-field">
                <span>Rate Card Location</span>
                <Select onChange={setManualLocationId} options={customer.locationCards.map((location) => ({ value: location.id, label: getLocationLabel(location) }))} value={manualLocationId || undefined} />
              </label>
              <label className="create-job-entry-field">
                <span>Technician</span>
                <Input onChange={(event) => setManualTechnician(event.target.value)} placeholder="Technician name" value={manualTechnician} />
              </label>
              <label className="create-job-entry-field">
                <span>{manualCategoryMode ? 'REG Hours' : '08:00-18:00 Hours'}</span>
                <InputNumber min={0} onChange={setManualRegularHours} precision={2} value={manualRegularHours} />
              </label>
              <label className="create-job-entry-field">
                <span>{manualCategoryMode ? 'OBH1 Hours' : '18:00-08:00 Hours'}</span>
                <InputNumber min={0} onChange={setManualObhHours} precision={2} value={manualObhHours} />
              </label>
              {!manualCategoryMode ? (
                <label className="create-job-entry-field">
                  <span>Weekend Hours</span>
                  <InputNumber min={0} onChange={setManualWeekendHours} precision={2} value={manualWeekendHours} />
                </label>
              ) : null}
              <label className="create-job-entry-field create-job-entry-field-span-2">
                <span>Work Summary</span>
                <Input onChange={(event) => setSummary(event.target.value)} placeholder="Short description of completed work" value={summary} />
              </label>
              <label className="create-job-entry-field">
                <span>Consumables</span>
                <InputNumber min={0} onChange={setManualConsumablesAmount} precision={2} value={manualConsumablesAmount} />
              </label>
              <label className="create-job-entry-field">
                <span>Consumables Notes</span>
                <Input onChange={(event) => setManualConsumablesDescription(event.target.value)} placeholder="Parts, cables, small materials" value={manualConsumablesDescription} />
              </label>
              <label className="create-job-entry-field create-job-entry-field-span-4">
                <span>Technician Notes</span>
                <TextArea onChange={(event) => setWorkReport(event.target.value)} placeholder="Paste technician notes, timestamps, completion details, access delays, or other billing context." rows={7} value={workReport} />
              </label>
            </>
          )}
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
            <span className="toolbar-count">{jobs.length} job records</span>
            <Button disabled={!selectedJob} onClick={() => selectedJob && onDeleteJob(selectedJob.id)}>Delete Record</Button>
          </div>
          <CreateJobList jobs={pricedJobs} onSelectJob={setSelectedJobId} selectedJobId={selectedJob?.id || ''} />
        </Card>
        <ReviewDetailPanel customer={customer} job={selectedJob} onSaveOverride={onSaveReviewOverride} />
      </div>
    </>
  )
}
