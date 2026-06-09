import { Button, Input, InputNumber, Select, Space } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { formatFortnoxArticleNumbers } from '../../domain/fortnoxArticles'
import { getLocationLabel } from '../../domain/matching'
import { formatAmount, formatHours, formatJobTotal, formatOptionalAmount } from '../../domain/money'
import type { Customer, JobReviewOverride, PricedJob } from '../../domain/types'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'

const { TextArea } = Input

function numberValue(value: number | string | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function field(label: string, value: string) {
  return (
    <div className="info-field">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

export function InvoiceManualOverridePanel({
  customer,
  job,
  onSaveOverride,
}: {
  customer: Customer
  job: PricedJob | null
  onSaveOverride: (jobId: string, override: JobReviewOverride | null) => void
}) {
  const [locationId, setLocationId] = useState<string | undefined>()
  const [labor, setLabor] = useState<number | null>(null)
  const [travel, setTravel] = useState<number | null>(null)
  const [consumables, setConsumables] = useState<number | null>(null)
  const [finalAmount, setFinalAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    setLocationId(job?.reviewOverride?.treatAsLocationId)
    setLabor(job?.reviewOverride?.manualLaborAmount ?? null)
    setTravel(job?.reviewOverride?.manualTravelAmount ?? null)
    setConsumables(job?.reviewOverride?.manualConsumablesAmount ?? null)
    setFinalAmount(job?.reviewOverride?.manualFinalAmount ?? null)
    setNote(job?.reviewOverride?.note ?? '')
  }, [job])

  const preview = useMemo(() => {
    if (!job) return null
    const matchedLocation = locationId ? customer.locationCards.find((location) => location.id === locationId) : job.matchedLocation
    const currency = matchedLocation?.currency || job.currency || 'EUR'
    const previewLabor = labor ?? job.pricing?.totalAmount ?? job.laborAmount
    const previewTravel = travel ?? job.travelAmount
    const previewConsumables = consumables ?? job.consumablesAmount
    const previewTotal = finalAmount ?? (previewLabor == null ? null : previewLabor + previewTravel + previewConsumables)
    return { currency, matchedLocation, previewConsumables, previewLabor, previewTotal, previewTravel }
  }, [customer.locationCards, consumables, finalAmount, job, labor, locationId, travel])

  if (!job || !preview) return null
  const activeJob = job

  function approve() {
    onSaveOverride(activeJob.id, {
      approved: true,
      forceReview: activeJob.reviewOverride?.forceReview,
      treatAsLocationId: locationId,
      manualLaborAmount: labor ?? undefined,
      manualTravelAmount: travel ?? undefined,
      manualConsumablesAmount: consumables ?? undefined,
      manualFinalAmount: finalAmount ?? undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <section className="invoice-manual-panel">
      <div className="invoice-manual-head">
        <div>
          <h3 className="section-title">Manual Override</h3>
          <p className="page-description">{activeJob.ticket} · {activeJob.jiraIssueKey || 'No Jira ticket'} · {activeJob.jiraSummary || activeJob.summary}</p>
        </div>
        <StatusBadge label={activeJob.queueState} tone={statusTone(activeJob.queueState)} />
      </div>
      <div className="review-info-grid">
        {field('Review Reason', activeJob.manualReasons.join('; ') || activeJob.reviewOverride?.note || 'Manual review available')}
        {field('Matched Location', activeJob.matchedLocation ? getLocationLabel(activeJob.matchedLocation) : '-')}
        {field('Original Location', [activeJob.city, activeJob.country].filter(Boolean).join(', '))}
        {field('Current Total', formatJobTotal(activeJob.currency, activeJob.totalAmount))}
      </div>
      <div className="review-form-grid">
        <Select
          allowClear
          onChange={setLocationId}
          options={customer.locationCards.map((location) => ({ value: location.id, label: getLocationLabel(location) }))}
          placeholder="Treat as location"
          value={locationId}
        />
        <InputNumber min={0} onChange={(value) => setLabor(numberValue(value))} placeholder="Override labor" precision={2} value={labor} />
        <InputNumber min={0} onChange={(value) => setTravel(numberValue(value))} placeholder="Override travel" precision={2} value={travel} />
        <InputNumber min={0} onChange={(value) => setConsumables(numberValue(value))} placeholder="Override consumables" precision={2} value={consumables} />
        <InputNumber min={0} onChange={(value) => setFinalAmount(numberValue(value))} placeholder="Final amount" precision={2} value={finalAmount} />
        <TextArea onChange={(event) => setNote(event.target.value)} placeholder="Review note" rows={3} value={note} />
      </div>
      <div className="review-live-pricing">
        {field('Preview Status', preview.previewTotal == null ? 'Pending' : 'Priceable')}
        {field('Pricing Region', preview.matchedLocation ? getLocationLabel(preview.matchedLocation) : '-')}
        {field('Labor', preview.previewLabor == null ? 'Pending' : formatAmount(preview.currency, preview.previewLabor))}
        {field('Travel', formatOptionalAmount(preview.currency, preview.previewTravel))}
        {field('Consumables', formatOptionalAmount(preview.currency, preview.previewConsumables))}
        {field('Fortnox Articles', formatFortnoxArticleNumbers(activeJob.pricing?.lineItems))}
        {field('BH / OBH / WH', `${formatHours(activeJob.pricing?.hours.bh || 0)} / ${formatHours(activeJob.pricing?.hours.obh || 0)} / ${formatHours(activeJob.pricing?.hours.wh || 0)}`)}
        {field('Preview Total', formatJobTotal(preview.currency, preview.previewTotal))}
      </div>
      <Space className="review-panel-actions">
        <Button onClick={approve} type="primary">Approve Override</Button>
        <Button onClick={() => onSaveOverride(activeJob.id, null)}>Clear Override</Button>
      </Space>
    </section>
  )
}
