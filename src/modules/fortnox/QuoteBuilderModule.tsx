import { Alert, Button, Input, InputNumber, Popconfirm, Segmented, Select, Steps, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { getLocationLabel } from '../../domain/matching'
import { formatAmount, roundMoney } from '../../domain/money'
import { getRateCardMode, showsFullShift } from '../../domain/rateCards'
import type { Customer, LocationCard, RateCardMode, ShiftLabel } from '../../domain/types'
import { downloadText } from '../../shared/download'
import { loadQuoteDraftSession, saveQuoteDraftSession } from '../../state/quoteState'
import { buildCustomerQuoteHtml } from './quoteDocument'
import {
  createQuoteDraftDefaults,
  createQuoteExtraItem,
  createQuoteWorkPackage,
  createTravelGroup,
  defaultQuoteAssumptions,
  type QuoteBillingModel,
  type QuoteDeliveryMode,
  type QuoteDraft,
  type QuoteExtraItem,
  type QuoteRateSource,
  type QuoteResponsibility,
  type QuoteTechCostSource,
  type QuoteTravelGroup,
  type QuoteTravelMode,
  type QuoteWorkPackage,
  type SavedQuote,
} from './quoteTypes'

const { TextArea } = Input

type DesktopQuoteApi = {
  printHtml?: (payload: { html: string }) => Promise<boolean>
  saveAsDocument?: (payload: { storedPath: string; fileName: string }) => Promise<string>
  savePdfAsFromHtml?: (payload: { fileName: string; html: string }) => Promise<string>
  savePdfFromHtml?: (payload: { id: string; fileName: string; html: string }) => Promise<{ previewUrl: string; storedPath: string }>
}

type RatePreset = {
  id: string
  label: string
  shift: ShiftLabel
  kind: 'hourly' | 'full-day'
  rate: number
  callOutFee: number
  includedHours: number
}
type SummaryLine = { label: string; amount: number }

const responsibilityOptions: Array<{ value: QuoteResponsibility; label: string }> = [
  { value: 'tbd', label: 'TBD' },
  { value: 'customer', label: 'Customer' },
  { value: 'tytec', label: 'Tytec' },
]

const workPackageTypeOptions = [
  'Move / logistics',
  'De-install',
  'Re-rack / install',
  'Hardware procurement',
  'SSD installation',
  'Survey',
  'Other',
].map((value) => ({ value, label: value }))

function numberValue(value: number | string | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function shiftTitle(value: ShiftLabel) {
  return value === 'Weekend / Holiday' ? 'Weekend/Holiday' : value
}

function buildRatePresets(location?: LocationCard | null): RatePreset[] {
  if (!location) return []
  const mode: RateCardMode = getRateCardMode(location)
  const hourly = location.shifts
    .filter((shift) => shift.additionalHours > 0)
    .map((shift) => ({
      id: `${location.id}:${shift.shift}:hourly`,
      label: mode === 'category' ? `${shiftTitle(shift.shift)} hourly` : `${shiftTitle(shift.shift)} per hour`,
      shift: shift.shift,
      kind: 'hourly' as const,
      rate: shift.additionalHours,
      callOutFee: shift.callOutFee,
      includedHours: shift.includedHours,
    }))
  const fullDay = location.shifts
    .filter((shift) => showsFullShift(shift.shift) && shift.fullShiftRate > 0)
    .map((shift) => ({
      id: `${location.id}:${shift.shift}:full-day`,
      label: shift.shift === '08:00-18:00' ? 'Full day' : 'Full night',
      shift: shift.shift,
      kind: 'full-day' as const,
      rate: shift.fullShiftRate,
      callOutFee: shift.callOutFee,
      includedHours: shift.includedHours,
    }))
  return [...hourly, ...fullDay]
}

function resolveSavedTechnicianRate(customer: Customer, location: LocationCard | null, technicianId: string) {
  if (!location || !technicianId) return null
  const direct = (customer.technicianRates || []).find((rate) => (
    rate.technicianId === technicianId
    && rate.locationId === location.id
    && rate.shift === 'REG'
    && rate.rateType === 'Day'
  ))
  if (direct) return direct.rate
  const assignment = (customer.technicianTierAssignments || []).find((item) => (
    item.technicianId === technicianId && item.locationId === location.id
  ))
  if (!assignment) return null
  const tierRate = (location.tierRates || []).find((item) => (
    item.tier === assignment.tier && item.shift === 'REG' && item.rateType === 'Day'
  ))
  return tierRate?.rate ?? null
}

function travelDirectSubtotal(group: QuoteTravelGroup) {
  if (group.mode === 'mileage') return roundMoney((group.mileageKm || 0) * (group.mileageRate || 0))
  if (group.mode === 'air' || group.mode === 'rail' || group.mode === 'ferry') {
    return roundMoney((group.ticketCost || 0) + (group.baggageCost || 0) + (group.transferCost || 0))
  }
  if (group.mode === 'rental-car') {
    return roundMoney((group.rentalDays || 0) * (group.rentalDayRate || 0) + (group.fuelTolls || 0))
  }
  return roundMoney(group.taxiCost || 0)
}

function travelTimeSubtotal(group: QuoteTravelGroup, baseRate: number) {
  if (!group.billTravelTime) return 0
  return roundMoney((group.travelers || 0) * (group.travelHours || 0) * baseRate * (group.travelRateMultiplier || 0))
}

function hotelSubtotal(group: QuoteTravelGroup) {
  if (!group.hotelRequired) return 0
  return roundMoney((group.hotelNights || 0) * (group.hotelNightRate || 0) * (group.hotelRooms || 0))
}

function perDiemSubtotal(group: QuoteTravelGroup) {
  if (!group.perDiemEnabled) return 0
  return roundMoney((group.perDiemDays || 0) * (group.perDiemRate || 0) * (group.travelers || 0))
}

function extraItemSubtotal(item: QuoteExtraItem) {
  return roundMoney((item.quantity || 0) * (item.unitCost || 0))
}

function line(label: string, amount: number): SummaryLine | null {
  return amount ? { label, amount: roundMoney(amount) } : null
}

function detailText(label: string, value: string) {
  return value ? `${label}: ${value}` : ''
}

function responsibilityLabel(value: QuoteResponsibility) {
  if (value === 'customer') return 'Customer'
  if (value === 'tytec') return 'Tytec'
  return 'TBD'
}

function hasWorkPackageContent(item: QuoteWorkPackage) {
  return Boolean(
    item.label.trim()
    || item.packageType.trim()
    || item.pickupLocation.trim()
    || item.deliveryLocation.trim()
    || item.schedule.trim()
    || item.serviceWindow.trim()
    || item.accessNotes.trim()
    || item.customerNote.trim(),
  )
}

function BooleanChoice({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="fortnox-quote-fit-control fortnox-quote-bool">
      <span>{label}</span>
      <Segmented
        onChange={(next) => onChange(next === 'Yes')}
        options={['No', 'Yes']}
        value={value ? 'Yes' : 'No'}
      />
    </label>
  )
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopQuoteApi }).desktopWindow
}

function safeDocumentName(value: string) {
  return value.replace(/[^\w.-]+/g, '-')
}

function quoteRefBase(customerKey: string, date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${(customerKey || 'QUOTE').toUpperCase()}-Q${yy}${mm}${dd}`
}

function nextQuoteRefForCustomer(customerKey: string, quotes: SavedQuote[], quoteId = '') {
  const base = quoteRefBase(customerKey)
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([0-9]{2,})$`, 'i')
  const maxIndex = quotes
    .filter((quote) => quote.id !== quoteId)
    .reduce((highest, quote) => {
      const match = quote.quoteRef.trim().match(pattern)
      if (!match) return highest
      const next = Number.parseInt(match[1], 10)
      return Number.isFinite(next) ? Math.max(highest, next) : highest
    }, 0)
  return `${base}-${String(maxIndex + 1).padStart(2, '0')}`
}

function uniqueQuoteRef(baseRef: string, quoteId: string, quotes: SavedQuote[]) {
  const normalized = baseRef.trim()
  if (!normalized) return normalized
  const conflicts = new Set(
    quotes
      .filter((quote) => quote.id !== quoteId)
      .map((quote) => quote.quoteRef.trim().toUpperCase()),
  )
  if (!conflicts.has(normalized.toUpperCase())) return normalized
  const match = normalized.match(/^(.*)-(\d{2,})$/)
  if (match) {
    const prefix = match[1]
    let index = Number.parseInt(match[2], 10)
    if (!Number.isFinite(index) || index < 1) index = 1
    let candidate = normalized
    while (conflicts.has(candidate.toUpperCase())) {
      index += 1
      candidate = `${prefix}-${String(index).padStart(match[2].length, '0')}`
    }
    return candidate
  }
  let index = 2
  let candidate = `${normalized}-${index}`
  while (conflicts.has(candidate.toUpperCase())) {
    index += 1
    candidate = `${normalized}-${index}`
  }
  return candidate
}

export function QuoteBuilderModule({
  customer,
  draftPrefill,
  onBackToLaunch,
  onDeleteQuote,
  onQuoteLoaded,
  onSaveQuote,
  requestedQuoteId,
  savedQuotes,
  startMode = 'draft',
}: {
  customer: Customer | null
  draftPrefill?: Partial<QuoteDraft>
  onBackToLaunch?: () => void
  onDeleteQuote: (quoteId: string) => void
  onQuoteLoaded?: (quoteId: string) => void
  onSaveQuote: (quote: SavedQuote) => void
  requestedQuoteId?: string
  savedQuotes: SavedQuote[]
  startMode?: 'draft' | 'new'
}) {
  const activeCustomer = customer ?? null
  const customerQuotes = useMemo(
    () => savedQuotes
      .filter((quote) => !activeCustomer || quote.customerKey === activeCustomer.customerKey),
    [activeCustomer, savedQuotes],
  )
  const customerDefaults = useMemo(
    () => createQuoteDraftDefaults({
      currency: activeCustomer?.locationCards[0]?.currency || 'EUR',
      rateCardLocationId: activeCustomer?.locationCards[0]?.id || '',
      customerKey: activeCustomer?.customerKey || '',
      quoteRef: nextQuoteRefForCustomer(activeCustomer?.customerKey || '', customerQuotes),
    }),
    [activeCustomer?.customerKey, customerQuotes],
  )
  const [step, setStep] = useState(0)
  const [activeQuoteId, setActiveQuoteId] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const [quoteRef, setQuoteRef] = useState(customerDefaults.quoteRef)
  const [quoteName, setQuoteName] = useState('')
  const [sourceRequestId, setSourceRequestId] = useState('')
  const [customerContactName, setCustomerContactName] = useState('')
  const [customerContactEmail, setCustomerContactEmail] = useState('')
  const [workLocation, setWorkLocation] = useState('')
  const [currency, setCurrency] = useState(customerDefaults.currency)
  const [deliveryMode, setDeliveryMode] = useState<QuoteDeliveryMode>('Onsite')
  const [serviceType, setServiceType] = useState('Break-fix')
  const [quoteValidityDays, setQuoteValidityDays] = useState<number | null>(30)
  const [billToEntity, setBillToEntity] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [poRequirement, setPoRequirement] = useState('')
  const [technicianCount, setTechnicianCount] = useState<number | null>(1)
  const [workDays, setWorkDays] = useState<number | null>(1)
  const [hoursPerDay, setHoursPerDay] = useState<number | null>(4)
  const [obhHours, setObhHours] = useState<number | null>(0)
  const [obhMultiplier, setObhMultiplier] = useState<number | null>(1.5)
  const [weekendHours, setWeekendHours] = useState<number | null>(0)
  const [weekendMultiplier, setWeekendMultiplier] = useState<number | null>(2)
  const [billingModel, setBillingModel] = useState<QuoteBillingModel>('hourly')
  const [rateSource, setRateSource] = useState<QuoteRateSource>('preset')
  const [rateCardLocationId, setRateCardLocationId] = useState(customerDefaults.rateCardLocationId)
  const [presetRateId, setPresetRateId] = useState('')
  const [manualRate, setManualRate] = useState<number | null>(null)
  const [manualCallOutFee, setManualCallOutFee] = useState<number | null>(null)
  const [manualObhCallOutFee, setManualObhCallOutFee] = useState<number | null>(null)
  const [manualWeekendCallOutFee, setManualWeekendCallOutFee] = useState<number | null>(null)
  const [manualIncludedHours, setManualIncludedHours] = useState<number | null>(null)
  const [manualObhIncludedHours, setManualObhIncludedHours] = useState<number | null>(null)
  const [manualWeekendIncludedHours, setManualWeekendIncludedHours] = useState<number | null>(null)
  const [laborCustomerNote, setLaborCustomerNote] = useState('')
  const [fixedFee, setFixedFee] = useState<number | null>(null)
  const [techCostSource, setTechCostSource] = useState<QuoteTechCostSource>('manual')
  const [technicianCostId, setTechnicianCostId] = useState('')
  const [manualTechPayRate, setManualTechPayRate] = useState<number | null>(null)
  const [travelRequired, setTravelRequired] = useState(true)
  const [travelGroups, setTravelGroups] = useState<QuoteTravelGroup[]>([createTravelGroup(1)])
  const [travelCustomerNote, setTravelCustomerNote] = useState('')
  const [workPackages, setWorkPackages] = useState<QuoteWorkPackage[]>([])
  const [consumables, setConsumables] = useState<number | null>(0)
  const [consumablesNote, setConsumablesNote] = useState('')
  const [equipmentLabel, setEquipmentLabel] = useState('')
  const [equipmentDays, setEquipmentDays] = useState<number | null>(0)
  const [equipmentRate, setEquipmentRate] = useState<number | null>(0)
  const [equipmentNote, setEquipmentNote] = useState('')
  const [extraItems, setExtraItems] = useState<QuoteExtraItem[]>([])
  const [extrasCustomerNote, setExtrasCustomerNote] = useState('')
  const [markupPercent, setMarkupPercent] = useState<number | null>(0)
  const [discountPercent, setDiscountPercent] = useState<number | null>(0)
  const [contingencyPercent, setContingencyPercent] = useState<number | null>(0)
  const [summaryText, setSummaryText] = useState('')
  const [assumptions, setAssumptions] = useState('')

  const selectedRateCardLocation = useMemo(
    () => activeCustomer?.locationCards.find((location) => location.id === rateCardLocationId) ?? activeCustomer?.locationCards[0] ?? null,
    [activeCustomer, rateCardLocationId],
  )
  const customerLocationOptions = useMemo(
    () => (activeCustomer?.locationCards || []).map((location) => {
      const label = getLocationLabel(location)
      return { value: label, label }
    }),
    [activeCustomer],
  )
  const ratePresets = useMemo(() => buildRatePresets(selectedRateCardLocation), [selectedRateCardLocation])
  const savedTechnicians = activeCustomer?.technicians || []
  const visiblePresets = useMemo(
    () => ratePresets.filter((preset) => (billingModel === 'full-day' ? preset.kind === 'full-day' : preset.kind === 'hourly')),
    [billingModel, ratePresets],
  )
  const selectedPreset = useMemo(
    () => visiblePresets.find((preset) => preset.id === presetRateId) ?? visiblePresets[0] ?? null,
    [presetRateId, visiblePresets],
  )
  const savedTechPayRate = useMemo(
    () => (activeCustomer ? resolveSavedTechnicianRate(activeCustomer, selectedRateCardLocation, technicianCostId) : null),
    [activeCustomer, selectedRateCardLocation, technicianCostId],
  )
  const activeSavedQuote = useMemo(
    () => customerQuotes.find((quote) => quote.id === activeQuoteId) ?? null,
    [activeQuoteId, customerQuotes],
  )

  useEffect(() => {
    if (!activeCustomer) return
    setDraftReady(false)
    setActiveQuoteId('')
    const defaults = {
      currency: activeCustomer.locationCards[0]?.currency || 'EUR',
      rateCardLocationId: activeCustomer.locationCards[0]?.id || '',
      customerKey: activeCustomer.customerKey,
      quoteRef: nextQuoteRefForCustomer(activeCustomer.customerKey, customerQuotes),
    }
    const storedSession = startMode === 'draft' ? loadQuoteDraftSession(activeCustomer.customerKey, defaults) : null
    if (storedSession) applyDraft(storedSession.draft, storedSession.activeQuoteId, storedSession.step)
    else {
      applyDraft({ ...createQuoteDraftDefaults(defaults), ...draftPrefill }, '', 0)
    }
    setDraftReady(true)
  }, [activeCustomer?.customerKey, startMode])

  useEffect(() => {
    if (!requestedQuoteId) return
    const quote = customerQuotes.find((item) => item.id === requestedQuoteId)
    if (!quote) return
    applyDraft(quote.draft, quote.id, 0)
    onQuoteLoaded?.(quote.id)
  }, [customerQuotes, onQuoteLoaded, requestedQuoteId])

  useEffect(() => {
    if (deliveryMode === 'Remote') {
      setTravelRequired(false)
    }
  }, [deliveryMode])

  useEffect(() => {
    if (serviceType !== 'Break-fix' && serviceType !== 'BAU') return
    if (technicianCount !== 1) setTechnicianCount(1)
    if (workDays !== 1) setWorkDays(1)
    if (hoursPerDay !== 0) setHoursPerDay(0)
    if (obhHours !== 0) setObhHours(0)
    if (weekendHours !== 0) setWeekendHours(0)
  }, [serviceType, technicianCount, workDays, hoursPerDay, obhHours, weekendHours])

  useEffect(() => {
    if (!selectedPreset && visiblePresets[0]) setPresetRateId(visiblePresets[0].id)
    if (selectedPreset && !visiblePresets.some((preset) => preset.id === selectedPreset.id)) {
      setPresetRateId(visiblePresets[0]?.id || '')
    }
  }, [selectedPreset, visiblePresets])

  const isSingleTechQuote = serviceType === 'Break-fix' || serviceType === 'BAU'
  const isSupportTariffQuote = isSingleTechQuote && (billingModel === 'hourly' || billingModel === 'callout-hourly')
  const technicians = isSingleTechQuote ? 1 : (technicianCount || 0)
  const days = isSingleTechQuote ? 1 : (workDays || 0)
  const dayHours = hoursPerDay || 0
  const standardLaborHours = isSupportTariffQuote ? 0 : technicians * days * dayHours
  const obhLaborHours = isSupportTariffQuote ? 0 : (obhHours || 0)
  const weekendLaborHours = isSupportTariffQuote ? 0 : (weekendHours || 0)
  const laborHours = standardLaborHours + obhLaborHours + weekendLaborHours
  const resolvedRate = rateSource === 'manual' ? (manualRate || 0) : (selectedPreset?.rate || 0)
  const resolvedCallOut = billingModel === 'callout-hourly'
    ? (manualCallOutFee ?? (rateSource === 'preset' ? (selectedPreset?.callOutFee || 0) : 0))
    : 0
  const resolvedObhCallOut = billingModel === 'callout-hourly'
    ? (manualObhCallOutFee ?? resolvedCallOut)
    : 0
  const resolvedWeekendCallOut = billingModel === 'callout-hourly'
    ? (manualWeekendCallOutFee ?? resolvedCallOut)
    : 0
  const resolvedIncludedHours = billingModel === 'callout-hourly'
    ? (manualIncludedHours ?? (rateSource === 'preset' ? (selectedPreset?.includedHours || 0) : 0))
    : 0
  const resolvedObhIncludedHours = billingModel === 'callout-hourly'
    ? (manualObhIncludedHours || 0)
    : 0
  const resolvedWeekendIncludedHours = billingModel === 'callout-hourly'
    ? (manualWeekendIncludedHours || 0)
    : 0
  const resolvedObhMultiplier = obhMultiplier || 1
  const resolvedWeekendMultiplier = weekendMultiplier || 1
  const obhPreviewRate = roundMoney(resolvedRate * resolvedObhMultiplier)
  const weekendPreviewRate = roundMoney(resolvedRate * resolvedWeekendMultiplier)
  const dayCallOutMultiplier = resolvedRate > 0 && resolvedCallOut > 0 ? roundMoney(resolvedCallOut / resolvedRate) : 3
  const obhCallOutMultiplier = obhPreviewRate > 0 && resolvedObhCallOut > 0 ? roundMoney(resolvedObhCallOut / obhPreviewRate) : 3
  const weekendCallOutMultiplier = weekendPreviewRate > 0 && resolvedWeekendCallOut > 0 ? roundMoney(resolvedWeekendCallOut / weekendPreviewRate) : 3
  const calloutVisits = billingModel === 'callout-hourly' && technicians > 0 ? technicians * Math.max(days, 1) : 0
  const includedStandardHours = billingModel === 'callout-hourly' ? calloutVisits * resolvedIncludedHours : 0
  const includedObhHours = billingModel === 'callout-hourly' ? calloutVisits * resolvedObhIncludedHours : 0
  const includedWeekendHours = billingModel === 'callout-hourly' ? calloutVisits * resolvedWeekendIncludedHours : 0
  const billableStandardHours = billingModel === 'callout-hourly'
    ? Math.max(0, standardLaborHours - includedStandardHours)
    : standardLaborHours
  const billableObhHours = billingModel === 'callout-hourly'
    ? Math.max(0, obhLaborHours - includedObhHours)
    : obhLaborHours
  const billableWeekendHours = billingModel === 'callout-hourly'
    ? Math.max(0, weekendLaborHours - includedWeekendHours)
    : weekendLaborHours
  const standardLaborAmount = roundMoney(billableStandardHours * resolvedRate)
  const obhLaborAmount = roundMoney(billableObhHours * resolvedRate * resolvedObhMultiplier)
  const weekendLaborAmount = roundMoney(billableWeekendHours * resolvedRate * resolvedWeekendMultiplier)
  const calloutMinimumAmount = roundMoney(calloutVisits * resolvedCallOut)
  const billableStandardAmount = roundMoney(billableStandardHours * resolvedRate)
  const hasTechCostBasis = techCostSource === 'saved' ? savedTechPayRate != null : manualTechPayRate != null
  const resolvedTechPayRate = hasTechCostBasis
    ? (techCostSource === 'saved' ? (savedTechPayRate || 0) : (manualTechPayRate || 0))
    : 0

  const laborSubtotal = useMemo(() => {
    if (billingModel === 'fixed-fee') return fixedFee || 0
    if (billingModel === 'full-day') return technicians * days * resolvedRate
    if (isSupportTariffQuote) {
      if (billingModel === 'callout-hourly') return roundMoney(calloutMinimumAmount)
      return 0
    }
    if (billingModel === 'callout-hourly') {
      return roundMoney(calloutMinimumAmount + billableStandardAmount + obhLaborAmount + weekendLaborAmount)
    }
    return roundMoney(standardLaborAmount + obhLaborAmount + weekendLaborAmount)
  }, [
    billableStandardAmount,
    billingModel,
    calloutMinimumAmount,
    days,
    fixedFee,
    isSupportTariffQuote,
    obhLaborAmount,
    resolvedRate,
    technicians,
    weekendLaborAmount,
    standardLaborAmount,
  ])
  const estimatedLaborTechCost = roundMoney(laborHours * resolvedTechPayRate)

  const travelLineItems = useMemo(() => {
    if (!travelRequired) return [] as SummaryLine[]
    return travelGroups.flatMap((group) => {
      const title = group.label.trim() || 'Travel group'
      return [
        line(`${title} · travel time`, travelTimeSubtotal(group, resolvedRate)),
        line(`${title} · travel cost`, travelDirectSubtotal(group)),
        line(`${title} · accommodation`, hotelSubtotal(group)),
        line(`${title} · per diem`, perDiemSubtotal(group)),
      ].filter(Boolean) as SummaryLine[]
    })
  }, [resolvedRate, travelGroups, travelRequired])

  const travelTimeTotal = travelLineItems
    .filter((entry) => entry.label.includes('travel time'))
    .reduce((sum, entry) => sum + entry.amount, 0)
  const travelDirectTotal = travelLineItems
    .filter((entry) => entry.label.includes('travel cost'))
    .reduce((sum, entry) => sum + entry.amount, 0)
  const hotelTotal = travelLineItems
    .filter((entry) => entry.label.includes('accommodation'))
    .reduce((sum, entry) => sum + entry.amount, 0)
  const perDiemTotal = travelLineItems
    .filter((entry) => entry.label.includes('per diem'))
    .reduce((sum, entry) => sum + entry.amount, 0)

  const consumablesSubtotal = roundMoney(consumables || 0)
  const equipmentSubtotal = roundMoney((equipmentDays || 0) * (equipmentRate || 0))
  const extraItemLines = useMemo(() => (
    extraItems.map((item, index) => {
      const amount = extraItemSubtotal(item)
      const quantity = item.quantity || 0
      const unit = item.unit.trim()
      const label = item.label.trim() || `Other cost ${index + 1}`
      const detail = quantity > 0 ? `${quantity}${unit ? ` ${unit}` : ''}` : ''
      return {
        id: item.id,
        label: detail ? `${label} · ${detail}` : label,
        amount,
        note: item.note.trim(),
      }
    }).filter((item) => item.amount > 0 || item.note || item.label.trim())
  ), [extraItems])
  const otherSubtotal = roundMoney(extraItemLines.reduce((sum, item) => sum + item.amount, 0))
  const passThroughSubtotal = roundMoney(travelDirectTotal + hotelTotal + perDiemTotal + consumablesSubtotal + equipmentSubtotal + otherSubtotal)
  const markupAmount = roundMoney(passThroughSubtotal * ((markupPercent || 0) / 100))
  const preDiscountSubtotal = roundMoney(laborSubtotal + travelTimeTotal + passThroughSubtotal + markupAmount)
  const contingencyAmount = roundMoney(preDiscountSubtotal * ((contingencyPercent || 0) / 100))
  const discountAmount = roundMoney((preDiscountSubtotal + contingencyAmount) * ((discountPercent || 0) / 100))
  const grandTotal = roundMoney(preDiscountSubtotal + contingencyAmount - discountAmount)
  const estimatedTravelTimeCost = roundMoney(
    travelRequired
      ? travelGroups.reduce((sum, group) => (
        sum + (group.billTravelTime ? (group.travelers || 0) * (group.travelHours || 0) * resolvedTechPayRate : 0)
      ), 0)
      : 0,
  )
  const estimatedTotalCost = roundMoney(estimatedLaborTechCost + estimatedTravelTimeCost + passThroughSubtotal)
  const laborMargin = roundMoney(laborSubtotal - estimatedLaborTechCost)
  const laborMarginPercent = laborSubtotal > 0 ? roundMoney((laborMargin / laborSubtotal) * 100) : 0
  const totalMargin = roundMoney(grandTotal - estimatedTotalCost)
  const totalMarginPercent = grandTotal > 0 ? roundMoney((totalMargin / grandTotal) * 100) : 0

  const summaryLines = useMemo(() => (
    [
      isSupportTariffQuote
        ? billingModel === 'callout-hourly'
          ? line('Call-out minimum', laborSubtotal)
          : null
        : billingModel === 'fixed-fee'
        ? line('Fixed fee labor', laborSubtotal)
        : billingModel === 'full-day'
          ? line('Full-day labor', laborSubtotal)
          : billingModel === 'callout-hourly'
            ? line('Call-out minimum', calloutMinimumAmount)
            : line('Standard labor', standardLaborAmount),
      !isSupportTariffQuote && billingModel === 'callout-hourly' && billableStandardAmount > 0 ? line('Additional standard labor', billableStandardAmount) : null,
      !isSupportTariffQuote && billingModel !== 'fixed-fee' && billingModel !== 'full-day' && obhLaborAmount > 0 ? line(`OBH labor x${resolvedObhMultiplier.toFixed(2)}`, obhLaborAmount) : null,
      !isSupportTariffQuote && billingModel !== 'fixed-fee' && billingModel !== 'full-day' && weekendLaborAmount > 0 ? line(`Weekend labor x${resolvedWeekendMultiplier.toFixed(2)}`, weekendLaborAmount) : null,
      ...travelLineItems,
      line(consumablesNote.trim() || 'Consumables', consumablesSubtotal),
      line(equipmentLabel.trim() || 'Equipment rental', equipmentSubtotal),
      ...extraItemLines.map((item) => ({ label: item.label, amount: item.amount })),
      line('Pass-through markup', markupAmount),
      line('Risk buffer', contingencyAmount),
      discountAmount > 0 ? { label: 'Discount', amount: -discountAmount } : null,
    ].filter(Boolean) as SummaryLine[]
  ), [
    billableStandardAmount,
    billingModel,
    calloutMinimumAmount,
    contingencyAmount,
    consumablesNote,
    consumablesSubtotal,
    discountAmount,
    equipmentLabel,
    equipmentSubtotal,
    extraItemLines,
    isSupportTariffQuote,
    laborSubtotal,
    markupAmount,
    obhLaborAmount,
    resolvedObhMultiplier,
    resolvedWeekendMultiplier,
    standardLaborAmount,
    travelLineItems,
    weekendLaborAmount,
  ])

  const detailSummary = useMemo(() => {
    const travelDetails = travelRequired ? travelGroups.map((group) => {
      const modeBits = [
        detailText('mode', group.mode),
        detailText('travellers', `${group.travelers || 0}`),
        group.mode === 'mileage' ? detailText('km', `${group.mileageKm || 0} @ ${formatAmount(currency, group.mileageRate || 0)}`) : '',
        group.mode === 'air' || group.mode === 'rail' || group.mode === 'ferry' ? detailText('tickets', formatAmount(currency, group.ticketCost || 0)) : '',
        group.mode === 'rental-car' ? detailText('rental', `${group.rentalDays || 0} d @ ${formatAmount(currency, group.rentalDayRate || 0)}`) : '',
        group.hotelRequired ? detailText('hotel', `${group.hotelNights || 0} nights @ ${formatAmount(currency, group.hotelNightRate || 0)}`) : '',
        group.perDiemEnabled ? detailText('per diem', `${group.perDiemDays || 0} d @ ${formatAmount(currency, group.perDiemRate || 0)}`) : '',
      ].filter(Boolean).join(' · ')
      return `${group.label}: ${modeBits}`
    }) : []
    const extras = [
      consumablesSubtotal > 0 ? `Consumables: ${formatAmount(currency, consumablesSubtotal)}${consumablesNote ? ` · ${consumablesNote}` : ''}` : '',
      equipmentSubtotal > 0 ? `${equipmentLabel || 'Equipment rental'}: ${equipmentDays || 0} d @ ${formatAmount(currency, equipmentRate || 0)}${equipmentNote ? ` · ${equipmentNote}` : ''}` : '',
      ...extraItemLines.map((item) => `${item.label}: ${formatAmount(currency, item.amount)}${item.note ? ` · ${item.note}` : ''}`),
    ].filter(Boolean)
    return [...travelDetails, ...extras].join('\n')
  }, [consumablesNote, consumablesSubtotal, currency, equipmentDays, equipmentLabel, equipmentNote, equipmentRate, equipmentSubtotal, extraItemLines, travelGroups, travelRequired])

  const stepItems = [{ title: 'Basics' }, { title: 'Packages' }, { title: 'Labor' }, { title: 'Travel' }, { title: 'Extras' }, { title: 'Review' }, { title: 'Margin' }]

  const customerDocumentBasics = [
    { label: 'Customer', value: activeCustomer?.name || '-' },
    customerContactName.trim() ? { label: 'Contact', value: customerContactName.trim() } : null,
    customerContactEmail.trim() ? { label: 'Contact email', value: customerContactEmail.trim() } : null,
    { label: 'Work location', value: workLocation || '-' },
    { label: 'Service type', value: serviceType },
    { label: 'Delivery mode', value: deliveryMode },
    { label: 'Quote currency', value: currency },
    billToEntity.trim() ? { label: 'Bill-to entity', value: billToEntity.trim() } : null,
    vatNumber.trim() ? { label: 'VAT / tax ID', value: vatNumber.trim() } : null,
    poRequirement.trim() ? { label: 'PO requirement', value: poRequirement.trim() } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
  const usesHourlyBuckets = billingModel === 'hourly' || billingModel === 'callout-hourly'
  const customerLaborTariffRows = isSupportTariffQuote ? [
    {
      window: '08:00-18:00',
      hourlyRate: formatAmount(currency, resolvedRate),
      callOut: billingModel === 'callout-hourly' ? formatAmount(currency, resolvedCallOut) : '-',
      includedHours: billingModel === 'callout-hourly' ? `${resolvedIncludedHours.toFixed(2)} h` : '-',
    },
    {
      window: '18:00-08:00',
      hourlyRate: formatAmount(currency, obhPreviewRate),
      callOut: billingModel === 'callout-hourly' ? formatAmount(currency, resolvedObhCallOut) : '-',
      includedHours: billingModel === 'callout-hourly' ? `${resolvedObhIncludedHours.toFixed(2)} h` : '-',
    },
    {
      window: 'Weekend',
      hourlyRate: formatAmount(currency, weekendPreviewRate),
      callOut: billingModel === 'callout-hourly' ? formatAmount(currency, resolvedWeekendCallOut) : '-',
      includedHours: billingModel === 'callout-hourly' ? `${resolvedWeekendIncludedHours.toFixed(2)} h` : '-',
    },
  ] : []
  const customerWorkPackages = workPackages
    .filter(hasWorkPackageContent)
    .map((item) => {
      const responsibilityDetails = [
        `Logistics: ${responsibilityLabel(item.logisticsOwner)}`,
        `Shipping labels: ${responsibilityLabel(item.shippingLabelsOwner)}`,
        `Insurance: ${responsibilityLabel(item.insuranceOwner)}`,
        `Packing materials: ${responsibilityLabel(item.packingOwner)}`,
      ].join(' · ')
      return {
        id: item.id,
        title: item.label.trim() || item.packageType || 'Work package',
        type: item.packageType || '-',
        route: [item.pickupLocation.trim(), item.deliveryLocation.trim()].filter(Boolean).join(' -> ') || '-',
        timing: item.schedule.trim() || '-',
        technicians: item.technicians ? `${item.technicians}` : '-',
        serviceWindow: item.serviceWindow.trim() || '-',
        details: [
          responsibilityDetails,
          item.remoteSupportRequired ? 'Remote customer support required' : 'Remote customer support not required',
          item.accessNotes.trim() ? `Access notes: ${item.accessNotes.trim()}` : '',
          item.customerNote.trim() ? item.customerNote.trim() : '',
        ].filter(Boolean),
      }
    })
  const customerLaborDetails = [
    `Technicians: ${technicians}`,
    isSupportTariffQuote ? 'Coverage model: single technician call-out tariff' : '',
    isSupportTariffQuote ? `Tariff shape: ${billingModel === 'callout-hourly' ? 'Call-out + hourly' : 'Hourly'}` : '',
    isSupportTariffQuote
      ? `Rate basis: ${rateSource === 'manual' ? 'Manual rate' : `${selectedRateCardLocation ? getLocationLabel(selectedRateCardLocation) : '-'} · ${selectedPreset?.label || 'Unselected'}`}`
      : '',
    !usesHourlyBuckets ? `Work days: ${days}` : '',
    !usesHourlyBuckets && !isSingleTechQuote ? `Hours per day: ${dayHours.toFixed(2)}` : '',
    !isSupportTariffQuote && usesHourlyBuckets
      ? billingModel === 'callout-hourly'
        ? `Standard hours: ${standardLaborHours.toFixed(2)}`
        : `Standard hours: ${standardLaborHours.toFixed(2)} · ${formatAmount(currency, standardLaborAmount)}`
      : '',
    !isSupportTariffQuote && billingModel === 'callout-hourly' ? `Included standard hours: ${includedStandardHours.toFixed(2)} · additional standard billed: ${billableStandardHours.toFixed(2)} h` : '',
    !isSupportTariffQuote && usesHourlyBuckets && obhLaborHours > 0 ? `OBH hours: ${obhLaborHours.toFixed(2)} · included ${includedObhHours.toFixed(2)} · billed ${billableObhHours.toFixed(2)} @ ${formatAmount(currency, resolvedRate)} x ${resolvedObhMultiplier.toFixed(2)} = ${formatAmount(currency, obhLaborAmount)}` : '',
    !isSupportTariffQuote && usesHourlyBuckets && weekendLaborHours > 0 ? `Weekend hours: ${weekendLaborHours.toFixed(2)} · included ${includedWeekendHours.toFixed(2)} · billed ${billableWeekendHours.toFixed(2)} @ ${formatAmount(currency, resolvedRate)} x ${resolvedWeekendMultiplier.toFixed(2)} = ${formatAmount(currency, weekendLaborAmount)}` : '',
    !isSupportTariffQuote && usesHourlyBuckets ? `Total labor hours: ${laborHours.toFixed(2)}` : '',
    !isSupportTariffQuote ? `Billing model: ${billingModel}` : '',
    billingModel === 'fixed-fee'
      ? `Fixed fee: ${formatAmount(currency, fixedFee || 0)}`
      : !isSupportTariffQuote ? `Rate basis: ${rateSource === 'manual' ? 'Manual rate' : `${selectedRateCardLocation ? getLocationLabel(selectedRateCardLocation) : '-'} · ${selectedPreset?.label || 'Unselected'}`}` : '',
    !isSupportTariffQuote && billingModel !== 'fixed-fee'
      ? `Selected rate: ${formatAmount(currency, resolvedRate)}`
      : '',
    !isSupportTariffQuote && billingModel === 'callout-hourly'
      ? `Minimum charge: ${formatAmount(currency, resolvedCallOut)} · applies ${calloutVisits}x · includes ${resolvedIncludedHours.toFixed(2)} h each`
      : '',
    isSupportTariffQuote && billingModel === 'hourly' ? '' : `Labor subtotal: ${formatAmount(currency, laborSubtotal)}`,
  ].filter(Boolean)
  const customerTravelGroups = travelRequired
    ? travelGroups.map((group) => ({
      title: group.label.trim() || 'Travel group',
      details: [
        `Travellers: ${group.travelers || 0}`,
        `Mode: ${group.mode}`,
        group.billTravelTime ? `Travel time billed: ${group.travelHours || 0} h per traveller @ x${group.travelRateMultiplier || 0}` : 'Travel time billed: No',
        group.mode === 'mileage' ? `Mileage: ${group.mileageKm || 0} km @ ${formatAmount(currency, group.mileageRate || 0)}` : '',
        group.mode === 'air' || group.mode === 'rail' || group.mode === 'ferry' ? `Tickets: ${formatAmount(currency, group.ticketCost || 0)} · Baggage: ${formatAmount(currency, group.baggageCost || 0)} · Transfers: ${formatAmount(currency, group.transferCost || 0)}` : '',
        group.mode === 'rental-car' ? `Rental car: ${group.rentalDays || 0} days @ ${formatAmount(currency, group.rentalDayRate || 0)} · Fuel/tolls: ${formatAmount(currency, group.fuelTolls || 0)}` : '',
        group.mode === 'taxi' ? `Taxi estimate: ${formatAmount(currency, group.taxiCost || 0)}` : '',
        group.hotelRequired ? `Accommodation: ${group.hotelNights || 0} nights @ ${formatAmount(currency, group.hotelNightRate || 0)} · Rooms: ${group.hotelRooms || 0}` : 'Accommodation: No',
        group.perDiemEnabled ? `Per diem: ${group.perDiemDays || 0} days @ ${formatAmount(currency, group.perDiemRate || 0)}` : 'Per diem: No',
      ].filter(Boolean),
    }))
    : []
  const customerExtras = [
    consumablesSubtotal > 0 ? `Consumables: ${formatAmount(currency, consumablesSubtotal)}${consumablesNote ? ` · ${consumablesNote}` : ''}` : '',
    equipmentSubtotal > 0 ? `${equipmentLabel || 'Equipment rental'}: ${equipmentDays || 0} days @ ${formatAmount(currency, equipmentRate || 0)}${equipmentNote ? ` · ${equipmentNote}` : ''}` : '',
    ...extraItemLines.map((item) => `${item.label}: ${formatAmount(currency, item.amount)}${item.note ? ` · ${item.note}` : ''}`),
    markupAmount > 0 ? `Markup on pass-through: ${markupPercent || 0}%` : '',
    contingencyAmount > 0 ? `Risk buffer: ${contingencyPercent || 0}%` : '',
    discountAmount > 0 ? `Discount: ${discountPercent || 0}%` : '',
  ].filter(Boolean)

  function captureDraft(): QuoteDraft {
    return {
      quoteRef,
      quoteName,
      sourceRequestId,
      customerContactName,
      customerContactEmail,
      workLocation,
      currency,
      deliveryMode,
      serviceType,
      quoteValidityDays,
      billToEntity,
      vatNumber,
      poRequirement,
      technicianCount,
      workDays,
      hoursPerDay,
      obhHours,
      obhMultiplier,
      weekendHours,
      weekendMultiplier,
      billingModel,
      rateSource,
      rateCardLocationId,
      presetRateId,
      manualRate,
      manualCallOutFee,
      manualObhCallOutFee,
      manualWeekendCallOutFee,
      manualIncludedHours,
      manualObhIncludedHours,
      manualWeekendIncludedHours,
      laborCustomerNote,
      fixedFee,
      techCostSource,
      technicianCostId,
      manualTechPayRate,
      travelRequired,
      travelGroups,
      travelCustomerNote,
      workPackages,
      consumables,
      consumablesNote,
      equipmentLabel,
      equipmentDays,
      equipmentRate,
      equipmentNote,
      extraItems,
      extrasCustomerNote,
      otherCostLabel: '',
      otherCost: 0,
      otherCostNote: '',
      markupPercent,
      discountPercent,
      contingencyPercent,
      summaryText,
      assumptions,
    }
  }

  function applyDraft(draft: QuoteDraft, nextQuoteId = '', nextStep = 0) {
    setActiveQuoteId(nextQuoteId)
    setStep(nextStep)
    setQuoteRef(draft.quoteRef)
    setQuoteName(draft.quoteName)
    setSourceRequestId(draft.sourceRequestId || '')
    setCustomerContactName(draft.customerContactName || '')
    setCustomerContactEmail(draft.customerContactEmail || '')
    setWorkLocation(draft.workLocation)
    setCurrency(draft.currency)
    setDeliveryMode(draft.deliveryMode)
    setServiceType(draft.serviceType)
    setQuoteValidityDays(draft.quoteValidityDays ?? 30)
    setBillToEntity(draft.billToEntity || '')
    setVatNumber(draft.vatNumber || '')
    setPoRequirement(draft.poRequirement || '')
    setTechnicianCount(draft.technicianCount)
    setWorkDays(draft.workDays)
    setHoursPerDay(draft.hoursPerDay)
    setObhHours(draft.obhHours)
    setObhMultiplier(draft.obhMultiplier)
    setWeekendHours(draft.weekendHours)
    setWeekendMultiplier(draft.weekendMultiplier)
    setBillingModel(draft.billingModel)
    setRateSource(draft.rateSource)
    setRateCardLocationId(draft.rateCardLocationId)
    setPresetRateId(draft.presetRateId)
    setManualRate(draft.manualRate)
    setManualCallOutFee(draft.manualCallOutFee)
    setManualObhCallOutFee(draft.manualObhCallOutFee)
    setManualWeekendCallOutFee(draft.manualWeekendCallOutFee)
    setManualIncludedHours(draft.manualIncludedHours)
    setManualObhIncludedHours(draft.manualObhIncludedHours)
    setManualWeekendIncludedHours(draft.manualWeekendIncludedHours)
    setLaborCustomerNote(draft.laborCustomerNote)
    setFixedFee(draft.fixedFee)
    setTechCostSource(draft.techCostSource)
    setTechnicianCostId(draft.technicianCostId)
    setManualTechPayRate(draft.manualTechPayRate)
    setTravelRequired(draft.travelRequired)
    setTravelGroups(draft.travelGroups.length ? draft.travelGroups : [createTravelGroup(1)])
    setTravelCustomerNote(draft.travelCustomerNote)
    setWorkPackages(draft.workPackages || [])
    setConsumables(draft.consumables)
    setConsumablesNote(draft.consumablesNote)
    setEquipmentLabel(draft.equipmentLabel)
    setEquipmentDays(draft.equipmentDays)
    setEquipmentRate(draft.equipmentRate)
    setEquipmentNote(draft.equipmentNote)
    setExtraItems(draft.extraItems || [])
    setExtrasCustomerNote(draft.extrasCustomerNote)
    setMarkupPercent(draft.markupPercent)
    setDiscountPercent(draft.discountPercent)
    setContingencyPercent(draft.contingencyPercent)
    setSummaryText(draft.summaryText)
    setAssumptions(draft.assumptions)
  }

  function resetDraft() {
    applyDraft({ ...createQuoteDraftDefaults({
      currency: activeCustomer?.locationCards[0]?.currency || 'EUR',
      rateCardLocationId: activeCustomer?.locationCards[0]?.id || '',
      customerKey: activeCustomer?.customerKey || '',
      quoteRef: nextQuoteRefForCustomer(activeCustomer?.customerKey || '', customerQuotes),
    }), ...draftPrefill }, '', 0)
  }

  function handleRateSourceChange(nextRateSource: QuoteRateSource) {
    setRateSource(nextRateSource)
    if (nextRateSource === 'preset' && selectedRateCardLocation?.currency && !currency.trim()) {
      setCurrency(selectedRateCardLocation.currency)
    }
  }

  function handleRateCardLocationChange(nextLocationId: string) {
    const nextLocation = activeCustomer?.locationCards.find((location) => location.id === nextLocationId) ?? null
    const currentPresetCurrency = selectedRateCardLocation?.currency || ''
    setRateCardLocationId(nextLocationId)
    if (rateSource === 'preset' && nextLocation?.currency && (!currency.trim() || currency === currentPresetCurrency)) {
      setCurrency(nextLocation.currency)
    }
  }

  function buildSavedQuote(overrides?: Partial<SavedQuote>): SavedQuote | null {
    if (!activeCustomer) return null
    const now = new Date().toISOString()
    const quoteId = activeQuoteId || `quote-${Date.now()}`
    const generatedRef = quoteRef.trim() || nextQuoteRefForCustomer(activeCustomer.customerKey, customerQuotes, quoteId)
    const nextQuoteRef = uniqueQuoteRef(generatedRef, quoteId, customerQuotes)
    return {
      id: quoteId,
      sourceRequestId,
      customerKey: activeCustomer.customerKey,
      customerName: activeCustomer.name,
      quoteRef: nextQuoteRef,
      quoteName: quoteName.trim() || 'Untitled Quote',
      currency,
      grandTotal,
      updatedAt: now,
      customerPdf: overrides?.customerPdf ?? activeSavedQuote?.customerPdf,
      draft: captureDraft(),
      ...overrides,
    }
  }

  async function persistInternalCustomerPdf(nextQuote: SavedQuote) {
    const api = desktopWindow()
    if (!api?.savePdfFromHtml) return nextQuote
    const safeName = safeDocumentName(nextQuote.quoteRef || nextQuote.quoteName || 'Quote')
    const savedPdf = await api.savePdfFromHtml({
      id: `quote-pdf-${nextQuote.id}`,
      fileName: `${safeName}.pdf`,
      html: customerQuoteHtml(),
    })
    if (!savedPdf.storedPath) return nextQuote
    return {
      ...nextQuote,
      customerPdf: {
        fileName: `${safeName}.pdf`,
        previewUrl: savedPdf.previewUrl || undefined,
        storedPath: savedPdf.storedPath || undefined,
        exportedAt: new Date().toISOString(),
      },
    }
  }

  async function saveCurrentQuote() {
    let nextQuote = buildSavedQuote()
    if (!nextQuote) return
    nextQuote = await persistInternalCustomerPdf(nextQuote)
    onSaveQuote(nextQuote)
    setActiveQuoteId(nextQuote.id)
    setQuoteRef(nextQuote.quoteRef)
  }

  function customerQuoteHtml() {
    const renderedQuoteRef = uniqueQuoteRef(
      quoteRef.trim() || nextQuoteRefForCustomer(activeCustomer?.customerKey || '', customerQuotes, activeQuoteId),
      activeQuoteId,
      customerQuotes,
    )
    return buildCustomerQuoteHtml({
      customerName: activeCustomer?.name || '',
      quoteRef: renderedQuoteRef,
      quoteName: quoteName.trim() || 'Quote',
      workLocation,
      currency,
      validityDays: quoteValidityDays || 30,
      serviceType,
      deliveryMode,
      summaryText,
      assumptions,
      basics: customerDocumentBasics,
      workPackages: customerWorkPackages,
      laborDetails: customerLaborDetails,
      laborTariffRows: customerLaborTariffRows,
      laborNote: laborCustomerNote,
      travelGroups: customerTravelGroups,
      travelNote: travelCustomerNote,
      extras: customerExtras,
      extrasNote: extrasCustomerNote,
      summaryLines: summaryLines.map((entry) => ({ label: entry.label, amount: formatAmount(currency, entry.amount) })),
      total: formatAmount(currency, grandTotal),
    })
  }

  async function saveCustomerQuotePdfAs() {
    const safeName = safeDocumentName(
      uniqueQuoteRef(
        quoteRef.trim() || nextQuoteRefForCustomer(activeCustomer?.customerKey || '', customerQuotes, activeQuoteId),
        activeQuoteId,
        customerQuotes,
      ) || quoteName.trim() || 'Quote',
    )
    const api = desktopWindow()
    if (!api?.savePdfAsFromHtml) {
      downloadText(`${safeName}.html`, 'text/html;charset=utf-8', customerQuoteHtml())
      return
    }
    if (activeQuoteId) {
      const nextQuote = buildSavedQuote()
      if (nextQuote) {
        const updatedQuote = await persistInternalCustomerPdf(nextQuote)
        onSaveQuote(updatedQuote)
        setActiveQuoteId(updatedQuote.id)
        setQuoteRef(updatedQuote.quoteRef)
      }
    }
    await api.savePdfAsFromHtml({
      fileName: `${safeName}.pdf`,
      html: customerQuoteHtml(),
    })
  }

  async function printCustomerQuote() {
    const api = desktopWindow()
    if (!api?.printHtml) return
    await api.printHtml({ html: customerQuoteHtml() })
  }

  function updateTravelGroup(groupId: string, patch: Partial<QuoteTravelGroup>) {
    setTravelGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)))
  }

  function addTravelGroup() {
    setTravelGroups((current) => [...current, createTravelGroup(current.length + 1)])
  }

  function removeTravelGroup(groupId: string) {
    setTravelGroups((current) => current.filter((group) => group.id !== groupId))
  }

  function updateWorkPackage(packageId: string, patch: Partial<QuoteWorkPackage>) {
    setWorkPackages((current) => current.map((item) => (item.id === packageId ? { ...item, ...patch } : item)))
  }

  function addWorkPackage() {
    setWorkPackages((current) => [...current, createQuoteWorkPackage(current.length + 1)])
  }

  function removeWorkPackage(packageId: string) {
    setWorkPackages((current) => current.filter((item) => item.id !== packageId))
  }

  function updateExtraItem(itemId: string, patch: Partial<QuoteExtraItem>) {
    setExtraItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)))
  }

  function addExtraItem() {
    setExtraItems((current) => [...current, createQuoteExtraItem(current.length + 1)])
  }

  function removeExtraItem(itemId: string) {
    setExtraItems((current) => current.filter((item) => item.id !== itemId))
  }

  const draftSnapshot = useMemo(
    () => captureDraft(),
    [
      quoteRef,
      quoteName,
      sourceRequestId,
      customerContactName,
      customerContactEmail,
      workLocation,
      currency,
      deliveryMode,
      serviceType,
      quoteValidityDays,
      billToEntity,
      vatNumber,
      poRequirement,
      technicianCount,
      workDays,
      hoursPerDay,
      obhHours,
      obhMultiplier,
      weekendHours,
      weekendMultiplier,
      billingModel,
      rateSource,
      rateCardLocationId,
      presetRateId,
      manualRate,
      manualCallOutFee,
      manualObhCallOutFee,
      manualWeekendCallOutFee,
      manualIncludedHours,
      manualObhIncludedHours,
      manualWeekendIncludedHours,
      laborCustomerNote,
      fixedFee,
      techCostSource,
      technicianCostId,
      manualTechPayRate,
      travelRequired,
      travelGroups,
      travelCustomerNote,
      workPackages,
      consumables,
      consumablesNote,
      equipmentLabel,
      equipmentDays,
      equipmentRate,
      equipmentNote,
      extraItems,
      extrasCustomerNote,
      markupPercent,
      discountPercent,
      contingencyPercent,
      summaryText,
      assumptions,
    ],
  )

  useEffect(() => {
    if (!draftReady || !activeCustomer) return
    saveQuoteDraftSession(activeCustomer.customerKey, {
      activeQuoteId,
      step,
      draft: draftSnapshot,
    })
  }, [activeCustomer, activeQuoteId, draftReady, draftSnapshot, step])

  if (!activeCustomer) return null

  return (
    <div className="fortnox-quote-layout">
      <div className="fortnox-quote-main">
        <section className="fortnox-quote-panel">
          <div className="fortnox-quote-library fortnox-quote-actions-only">
            <div className="fortnox-quote-actions fortnox-quote-actions-inline">
              {onBackToLaunch ? <Button onClick={onBackToLaunch}>Quote Home</Button> : null}
              <Button onClick={resetDraft}>New Quote</Button>
              <Button onClick={() => { void saveCurrentQuote() }} type="primary">Save Quote</Button>
              <Button onClick={() => { void saveCustomerQuotePdfAs() }}>Save PDF As...</Button>
              <Button onClick={() => { void printCustomerQuote() }}>Print Quote</Button>
              {activeQuoteId ? (
                <Popconfirm
                  okText="Delete"
                  okType="danger"
                  onConfirm={() => {
                    onDeleteQuote(activeQuoteId)
                    resetDraft()
                  }}
                  title="Delete this saved quote?"
                >
                  <Button danger>Delete</Button>
                </Popconfirm>
              ) : null}
            </div>
          </div>
          <Steps current={step} items={stepItems} onChange={setStep} size="small" />
          <div className="fortnox-quote-stepbar">
            <Typography.Text strong>{stepItems[step]?.title || 'Quote Builder'}</Typography.Text>
            <div className="fortnox-quote-actions fortnox-quote-actions-top">
              <Button disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</Button>
              <Button onClick={() => setStep((current) => Math.min(stepItems.length - 1, current + 1))} type="primary">
                {step === stepItems.length - 1 ? 'Done' : 'Next'}
              </Button>
            </div>
          </div>

          {step === 0 ? (
            <div className="fortnox-quote-form">
              <label><span>Quote ref</span><Input onChange={(event) => setQuoteRef(event.target.value)} placeholder="SUNSPEED-20260616-0930" value={quoteRef} /></label>
              <label><span>Quote name</span><Input onChange={(event) => setQuoteName(event.target.value)} placeholder="CUSTOMER-MONTH-YEAR-SCOPE" value={quoteName} /></label>
              <label><span>Customer contact</span><Input onChange={(event) => setCustomerContactName(event.target.value)} placeholder="Contact name" value={customerContactName} /></label>
              <label><span>Contact email</span><Input onChange={(event) => setCustomerContactEmail(event.target.value)} placeholder="name@example.com" value={customerContactEmail} /></label>
              <label><span>Customer location</span><Select allowClear onChange={(value) => setWorkLocation(value || '')} options={customerLocationOptions} placeholder="Pick a saved customer site" showSearch value={customerLocationOptions.some((option) => option.value === workLocation) ? workLocation : undefined} /></label>
              <label><span>Work location</span><Input onChange={(event) => setWorkLocation(event.target.value)} placeholder="Any site, city, country, or custom location" value={workLocation} /></label>
              <label><span>Currency</span><Select onChange={setCurrency} options={['SEK', 'EUR', 'NOK', 'DKK', 'USD', 'GBP'].map((value) => ({ value, label: value }))} value={currency} /></label>
              <label className="fortnox-quote-fit-control"><span>Delivery mode</span><Segmented onChange={(value) => setDeliveryMode(value as QuoteDeliveryMode)} options={['Onsite', 'Remote', 'Mixed']} value={deliveryMode} /></label>
              <label><span>Service type</span><Select onChange={setServiceType} options={['BAU', 'Break-fix', 'Survey', 'IMAC', 'Install', 'Project work', 'Standby support'].map((value) => ({ value, label: value }))} value={serviceType} /></label>
              {!isSingleTechQuote ? (
                <>
                  <label><span>Technicians</span><InputNumber min={1} onChange={(value) => setTechnicianCount(numberValue(value))} value={technicianCount} /></label>
                  <label><span>Work days</span><InputNumber min={0} onChange={(value) => setWorkDays(numberValue(value))} value={workDays} /></label>
                  <label><span>Hours per day</span><InputNumber min={0} onChange={(value) => setHoursPerDay(numberValue(value))} value={hoursPerDay} /></label>
                </>
              ) : null}
              <label className="fortnox-quote-form-span-2"><span>Scope Summary</span><TextArea onChange={(event) => setSummaryText(event.target.value)} placeholder="Describe the planned work, deliverables, customer environment, and any special handling." rows={5} value={summaryText} /></label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="fortnox-quote-stack">
              <section className="fortnox-quote-subsection">
                <div className="fortnox-quote-subsection-head">
                  <div>
                    <Typography.Text strong>Work Packages</Typography.Text>
                    <div className="page-description">Use one package per route, site visit, procurement scope, or install activity.</div>
                  </div>
                  <Button onClick={addWorkPackage}>Add Work Package</Button>
                </div>
                {workPackages.length ? (
                  <div className="fortnox-quote-stack">
                    {workPackages.map((item, index) => (
                      <section className="fortnox-quote-subsection fortnox-quote-package" key={item.id}>
                        <div className="fortnox-quote-subsection-head">
                          <Typography.Text>{item.label.trim() || `Work package ${index + 1}`}</Typography.Text>
                          <Button onClick={() => removeWorkPackage(item.id)} size="small">Remove</Button>
                        </div>
                        <div className="fortnox-quote-form">
                          <label><span>Package label</span><Input onChange={(event) => updateWorkPackage(item.id, { label: event.target.value })} placeholder="Amsterdam to Stuttgart move" value={item.label} /></label>
                          <label><span>Package type</span><Select onChange={(value) => updateWorkPackage(item.id, { packageType: value })} options={workPackageTypeOptions} value={item.packageType || undefined} /></label>
                          <label><span>Pickup / source</span><TextArea onChange={(event) => updateWorkPackage(item.id, { pickupLocation: event.target.value })} placeholder="Pickup site, address, room, rack, or supplier" rows={3} value={item.pickupLocation} /></label>
                          <label><span>Delivery / destination</span><TextArea onChange={(event) => updateWorkPackage(item.id, { deliveryLocation: event.target.value })} placeholder="Destination site, address, room, rack, or install site" rows={3} value={item.deliveryLocation} /></label>
                          <label><span>Schedule / deadline</span><Input onChange={(event) => updateWorkPackage(item.id, { schedule: event.target.value })} placeholder="Mid-July, next two weeks, exact date TBD" value={item.schedule} /></label>
                          <label><span>Technicians</span><InputNumber min={0} onChange={(value) => updateWorkPackage(item.id, { technicians: numberValue(value) })} value={item.technicians} /></label>
                          <label><span>Service window</span><Input onChange={(event) => updateWorkPackage(item.id, { serviceWindow: event.target.value })} placeholder="Business hours, OBH, weekend, site window TBD" value={item.serviceWindow} /></label>
                          <BooleanChoice label="Remote support required" onChange={(checked) => updateWorkPackage(item.id, { remoteSupportRequired: checked })} value={item.remoteSupportRequired} />
                          <label><span>Logistics owner</span><Select onChange={(value) => updateWorkPackage(item.id, { logisticsOwner: value as QuoteResponsibility })} options={responsibilityOptions} value={item.logisticsOwner} /></label>
                          <label><span>Shipping labels</span><Select onChange={(value) => updateWorkPackage(item.id, { shippingLabelsOwner: value as QuoteResponsibility })} options={responsibilityOptions} value={item.shippingLabelsOwner} /></label>
                          <label><span>Insurance owner</span><Select onChange={(value) => updateWorkPackage(item.id, { insuranceOwner: value as QuoteResponsibility })} options={responsibilityOptions} value={item.insuranceOwner} /></label>
                          <label><span>Packing materials</span><Select onChange={(value) => updateWorkPackage(item.id, { packingOwner: value as QuoteResponsibility })} options={responsibilityOptions} value={item.packingOwner} /></label>
                          <label className="fortnox-quote-form-span-2"><span>Access / dependency notes</span><TextArea onChange={(event) => updateWorkPackage(item.id, { accessNotes: event.target.value })} placeholder="Access approvals, loading dock, escort, remote hands, shutdown, rack/cabling instructions" rows={3} value={item.accessNotes} /></label>
                          <label className="fortnox-quote-form-span-2"><span>Customer notes</span><TextArea onChange={(event) => updateWorkPackage(item.id, { customerNote: event.target.value })} placeholder="Optional package-specific note visible on the quote." rows={3} value={item.customerNote} /></label>
                        </div>
                      </section>
                    ))}
                  </div>
                ) : <div className="page-description">No packages added. For a simple one-site quote this can be left empty.</div>}
              </section>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="fortnox-quote-form">
              {billingModel !== 'fixed-fee' ? <label className="fortnox-quote-fit-control"><span>Rate source</span><Segmented onChange={(value) => handleRateSourceChange(value as QuoteRateSource)} options={[{ value: 'preset', label: 'Saved rate card' }, { value: 'manual', label: 'Manual' }]} value={rateSource} /></label> : null}
              <label className="fortnox-quote-fit-control"><span>Billing model</span><Segmented onChange={(value) => setBillingModel(value as QuoteBillingModel)} options={[{ value: 'hourly', label: 'Hourly' }, { value: 'callout-hourly', label: 'Call-out + Hourly' }, { value: 'full-day', label: 'Full day' }, { value: 'fixed-fee', label: 'Fixed fee' }]} value={billingModel} /></label>
              {billingModel === 'fixed-fee' ? <label><span>Fixed fee</span><InputNumber min={0} onChange={(value) => setFixedFee(numberValue(value))} precision={2} value={fixedFee} /></label> : null}
              {billingModel !== 'fixed-fee' && rateSource === 'preset' ? (
                <>
                  <label><span>Rate card location</span><Select onChange={handleRateCardLocationChange} options={activeCustomer.locationCards.map((location) => ({ value: location.id, label: getLocationLabel(location) }))} value={selectedRateCardLocation?.id} /></label>
                  <label><span>Rate preset</span><Select onChange={setPresetRateId} options={visiblePresets.map((preset) => ({ value: preset.id, label: `${preset.label} · ${formatAmount(currency, preset.rate)}${billingModel === 'callout-hourly' && preset.includedHours > 0 ? ` · incl. ${preset.includedHours} h` : ''}` }))} value={selectedPreset?.id} /></label>
                </>
              ) : null}
              {!isSupportTariffQuote && billingModel !== 'fixed-fee' && rateSource === 'manual' ? <label><span>{billingModel === 'full-day' ? 'Manual day rate' : 'Manual hourly rate'}</span><InputNumber min={0} onChange={(value) => setManualRate(numberValue(value))} precision={2} value={manualRate} /></label> : null}
              {!isSupportTariffQuote && billingModel === 'callout-hourly' && rateSource === 'manual' ? <label><span>Minimum charge</span><InputNumber min={0} onChange={(value) => setManualCallOutFee(numberValue(value))} precision={2} value={manualCallOutFee} /></label> : null}
              {!isSupportTariffQuote && billingModel === 'callout-hourly' ? <label><span>Included hours</span><InputNumber disabled={rateSource !== 'manual'} min={0} onChange={(value) => setManualIncludedHours(numberValue(value))} precision={2} value={rateSource === 'manual' ? manualIncludedHours : resolvedIncludedHours} /></label> : null}
              {!isSupportTariffQuote && (billingModel === 'hourly' || billingModel === 'callout-hourly') ? <label><span>Standard hours</span><InputNumber min={0} onChange={(value) => setHoursPerDay(numberValue(value))} precision={2} value={hoursPerDay} /></label> : null}
              {isSupportTariffQuote ? (
                <>
                  <div className="fortnox-quote-form fortnox-quote-form-span-2 fortnox-quote-tariff-row">
                    <div className="fortnox-quote-tariff-window"><span>Window</span><strong>08:00-18:00</strong></div>
                    <label><span>Multiplier</span><InputNumber disabled precision={2} value={1} /></label>
                    <label><span>Hourly rate</span><InputNumber disabled={rateSource === 'preset'} min={0} onChange={(value) => setManualRate(numberValue(value))} precision={2} value={rateSource === 'manual' ? manualRate : resolvedRate} /></label>
                    <label><span>Call-out x</span><InputNumber disabled={billingModel !== 'callout-hourly'} min={0} onChange={(value) => {
                      const next = numberValue(value)
                      setManualCallOutFee(next == null ? null : roundMoney(resolvedRate * next))
                    }} precision={2} step={0.25} value={billingModel === 'callout-hourly' ? dayCallOutMultiplier : null} /></label>
                    <label><span>Minimum charge</span><InputNumber disabled precision={2} value={billingModel === 'callout-hourly' ? resolvedCallOut : null} /></label>
                    <label><span>Included hours</span><InputNumber disabled={billingModel !== 'callout-hourly'} min={0} onChange={(value) => setManualIncludedHours(numberValue(value))} precision={2} value={billingModel === 'callout-hourly' ? resolvedIncludedHours : null} /></label>
                  </div>
                  <div className="fortnox-quote-form fortnox-quote-form-span-2 fortnox-quote-tariff-row">
                    <div className="fortnox-quote-tariff-window"><span>Window</span><strong>18:00-08:00</strong></div>
                    <label><span>Multiplier</span><InputNumber min={1} onChange={(value) => setObhMultiplier(numberValue(value))} precision={2} step={0.25} value={obhMultiplier} /></label>
                    <label><span>Hourly rate</span><InputNumber disabled precision={2} value={obhPreviewRate} /></label>
                    <label><span>Call-out x</span><InputNumber disabled={billingModel !== 'callout-hourly'} min={0} onChange={(value) => {
                      const next = numberValue(value)
                      setManualObhCallOutFee(next == null ? null : roundMoney(obhPreviewRate * next))
                    }} precision={2} step={0.25} value={billingModel === 'callout-hourly' ? obhCallOutMultiplier : null} /></label>
                    <label><span>Minimum charge</span><InputNumber disabled precision={2} value={billingModel === 'callout-hourly' ? resolvedObhCallOut : null} /></label>
                    <label><span>Included hours</span><InputNumber disabled={billingModel !== 'callout-hourly'} min={0} onChange={(value) => setManualObhIncludedHours(numberValue(value))} precision={2} value={billingModel === 'callout-hourly' ? resolvedObhIncludedHours : null} /></label>
                  </div>
                  <div className="fortnox-quote-form fortnox-quote-form-span-2 fortnox-quote-tariff-row">
                    <div className="fortnox-quote-tariff-window"><span>Window</span><strong>Weekend</strong></div>
                    <label><span>Multiplier</span><InputNumber min={1} onChange={(value) => setWeekendMultiplier(numberValue(value))} precision={2} step={0.25} value={weekendMultiplier} /></label>
                    <label><span>Hourly rate</span><InputNumber disabled precision={2} value={weekendPreviewRate} /></label>
                    <label><span>Call-out x</span><InputNumber disabled={billingModel !== 'callout-hourly'} min={0} onChange={(value) => {
                      const next = numberValue(value)
                      setManualWeekendCallOutFee(next == null ? null : roundMoney(weekendPreviewRate * next))
                    }} precision={2} step={0.25} value={billingModel === 'callout-hourly' ? weekendCallOutMultiplier : null} /></label>
                    <label><span>Minimum charge</span><InputNumber disabled precision={2} value={billingModel === 'callout-hourly' ? resolvedWeekendCallOut : null} /></label>
                    <label><span>Included hours</span><InputNumber disabled={billingModel !== 'callout-hourly'} min={0} onChange={(value) => setManualWeekendIncludedHours(numberValue(value))} precision={2} value={billingModel === 'callout-hourly' ? resolvedWeekendIncludedHours : null} /></label>
                  </div>
                </>
              ) : billingModel === 'hourly' || billingModel === 'callout-hourly' ? (
                <>
                  <div className="fortnox-quote-form fortnox-quote-form-span-2">
                    <label><span>OBH hours</span><InputNumber min={0} onChange={(value) => setObhHours(numberValue(value))} precision={2} value={obhHours} /></label>
                    <label><span>OBH multiplier</span><InputNumber min={1} onChange={(value) => setObhMultiplier(numberValue(value))} precision={2} step={0.25} value={obhMultiplier} /></label>
                  </div>
                  {billingModel === 'callout-hourly' ? <label><span>OBH included hours</span><InputNumber min={0} onChange={(value) => setManualObhIncludedHours(numberValue(value))} precision={2} value={manualObhIncludedHours} /></label> : null}
                  <div className="fortnox-quote-form fortnox-quote-form-span-2">
                    <label><span>Weekend hours</span><InputNumber min={0} onChange={(value) => setWeekendHours(numberValue(value))} precision={2} value={weekendHours} /></label>
                    <label><span>Weekend multiplier</span><InputNumber min={1} onChange={(value) => setWeekendMultiplier(numberValue(value))} precision={2} step={0.25} value={weekendMultiplier} /></label>
                  </div>
                  {billingModel === 'callout-hourly' ? <label><span>Weekend included hours</span><InputNumber min={0} onChange={(value) => setManualWeekendIncludedHours(numberValue(value))} precision={2} value={manualWeekendIncludedHours} /></label> : null}
                </>
              ) : null}
              <label className="fortnox-quote-form-span-2"><span>Labor notes to customer</span><TextArea onChange={(event) => setLaborCustomerNote(event.target.value)} placeholder="Optional customer-facing labor note, such as response assumptions, included handling, or coverage window." rows={3} value={laborCustomerNote} /></label>
              {billingModel !== 'fixed-fee' && rateSource === 'preset' && !visiblePresets.length ? <Alert message="No matching saved rates found for this billing model. Switch to Manual or pick another rate card location." type="warning" /> : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="fortnox-quote-stack">
              {deliveryMode !== 'Remote' ? <BooleanChoice label="Travel required" onChange={setTravelRequired} value={travelRequired} /> : <Alert message="Remote work skips travel and overnight costs." type="info" />}
              {travelRequired ? (
                <>
                  {travelGroups.map((group, index) => (
                    <section className="fortnox-quote-subsection" key={group.id}>
                      <div className="fortnox-quote-subsection-head">
                        <Typography.Text strong>{group.label || `Travel group ${index + 1}`}</Typography.Text>
                        {travelGroups.length > 1 ? <Button onClick={() => removeTravelGroup(group.id)} size="small">Remove</Button> : null}
                      </div>
                      <div className="fortnox-quote-form">
                        <label><span>Group label</span><Input onChange={(event) => updateTravelGroup(group.id, { label: event.target.value })} placeholder="Field techs, PM, lead engineer" value={group.label} /></label>
                        <label><span>Travellers</span><InputNumber min={1} onChange={(value) => updateTravelGroup(group.id, { travelers: numberValue(value) })} value={group.travelers} /></label>
                  <label className="fortnox-quote-fit-control fortnox-quote-form-span-2"><span>Travel mode</span><Segmented onChange={(value) => updateTravelGroup(group.id, { mode: value as QuoteTravelMode })} options={[{ value: 'mileage', label: 'Mileage' }, { value: 'air', label: 'Air' }, { value: 'rail', label: 'Rail' }, { value: 'ferry', label: 'Ferry' }, { value: 'rental-car', label: 'Rental Car' }, { value: 'taxi', label: 'Taxi' }]} value={group.mode} /></label>
                        <BooleanChoice label="Bill travel time" onChange={(checked) => updateTravelGroup(group.id, { billTravelTime: checked })} value={group.billTravelTime} />
                        {group.billTravelTime ? (
                          <>
                            <label><span>Travel hours per traveller</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { travelHours: numberValue(value) })} value={group.travelHours} /></label>
                            <label><span>Travel rate multiplier</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { travelRateMultiplier: numberValue(value) })} precision={2} step={0.25} value={group.travelRateMultiplier} /></label>
                          </>
                        ) : null}
                        {group.mode === 'mileage' ? (
                          <>
                            <label><span>Total km</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { mileageKm: numberValue(value) })} value={group.mileageKm} /></label>
                            <label><span>Rate per km</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { mileageRate: numberValue(value) })} precision={2} value={group.mileageRate} /></label>
                          </>
                        ) : null}
                        {group.mode === 'air' || group.mode === 'rail' || group.mode === 'ferry' ? (
                          <>
                            <label><span>Tickets total</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { ticketCost: numberValue(value) })} precision={2} value={group.ticketCost} /></label>
                            <label><span>Baggage</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { baggageCost: numberValue(value) })} precision={2} value={group.baggageCost} /></label>
                            <label><span>Transfers</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { transferCost: numberValue(value) })} precision={2} value={group.transferCost} /></label>
                          </>
                        ) : null}
                        {group.mode === 'rental-car' ? (
                          <>
                            <label><span>Rental days</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { rentalDays: numberValue(value) })} value={group.rentalDays} /></label>
                            <label><span>Daily rate</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { rentalDayRate: numberValue(value) })} precision={2} value={group.rentalDayRate} /></label>
                            <label><span>Fuel / tolls / parking</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { fuelTolls: numberValue(value) })} precision={2} value={group.fuelTolls} /></label>
                          </>
                        ) : null}
                        {group.mode === 'taxi' ? <label><span>Taxi estimate</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { taxiCost: numberValue(value) })} precision={2} value={group.taxiCost} /></label> : null}
                        <BooleanChoice label="Overnight stay" onChange={(checked) => updateTravelGroup(group.id, { hotelRequired: checked })} value={group.hotelRequired} />
                        {group.hotelRequired ? (
                          <>
                            <label><span>Hotel nights</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { hotelNights: numberValue(value) })} value={group.hotelNights} /></label>
                            <label><span>Rate per night</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { hotelNightRate: numberValue(value) })} precision={2} value={group.hotelNightRate} /></label>
                            <label><span>Rooms</span><InputNumber min={1} onChange={(value) => updateTravelGroup(group.id, { hotelRooms: numberValue(value) })} value={group.hotelRooms} /></label>
                          </>
                        ) : null}
                        <BooleanChoice label="Per diem" onChange={(checked) => updateTravelGroup(group.id, { perDiemEnabled: checked })} value={group.perDiemEnabled} />
                        {group.perDiemEnabled ? (
                          <>
                            <label><span>Per diem days</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { perDiemDays: numberValue(value) })} value={group.perDiemDays} /></label>
                            <label><span>Per diem rate</span><InputNumber min={0} onChange={(value) => updateTravelGroup(group.id, { perDiemRate: numberValue(value) })} precision={2} value={group.perDiemRate} /></label>
                          </>
                        ) : null}
                      </div>
                    </section>
                  ))}
                  <div className="fortnox-quote-actions fortnox-quote-actions-inline">
                    <Button onClick={addTravelGroup}>Add Travel Group</Button>
                  </div>
                </>
              ) : null}
              <label className="fortnox-quote-form-span-2"><span>Travel notes to customer</span><TextArea onChange={(event) => setTravelCustomerNote(event.target.value)} placeholder="Optional customer-facing travel note, such as estimate basis, route assumptions, or attendance timing." rows={3} value={travelCustomerNote} /></label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="fortnox-quote-stack">
              <section className="fortnox-quote-subsection">
                <Typography.Text strong>Consumables</Typography.Text>
                <div className="fortnox-quote-form">
                  <label><span>Consumables total</span><InputNumber min={0} onChange={(value) => setConsumables(numberValue(value))} precision={2} value={consumables} /></label>
                  <label><span>Consumables notes</span><Input onChange={(event) => setConsumablesNote(event.target.value)} placeholder="Cables, connectors, labels, patch consumables" value={consumablesNote} /></label>
                </div>
              </section>
              <section className="fortnox-quote-subsection">
                <Typography.Text strong>Equipment Rental</Typography.Text>
                <div className="fortnox-quote-form">
                  <label><span>Rental item</span><Input onChange={(event) => setEquipmentLabel(event.target.value)} placeholder="Lift, tester, temporary rack" value={equipmentLabel} /></label>
                  <label><span>Rental days</span><InputNumber min={0} onChange={(value) => setEquipmentDays(numberValue(value))} value={equipmentDays} /></label>
                  <label><span>Rate per day</span><InputNumber min={0} onChange={(value) => setEquipmentRate(numberValue(value))} precision={2} value={equipmentRate} /></label>
                  <label><span>Rental notes</span><Input onChange={(event) => setEquipmentNote(event.target.value)} placeholder="Model, supplier, delivery assumptions" value={equipmentNote} /></label>
                </div>
              </section>
              <section className="fortnox-quote-subsection">
                <div className="fortnox-quote-subsection-head">
                  <Typography.Text strong>Other Costs</Typography.Text>
                  <Button onClick={addExtraItem} size="small">Add Cost Line</Button>
                </div>
                {extraItems.length ? (
                  <div className="fortnox-quote-stack">
                    {extraItems.map((item, index) => (
                      <div className="fortnox-quote-extra-item" key={item.id}>
                        <div className="fortnox-quote-subsection-head">
                          <Typography.Text>{item.label.trim() || `Cost line ${index + 1}`}</Typography.Text>
                          <Button onClick={() => removeExtraItem(item.id)} size="small">Remove</Button>
                        </div>
                        <div className="fortnox-quote-form">
                          <label><span>Description</span><Input onChange={(event) => updateExtraItem(item.id, { label: event.target.value })} placeholder="LC-LC fiber, Cat6 cable, ladder hire" value={item.label} /></label>
                          <label><span>Quantity</span><InputNumber min={0} onChange={(value) => updateExtraItem(item.id, { quantity: numberValue(value) })} value={item.quantity} /></label>
                          <label><span>Unit</span><Input onChange={(event) => updateExtraItem(item.id, { unit: event.target.value })} placeholder="pcs, m, days, lot" value={item.unit} /></label>
                          <label><span>Unit cost</span><InputNumber min={0} onChange={(value) => updateExtraItem(item.id, { unitCost: numberValue(value) })} precision={2} value={item.unitCost} /></label>
                          <div className="fortnox-quote-extra-total fortnox-quote-form-span-2">
                            <span>Line total</span>
                            <strong>{formatAmount(currency, extraItemSubtotal(item))}</strong>
                          </div>
                          <label><span>Notes</span><Input onChange={(event) => updateExtraItem(item.id, { note: event.target.value })} placeholder="Vendor, lead time, assumptions, model" value={item.note} /></label>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className="page-description">Add line items for materials, rentals, shipping, access fees, subcontractors, and similar pass-through costs.</div>}
              </section>
              <section className="fortnox-quote-subsection">
                <Typography.Text strong>Commercials</Typography.Text>
                <div className="page-description">Risk buffer is an optional allowance for uncertainty, small unknowns, or likely scope friction. Leave it at 0 if you do not want to pad the quote.</div>
                <div className="fortnox-quote-form">
                  <label><span>Markup on pass-through %</span><InputNumber min={0} onChange={(value) => setMarkupPercent(numberValue(value))} precision={2} value={markupPercent} /></label>
                  <label><span>Risk buffer %</span><InputNumber min={0} onChange={(value) => setContingencyPercent(numberValue(value))} precision={2} value={contingencyPercent} /></label>
                  <label><span>Discount %</span><InputNumber min={0} onChange={(value) => setDiscountPercent(numberValue(value))} precision={2} value={discountPercent} /></label>
                  <label><span>Quote validity days</span><InputNumber min={1} onChange={(value) => setQuoteValidityDays(numberValue(value))} value={quoteValidityDays} /></label>
                  <label><span>Bill-to entity</span><Input onChange={(event) => setBillToEntity(event.target.value)} placeholder="Legal billing entity, if known" value={billToEntity} /></label>
                  <label><span>VAT / tax ID</span><Input onChange={(event) => setVatNumber(event.target.value)} placeholder="VAT number, tax ID, or TBD" value={vatNumber} /></label>
                  <label className="fortnox-quote-form-span-2"><span>PO / payment requirement</span><Input onChange={(event) => setPoRequirement(event.target.value)} placeholder="PO required before dispatch, payment terms, invoice notes" value={poRequirement} /></label>
                </div>
              </section>
              <label className="fortnox-quote-form-span-2"><span>Extras notes to customer</span><TextArea onChange={(event) => setExtrasCustomerNote(event.target.value)} placeholder="Optional customer-facing note for materials, rentals, pass-through assumptions, or exclusions." rows={3} value={extrasCustomerNote} /></label>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="fortnox-quote-stack">
                <div className="review-info-grid">
                  <div className="info-field"><span>Customer</span><strong>{activeCustomer.name}</strong></div>
                  <div className="info-field"><span>Work location</span><strong>{workLocation || '-'}</strong></div>
                  <div className="info-field"><span>Service type</span><strong>{serviceType}</strong></div>
                  <div className="info-field"><span>Delivery</span><strong>{deliveryMode}</strong></div>
                  <div className="info-field"><span>Work packages</span><strong>{customerWorkPackages.length}</strong></div>
                  <div className="info-field"><span>Valid for</span><strong>{quoteValidityDays || 30} days</strong></div>
                  <div className="info-field"><span>Labor shape</span><strong>{billingModel}</strong></div>
                  <div className="info-field"><span>Rate basis</span><strong>{billingModel === 'fixed-fee' ? 'Fixed fee' : rateSource === 'manual' ? 'Manual rate' : `${selectedRateCardLocation ? getLocationLabel(selectedRateCardLocation) : '-'} · ${selectedPreset?.label || 'Unselected'}`}</strong></div>
                  {billingModel === 'callout-hourly' ? <div className="info-field"><span>08:00-18:00 minimum</span><strong>{formatAmount(currency, resolvedCallOut)}</strong></div> : null}
                  {billingModel === 'callout-hourly' ? <div className="info-field"><span>08:00-18:00 included</span><strong>{resolvedIncludedHours.toFixed(2)} h</strong></div> : null}
                {isSupportTariffQuote ? <div className="info-field"><span>18:00-08:00 rate</span><strong>{formatAmount(currency, obhPreviewRate)}</strong></div> : billingModel === 'hourly' || billingModel === 'callout-hourly' ? <div className="info-field"><span>OBH</span><strong>{obhLaborHours.toFixed(2)} h @ x{resolvedObhMultiplier.toFixed(2)}</strong></div> : null}
                {isSupportTariffQuote ? <div className="info-field"><span>18:00-08:00 minimum</span><strong>{formatAmount(currency, resolvedObhCallOut)}</strong></div> : null}
                {isSupportTariffQuote ? <div className="info-field"><span>18:00-08:00 included</span><strong>{resolvedObhIncludedHours.toFixed(2)} h</strong></div> : billingModel === 'callout-hourly' ? <div className="info-field"><span>OBH included</span><strong>{includedObhHours.toFixed(2)} h</strong></div> : null}
                {isSupportTariffQuote ? <div className="info-field"><span>Weekend rate</span><strong>{formatAmount(currency, weekendPreviewRate)}</strong></div> : billingModel === 'hourly' || billingModel === 'callout-hourly' ? <div className="info-field"><span>Weekend</span><strong>{weekendLaborHours.toFixed(2)} h @ x{resolvedWeekendMultiplier.toFixed(2)}</strong></div> : null}
                {isSupportTariffQuote ? <div className="info-field"><span>Weekend minimum</span><strong>{formatAmount(currency, resolvedWeekendCallOut)}</strong></div> : null}
                {isSupportTariffQuote ? <div className="info-field"><span>Weekend included</span><strong>{resolvedWeekendIncludedHours.toFixed(2)} h</strong></div> : billingModel === 'callout-hourly' ? <div className="info-field"><span>Weekend included</span><strong>{includedWeekendHours.toFixed(2)} h</strong></div> : null}
                </div>
              <label className="fortnox-quote-form-span-2">
                <span className="fortnox-quote-label-row">
                  <span>Assumptions / exclusions</span>
                  <Button onClick={() => setAssumptions(defaultQuoteAssumptions)} size="small" type="text">
                    Use Standard Terms
                  </Button>
                </span>
                <TextArea onChange={(event) => setAssumptions(event.target.value)} placeholder="Access provided, parking available, no out-of-hours unless approved..." rows={9} value={assumptions} />
              </label>
              <section className="fortnox-quote-doc">
                <div className="fortnox-quote-doc-head">
                  <div>
                    <Typography.Text strong>{quoteName || 'Untitled Quote'}</Typography.Text>
                    <div className="page-description">{activeCustomer.name}</div>
                  </div>
                  <div className="fortnox-quote-actions fortnox-quote-actions-inline">
                    <Button onClick={() => { void saveCustomerQuotePdfAs() }}>Save PDF As...</Button>
                    <Button onClick={() => { void printCustomerQuote() }}>Print Quote</Button>
                  </div>
                </div>
                <div className="review-info-grid">
                  {customerDocumentBasics.map((item) => (
                    <div className="info-field" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Scope Summary</Typography.Text>
                  <div className="create-job-note-copy fortnox-quote-summary-copy">{summaryText || 'No summary provided yet.'}</div>
                </section>
                {customerWorkPackages.length ? (
                  <section className="fortnox-quote-doc-section">
                    <Typography.Text strong>Work Packages</Typography.Text>
                    <table className="fortnox-quote-doc-table fortnox-quote-package-table">
                      <colgroup>
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '34%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Package</th>
                          <th>Route / Site</th>
                          <th>Timing</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerWorkPackages.map((item) => (
                          <tr key={item.id}>
                            <td><strong>{item.title}</strong><br />{item.type}</td>
                            <td>{item.route}</td>
                            <td>{item.timing}<br />{item.serviceWindow}</td>
                            <td>{item.technicians === '-' ? '-' : `${item.technicians} tech${item.technicians === '1' ? '' : 's'}`}<br />{item.details.join(' · ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ) : null}
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Labor</Typography.Text>
                  {customerLaborDetails.length ? (
                    <ul className="fortnox-quote-doc-list">
                      {customerLaborDetails.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : null}
                  {customerLaborTariffRows.length ? (
                    <table className="fortnox-quote-doc-table">
                      <colgroup>
                        <col style={{ width: '31%' }} />
                        <col style={{ width: '23%' }} />
                        <col style={{ width: '23%' }} />
                        <col style={{ width: '23%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Window</th>
                          <th>Hourly Rate</th>
                          <th>Call Out</th>
                          <th>Included Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerLaborTariffRows.map((row) => (
                          <tr key={row.window}>
                            <td>{row.window}</td>
                            <td>{row.hourlyRate}</td>
                            <td>{row.callOut}</td>
                            <td>{row.includedHours}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {laborCustomerNote ? <div className="create-job-note-copy fortnox-quote-summary-copy">{laborCustomerNote}</div> : null}
                </section>
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Travel & Stay</Typography.Text>
                  {customerTravelGroups.length ? customerTravelGroups.map((group) => (
                    <div className="fortnox-quote-doc-group" key={group.title}>
                      <Typography.Text>{group.title}</Typography.Text>
                      <ul className="fortnox-quote-doc-list">
                        {group.details.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  )) : <div className="page-description">No travel or overnight costs included.</div>}
                  {travelCustomerNote ? <div className="create-job-note-copy fortnox-quote-summary-copy">{travelCustomerNote}</div> : null}
                </section>
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Extras</Typography.Text>
                  {customerExtras.length ? (
                    <ul className="fortnox-quote-doc-list">
                      {customerExtras.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : <div className="page-description">No extras included.</div>}
                  {extrasCustomerNote ? <div className="create-job-note-copy fortnox-quote-summary-copy">{extrasCustomerNote}</div> : null}
                </section>
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Price Summary</Typography.Text>
                  <div className="fortnox-quote-lines">
                    {summaryLines.map((entry) => (
                      <div className="fortnox-quote-line" key={entry.label}>
                        <span>{entry.label}</span>
                        <strong>{formatAmount(currency, entry.amount)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="fortnox-quote-total">
                    <span>Quote Total</span>
                    <strong>{formatAmount(currency, grandTotal)}</strong>
                  </div>
                </section>
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Assumptions / Exclusions</Typography.Text>
                  <div className="create-job-note-copy fortnox-quote-summary-copy">{assumptions || 'No assumptions added yet.'}</div>
                </section>
              </section>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="fortnox-quote-stack">
              <section className="fortnox-quote-subsection">
                <Typography.Text strong>Technician Cost Basis</Typography.Text>
                <div className="fortnox-quote-form">
                  <label className="fortnox-quote-fit-control"><span>Tech cost source</span><Segmented onChange={(value) => setTechCostSource(value as QuoteTechCostSource)} options={[{ value: 'manual', label: 'Manual rate' }, { value: 'saved', label: 'Saved tech rate' }]} value={techCostSource} /></label>
                  {techCostSource === 'manual' ? <label><span>Tech pay rate per hour</span><InputNumber min={0} onChange={(value) => setManualTechPayRate(numberValue(value))} precision={2} value={manualTechPayRate} /></label> : null}
                  {techCostSource === 'saved' ? (
                    <>
                      <label><span>Technician</span><Select onChange={setTechnicianCostId} options={savedTechnicians.map((tech) => ({ value: tech.id, label: tech.name }))} value={technicianCostId || undefined} /></label>
                      <div className="info-field fortnox-quote-inline-info"><span>Saved pay rate</span><strong>{savedTechPayRate != null ? formatAmount(currency, savedTechPayRate) : 'Not found'}</strong></div>
                    </>
                  ) : null}
                </div>
              </section>
              <section className="fortnox-quote-subsection">
                <Typography.Text strong>Margin Check</Typography.Text>
                {!hasTechCostBasis ? <Alert message="Set a technician cost basis to calculate margin." type="info" /> : null}
                <div className="review-info-grid">
                  <div className="info-field"><span>Billed labor</span><strong>{formatAmount(currency, laborSubtotal)}</strong></div>
                  <div className="info-field"><span>Estimated tech labor cost</span><strong>{hasTechCostBasis ? formatAmount(currency, estimatedLaborTechCost) : '-'}</strong></div>
                  <div className="info-field"><span>Billed travel time</span><strong>{formatAmount(currency, travelTimeTotal)}</strong></div>
                  <div className="info-field"><span>Estimated travel time cost</span><strong>{hasTechCostBasis ? formatAmount(currency, estimatedTravelTimeCost) : '-'}</strong></div>
                  <div className="info-field"><span>Labor margin</span><strong>{hasTechCostBasis ? `${formatAmount(currency, laborMargin)} · ${laborMarginPercent.toFixed(2)}%` : '-'}</strong></div>
                  <div className="info-field"><span>Total margin</span><strong>{hasTechCostBasis ? `${formatAmount(currency, totalMargin)} · ${totalMarginPercent.toFixed(2)}%` : '-'}</strong></div>
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>

      <aside className="fortnox-quote-sidebar">
        <section className="fortnox-quote-panel">
          <div className="toolbar-row">
          <Typography.Text strong>{quoteName || 'Untitled Quote'}</Typography.Text>
          <span className="toolbar-count">{currency}</span>
          </div>
          <div className="review-info-grid">
            <div className="info-field"><span>Workload</span><strong>{isSupportTariffQuote ? 'Single technician tariff quote' : usesHourlyBuckets ? `${technicians} tech · ${standardLaborHours.toFixed(2)} std h${obhLaborHours > 0 ? ` · ${obhLaborHours.toFixed(2)} obh` : ''}${weekendLaborHours > 0 ? ` · ${weekendLaborHours.toFixed(2)} wknd` : ''}` : `${days} days · ${dayHours.toFixed(2)} h/day · ${technicians} tech`}</strong></div>
            <div className="info-field"><span>Packages</span><strong>{customerWorkPackages.length || '-'}</strong></div>
            <div className="info-field"><span>Labor hours</span><strong>{isSupportTariffQuote ? '-' : `${laborHours.toFixed(2)} h`}</strong></div>
            <div className="info-field"><span>Selected rate</span><strong>{billingModel === 'fixed-fee' ? formatAmount(currency, fixedFee || 0) : formatAmount(currency, resolvedRate)}</strong></div>
            <div className="info-field"><span>08:00-18:00 min.</span><strong>{billingModel === 'callout-hourly' ? formatAmount(currency, resolvedCallOut) : '-'}</strong></div>
            <div className="info-field"><span>08:00-18:00 included</span><strong>{billingModel === 'callout-hourly' ? `${resolvedIncludedHours.toFixed(2)} h` : '-'}</strong></div>
            <div className="info-field"><span>{isSupportTariffQuote ? '18:00-08:00' : 'OBH'}</span><strong>{isSupportTariffQuote ? formatAmount(currency, obhPreviewRate) : usesHourlyBuckets ? `${obhLaborHours.toFixed(2)} h @ x${resolvedObhMultiplier.toFixed(2)}` : '-'}</strong></div>
            <div className="info-field"><span>{isSupportTariffQuote ? '18:00-08:00 incl.' : 'OBH included'}</span><strong>{billingModel === 'callout-hourly' ? `${(isSupportTariffQuote ? resolvedObhIncludedHours : includedObhHours).toFixed(2)} h` : '-'}</strong></div>
            <div className="info-field"><span>{isSupportTariffQuote ? '18:00-08:00 min.' : 'OBH min.'}</span><strong>{billingModel === 'callout-hourly' ? formatAmount(currency, resolvedObhCallOut) : '-'}</strong></div>
            <div className="info-field"><span>Weekend</span><strong>{isSupportTariffQuote ? formatAmount(currency, weekendPreviewRate) : usesHourlyBuckets ? `${weekendLaborHours.toFixed(2)} h @ x${resolvedWeekendMultiplier.toFixed(2)}` : '-'}</strong></div>
            <div className="info-field"><span>Weekend incl.</span><strong>{billingModel === 'callout-hourly' ? `${(isSupportTariffQuote ? resolvedWeekendIncludedHours : includedWeekendHours).toFixed(2)} h` : '-'}</strong></div>
            <div className="info-field"><span>Weekend min.</span><strong>{billingModel === 'callout-hourly' ? formatAmount(currency, resolvedWeekendCallOut) : '-'}</strong></div>
            <div className="info-field"><span>Saved quotes</span><strong>{customerQuotes.length}</strong></div>
            <div className="info-field"><span>Document status</span><strong>{activeQuoteId ? 'Saved quote loaded' : 'Working draft'}</strong></div>
          </div>
        </section>
        <section className="fortnox-quote-panel">
          <Typography.Text strong>Cost Summary</Typography.Text>
          <div className="fortnox-quote-lines">
            {summaryLines.length ? summaryLines.map((entry) => (
              <div className="fortnox-quote-line" key={entry.label}>
                <span>{entry.label}</span>
                <strong>{formatAmount(currency, entry.amount)}</strong>
              </div>
            )) : <Typography.Text className="page-description">Start answering the steps to build the quote.</Typography.Text>}
          </div>
          <div className="fortnox-quote-total">
            <span>Quote Total</span>
            <strong>{formatAmount(currency, grandTotal)}</strong>
          </div>
        </section>
        <section className="fortnox-quote-panel">
          <Typography.Text strong>Quote Summary</Typography.Text>
          <div className="create-job-note-copy fortnox-quote-summary-copy">{summaryText || 'No free-text summary added yet.'}</div>
          <div className="create-job-note-copy fortnox-quote-summary-copy">{detailSummary || 'No travel or extras detail added yet.'}</div>
          <div className="create-job-note-copy fortnox-quote-summary-copy">{assumptions || 'No assumptions added yet.'}</div>
        </section>
      </aside>
    </div>
  )
}
