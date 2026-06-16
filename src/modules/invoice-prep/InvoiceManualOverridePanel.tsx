import { Button, Input, InputNumber, Select, Space } from 'antd'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { displayOriginalLocation } from '../../domain/displayLocation'
import { getLocationLabel } from '../../domain/matching'
import { formatAmount, formatJobTotal, formatOptionalAmount } from '../../domain/money'
import { priceJob } from '../../domain/pricing'
import { formatPricingHoursSummary, getPricingDisplay, pricingHoursSummaryLabel } from '../../domain/pricingDisplay'
import type { CategoryRateLabel, CategoryRateType, Customer, JobReviewOverride, PricedJob } from '../../domain/types'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'
import { PricingExplanationPanel } from '../shared/PricingExplanationPanel'

const { TextArea } = Input

function numberValue(value: number | string | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function field(label: string, value: ReactNode, wrap = false) {
  return (
    <div className="info-field">
      <span>{label}</span>
      <strong className={wrap ? 'info-field-value-wrap' : undefined}>{value || '-'}</strong>
    </div>
  )
}

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

function inferredRateLabel(job: PricedJob): CategoryRateLabel | undefined {
  const regHours = Number(job.pricing?.hours.bh || job.reportedHoursByLabel?.REG || job.reportedHours?.bh || 0)
  const obh1Hours = Number(job.pricing?.hours.obh || job.reportedHoursByLabel?.OBH1 || job.reportedHours?.obh || 0)
  if (regHours > 0 && obh1Hours <= 0) return 'REG'
  if (obh1Hours > 0 && regHours <= 0) return 'OBH1'
  const rawBucket = String(job.raw.rateBucket || '').trim().toUpperCase()
  if (rawBucket === 'REG' || rawBucket === 'OBH1') return rawBucket
  return undefined
}

function locationMismatch(job: PricedJob) {
  if (!job.matchedLocation) return false
  return job.matchedLocation.city.trim().toLowerCase() !== job.city.trim().toLowerCase()
    || job.matchedLocation.country.trim().toLowerCase() !== job.country.trim().toLowerCase()
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
  const [manualRateLabel, setManualRateLabel] = useState<CategoryRateLabel | undefined>()
  const [manualRateType, setManualRateType] = useState<CategoryRateType | undefined>()
  const [note, setNote] = useState('')

  useEffect(() => {
    setLocationId(job?.reviewOverride?.treatAsLocationId)
    setLabor(job?.reviewOverride?.manualLaborAmount ?? null)
    setTravel(job?.reviewOverride?.manualTravelAmount ?? null)
    setConsumables(job?.reviewOverride?.manualConsumablesAmount ?? null)
    setFinalAmount(job?.reviewOverride?.manualFinalAmount ?? null)
    setManualRateLabel(job?.reviewOverride?.manualRateLabel)
    setManualRateType(job?.reviewOverride?.manualRateType)
    setNote(job?.reviewOverride?.note ?? '')
  }, [job])

  const effectiveRateLabel = manualRateLabel ?? (job ? inferredRateLabel(job) : undefined)

  const previewJob = useMemo(() => {
    if (!job) return null
    return priceJob(customer, job, {
      ...job.reviewOverride,
      approved: true,
      treatAsLocationId: locationId,
      manualRateLabel,
      manualRateType: effectiveRateLabel === 'OBH1' ? manualRateType : undefined,
      manualLaborAmount: labor ?? undefined,
      manualTravelAmount: travel ?? undefined,
      manualConsumablesAmount: consumables ?? undefined,
      manualFinalAmount: finalAmount ?? undefined,
      note: note.trim() || undefined,
    })
  }, [consumables, customer, effectiveRateLabel, finalAmount, job, labor, locationId, manualRateLabel, manualRateType, note, travel])

  if (!job || !previewJob) return null
  const activeJob = job
  const categoryMode = getPricingDisplay(activeJob).mode === 'category'
  const isAkamai = customer.customerKey === 'AKAM'
  const hasReviewReason = activeJob.queueState === 'Blocked' || activeJob.manualReasons.length > 0 || Boolean(activeJob.reviewOverride?.note)
  const showLocationContext = Boolean(activeJob.reviewOverride?.treatAsLocationId) || locationMismatch(activeJob)

  function approve() {
    onSaveOverride(activeJob.id, {
      approved: true,
      forceReview: activeJob.reviewOverride?.forceReview,
      treatAsLocationId: isAkamai ? undefined : locationId,
      manualRateLabel,
      manualRateType: effectiveRateLabel === 'OBH1' ? manualRateType : undefined,
      manualLaborAmount: isAkamai ? undefined : labor ?? undefined,
      manualTravelAmount: travel ?? undefined,
      manualConsumablesAmount: consumables ?? undefined,
      manualFinalAmount: isAkamai ? undefined : finalAmount ?? undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <section className="invoice-manual-panel">
      <div className="invoice-manual-head">
        <div>
          <h3 className="section-title">Manual Override</h3>
          {!categoryMode ? <p className="page-description">{activeJob.ticket} · {activeJob.jiraIssueKey || 'No Jira ticket'} · {activeJob.jiraSummary || activeJob.summary}</p> : null}
        </div>
        <StatusBadge label={activeJob.queueState} tone={statusTone(activeJob.queueState)} />
      </div>
      <div className="review-info-grid">
        {hasReviewReason ? field('Review Reason', activeJob.manualReasons.join('; ') || activeJob.reviewOverride?.note || 'Manual review available') : null}
        {showLocationContext && activeJob.matchedLocation ? field('Matched Location', getLocationLabel(activeJob.matchedLocation)) : null}
        {showLocationContext ? field('Original Location', displayOriginalLocation(activeJob)) : null}
        {!isAkamai ? field('Service Date', activeJob.date) : null}
        {field('Invoice Period', String(activeJob.raw.vendorInvoicePeriod || '').trim() || '-')}
        {!categoryMode ? field('Consumables', activeJob.consumablesDescription, true) : null}
        {!categoryMode ? field('Travel Start', activeJob.travelStart) : null}
        {!categoryMode ? field('On Site', activeJob.onSite) : null}
        {!categoryMode ? field('Off Site', activeJob.offSite) : null}
        {!categoryMode ? field('Travel Finish', activeJob.travelFinish) : null}
      </div>
      <div className="review-form-grid">
        {!isAkamai ? (
          <Select
            allowClear
            onChange={setLocationId}
            options={customer.locationCards.map((location) => ({ value: location.id, label: getLocationLabel(location) }))}
            placeholder="Treat as location"
            value={locationId}
          />
        ) : null}
        {categoryMode ? (
          <Select
            allowClear
            onChange={(value) => {
              setManualRateLabel(value)
              if (value !== 'OBH1') setManualRateType(undefined)
            }}
            options={[
              { value: 'REG', label: 'Treat as REG' },
              { value: 'OBH1', label: 'Treat as OBH1' },
            ]}
            placeholder="Rate label"
            value={manualRateLabel}
          />
        ) : null}
        {categoryMode ? (
          <Select
            allowClear
            disabled={effectiveRateLabel !== 'OBH1'}
            onChange={setManualRateType}
            options={[
              { value: 'Day', label: 'OBH1 Day' },
              { value: 'Night', label: 'OBH1 Night' },
            ]}
            placeholder="OBH1 rate type"
            value={manualRateType}
          />
        ) : null}
        {!isAkamai ? <InputNumber min={0} onChange={(value) => setLabor(numberValue(value))} placeholder="Override labor" precision={2} value={labor} /> : null}
        {!categoryMode ? <InputNumber min={0} onChange={(value) => setTravel(numberValue(value))} placeholder="Override travel" precision={2} value={travel} /> : null}
        {!categoryMode ? <InputNumber min={0} onChange={(value) => setConsumables(numberValue(value))} placeholder="Override consumables" precision={2} value={consumables} /> : null}
        {!isAkamai ? <InputNumber min={0} onChange={(value) => setFinalAmount(numberValue(value))} placeholder="Final amount" precision={2} value={finalAmount} /> : null}
        <TextArea onChange={(event) => setNote(event.target.value)} placeholder="Review note" rows={3} value={note} />
      </div>
      <div className="review-live-pricing">
        {!isAkamai ? field('Preview Status', previewJob.totalAmount == null ? 'Pending' : previewJob.queueState) : null}
        {field('Pricing Region', previewJob.matchedLocation ? getLocationLabel(previewJob.matchedLocation) : '-')}
        {categoryMode && effectiveRateLabel === 'OBH1' ? field('Rate Type', manualRateType || String(activeJob.raw.rateType || '').trim() || '-') : null}
        {field('Labor', previewJob.laborAmount == null ? 'Pending' : formatAmount(previewJob.currency, previewJob.laborAmount))}
        {!categoryMode ? field('Travel', formatOptionalAmount(previewJob.currency, previewJob.travelAmount)) : null}
        {!categoryMode ? field('Consumables', formatOptionalAmount(previewJob.currency, previewJob.consumablesAmount)) : null}
        {!isAkamai ? field('Fortnox Articles', previewJob.pricing?.lineItems?.map((line) => line.articleNumber).filter(Boolean).join(', ') || '-') : null}
        {!isAkamai ? field(pricingHoursSummaryLabel(previewJob), formatPricingHoursSummary(previewJob)) : null}
        {!isAkamai ? field('Preview Total', formatJobTotal(previewJob.currency, previewJob.totalAmount)) : null}
      </div>
      {!isAkamai ? <PricingExplanationPanel job={previewJob} /> : null}
      <Space className="review-panel-actions">
        <Button onClick={approve} type="primary">Approve Override</Button>
        <Button onClick={() => onSaveOverride(activeJob.id, null)}>Clear Override</Button>
      </Space>
    </section>
  )
}
