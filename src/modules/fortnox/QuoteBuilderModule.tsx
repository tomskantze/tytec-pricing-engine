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
  createTravelGroup,
  defaultQuoteAssumptions,
  type QuoteBillingModel,
  type QuoteDeliveryMode,
  type QuoteDraft,
  type QuoteExtraItem,
  type QuoteRateSource,
  type QuoteTechCostSource,
  type QuoteTravelGroup,
  type QuoteTravelMode,
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
}
type SummaryLine = { label: string; amount: number }

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
  onDeleteQuote,
  onQuoteLoaded,
  onSaveQuote,
  requestedQuoteId,
  savedQuotes,
}: {
  customer: Customer | null
  onDeleteQuote: (quoteId: string) => void
  onQuoteLoaded?: (quoteId: string) => void
  onSaveQuote: (quote: SavedQuote) => void
  requestedQuoteId?: string
  savedQuotes: SavedQuote[]
}) {
  const activeCustomer = customer ?? null
  const customerQuotes = useMemo(
    () => savedQuotes
      .filter((quote) => !activeCustomer || quote.customerKey === activeCustomer.customerKey)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
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
  const [workLocation, setWorkLocation] = useState('')
  const [currency, setCurrency] = useState(customerDefaults.currency)
  const [deliveryMode, setDeliveryMode] = useState<QuoteDeliveryMode>('Onsite')
  const [serviceType, setServiceType] = useState('Break-fix')
  const [technicianCount, setTechnicianCount] = useState<number | null>(1)
  const [workDays, setWorkDays] = useState<number | null>(1)
  const [hoursPerDay, setHoursPerDay] = useState<number | null>(4)
  const [billingModel, setBillingModel] = useState<QuoteBillingModel>('hourly')
  const [rateSource, setRateSource] = useState<QuoteRateSource>('preset')
  const [rateCardLocationId, setRateCardLocationId] = useState(customerDefaults.rateCardLocationId)
  const [presetRateId, setPresetRateId] = useState('')
  const [manualRate, setManualRate] = useState<number | null>(null)
  const [manualCallOutFee, setManualCallOutFee] = useState<number | null>(null)
  const [fixedFee, setFixedFee] = useState<number | null>(null)
  const [techCostSource, setTechCostSource] = useState<QuoteTechCostSource>('manual')
  const [technicianCostId, setTechnicianCostId] = useState('')
  const [manualTechPayRate, setManualTechPayRate] = useState<number | null>(null)
  const [travelRequired, setTravelRequired] = useState(true)
  const [travelGroups, setTravelGroups] = useState<QuoteTravelGroup[]>([createTravelGroup(1)])
  const [consumables, setConsumables] = useState<number | null>(0)
  const [consumablesNote, setConsumablesNote] = useState('')
  const [equipmentLabel, setEquipmentLabel] = useState('')
  const [equipmentDays, setEquipmentDays] = useState<number | null>(0)
  const [equipmentRate, setEquipmentRate] = useState<number | null>(0)
  const [equipmentNote, setEquipmentNote] = useState('')
  const [extraItems, setExtraItems] = useState<QuoteExtraItem[]>([])
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

  useEffect(() => {
    if (!activeCustomer) return
    setDraftReady(false)
    const defaults = {
      currency: activeCustomer.locationCards[0]?.currency || 'EUR',
      rateCardLocationId: activeCustomer.locationCards[0]?.id || '',
      customerKey: activeCustomer.customerKey,
      quoteRef: nextQuoteRefForCustomer(activeCustomer.customerKey, customerQuotes),
    }
    const storedSession = loadQuoteDraftSession(activeCustomer.customerKey, defaults)
    if (storedSession) {
      applyDraft(storedSession.draft, storedSession.activeQuoteId, storedSession.step)
    } else {
      applyDraft(createQuoteDraftDefaults(defaults), '', 0)
    }
    setDraftReady(true)
  }, [activeCustomer?.customerKey, customerQuotes])

  useEffect(() => {
    if (!requestedQuoteId) return
    const quote = customerQuotes.find((item) => item.id === requestedQuoteId)
    if (!quote) return
    applyDraft(quote.draft, quote.id, 0)
    onQuoteLoaded?.(quote.id)
  }, [customerQuotes, onQuoteLoaded, requestedQuoteId])

  useEffect(() => {
    if (rateSource === 'preset' && selectedRateCardLocation?.currency) setCurrency(selectedRateCardLocation.currency)
  }, [rateSource, selectedRateCardLocation])

  useEffect(() => {
    if (deliveryMode === 'Remote') {
      setTravelRequired(false)
    }
  }, [deliveryMode])

  useEffect(() => {
    if (!selectedPreset && visiblePresets[0]) setPresetRateId(visiblePresets[0].id)
    if (selectedPreset && !visiblePresets.some((preset) => preset.id === selectedPreset.id)) {
      setPresetRateId(visiblePresets[0]?.id || '')
    }
  }, [selectedPreset, visiblePresets])

  const technicians = technicianCount || 0
  const days = workDays || 0
  const dayHours = hoursPerDay || 0
  const laborHours = technicians * days * dayHours
  const resolvedRate = rateSource === 'manual' ? (manualRate || 0) : (selectedPreset?.rate || 0)
  const resolvedCallOut = billingModel === 'callout-hourly'
    ? (rateSource === 'manual' ? (manualCallOutFee || 0) : (selectedPreset?.callOutFee || 0))
    : 0
  const hasTechCostBasis = techCostSource === 'saved' ? savedTechPayRate != null : manualTechPayRate != null
  const resolvedTechPayRate = hasTechCostBasis
    ? (techCostSource === 'saved' ? (savedTechPayRate || 0) : (manualTechPayRate || 0))
    : 0

  const laborSubtotal = useMemo(() => {
    if (billingModel === 'fixed-fee') return fixedFee || 0
    if (billingModel === 'full-day') return technicians * days * resolvedRate
    const hourlyAmount = laborHours * resolvedRate
    return billingModel === 'callout-hourly' ? hourlyAmount + (technicians * days * resolvedCallOut) : hourlyAmount
  }, [billingModel, days, fixedFee, laborHours, resolvedCallOut, resolvedRate, technicians])
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
      line(billingModel === 'fixed-fee' ? 'Fixed fee labor' : 'Labor', laborSubtotal),
      ...travelLineItems,
      line(consumablesNote.trim() || 'Consumables', consumablesSubtotal),
      line(equipmentLabel.trim() || 'Equipment rental', equipmentSubtotal),
      ...extraItemLines.map((item) => ({ label: item.label, amount: item.amount })),
      line('Pass-through markup', markupAmount),
      line('Risk buffer', contingencyAmount),
      discountAmount > 0 ? { label: 'Discount', amount: -discountAmount } : null,
    ].filter(Boolean) as SummaryLine[]
  ), [billingModel, contingencyAmount, consumablesNote, consumablesSubtotal, discountAmount, equipmentLabel, equipmentSubtotal, extraItemLines, laborSubtotal, markupAmount, travelLineItems])

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

  const stepItems = [{ title: 'Basics' }, { title: 'Labor' }, { title: 'Travel' }, { title: 'Extras' }, { title: 'Review' }, { title: 'Margin' }]

  const customerDocumentBasics = [
    { label: 'Customer', value: activeCustomer?.name || '-' },
    { label: 'Work location', value: workLocation || '-' },
    { label: 'Service type', value: serviceType },
    { label: 'Delivery mode', value: deliveryMode },
    { label: 'Quote currency', value: currency },
  ]
  const customerLaborDetails = [
    `Technicians: ${technicians}`,
    `Work days: ${days}`,
    `Hours per day: ${dayHours.toFixed(2)}`,
    `Labor hours: ${laborHours.toFixed(2)}`,
    `Billing model: ${billingModel}`,
    billingModel === 'fixed-fee'
      ? `Fixed fee: ${formatAmount(currency, fixedFee || 0)}`
      : `Rate basis: ${rateSource === 'manual' ? 'Manual rate' : `${selectedRateCardLocation ? getLocationLabel(selectedRateCardLocation) : '-'} · ${selectedPreset?.label || 'Unselected'}`}`,
    billingModel !== 'fixed-fee'
      ? `Selected rate: ${formatAmount(currency, resolvedRate)}`
      : '',
    billingModel === 'callout-hourly'
      ? `Call-out fee: ${formatAmount(currency, resolvedCallOut)}`
      : '',
    `Labor subtotal: ${formatAmount(currency, laborSubtotal)}`,
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
      workLocation,
      currency,
      deliveryMode,
      serviceType,
      technicianCount,
      workDays,
      hoursPerDay,
      billingModel,
      rateSource,
      rateCardLocationId,
      presetRateId,
      manualRate,
      manualCallOutFee,
      fixedFee,
      techCostSource,
      technicianCostId,
      manualTechPayRate,
      travelRequired,
      travelGroups,
      consumables,
      consumablesNote,
      equipmentLabel,
      equipmentDays,
      equipmentRate,
      equipmentNote,
      extraItems,
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
    setWorkLocation(draft.workLocation)
    setCurrency(draft.currency)
    setDeliveryMode(draft.deliveryMode)
    setServiceType(draft.serviceType)
    setTechnicianCount(draft.technicianCount)
    setWorkDays(draft.workDays)
    setHoursPerDay(draft.hoursPerDay)
    setBillingModel(draft.billingModel)
    setRateSource(draft.rateSource)
    setRateCardLocationId(draft.rateCardLocationId)
    setPresetRateId(draft.presetRateId)
    setManualRate(draft.manualRate)
    setManualCallOutFee(draft.manualCallOutFee)
    setFixedFee(draft.fixedFee)
    setTechCostSource(draft.techCostSource)
    setTechnicianCostId(draft.technicianCostId)
    setManualTechPayRate(draft.manualTechPayRate)
    setTravelRequired(draft.travelRequired)
    setTravelGroups(draft.travelGroups.length ? draft.travelGroups : [createTravelGroup(1)])
    setConsumables(draft.consumables)
    setConsumablesNote(draft.consumablesNote)
    setEquipmentLabel(draft.equipmentLabel)
    setEquipmentDays(draft.equipmentDays)
    setEquipmentRate(draft.equipmentRate)
    setEquipmentNote(draft.equipmentNote)
    setExtraItems(draft.extraItems || [])
    setMarkupPercent(draft.markupPercent)
    setDiscountPercent(draft.discountPercent)
    setContingencyPercent(draft.contingencyPercent)
    setSummaryText(draft.summaryText)
    setAssumptions(draft.assumptions)
  }

  function resetDraft() {
    applyDraft(createQuoteDraftDefaults({
      currency: activeCustomer?.locationCards[0]?.currency || 'EUR',
      rateCardLocationId: activeCustomer?.locationCards[0]?.id || '',
      customerKey: activeCustomer?.customerKey || '',
      quoteRef: nextQuoteRefForCustomer(activeCustomer?.customerKey || '', customerQuotes),
    }), '', 0)
  }

  function buildSavedQuote(overrides?: Partial<SavedQuote>): SavedQuote | null {
    if (!activeCustomer) return null
    const now = new Date().toISOString()
    const quoteId = activeQuoteId || `quote-${Date.now()}`
    const generatedRef = quoteRef.trim() || nextQuoteRefForCustomer(activeCustomer.customerKey, customerQuotes, quoteId)
    const nextQuoteRef = uniqueQuoteRef(generatedRef, quoteId, customerQuotes)
    return {
      id: quoteId,
      customerKey: activeCustomer.customerKey,
      quoteRef: nextQuoteRef,
      quoteName: quoteName.trim() || 'Untitled Quote',
      currency,
      grandTotal,
      updatedAt: now,
      customerPdf: overrides?.customerPdf,
      draft: captureDraft(),
      ...overrides,
    }
  }

  function saveCurrentQuote() {
    const nextQuote = buildSavedQuote()
    if (!nextQuote) return
    onSaveQuote(nextQuote)
    setActiveQuoteId(nextQuote.id)
    setQuoteRef(nextQuote.quoteRef)
  }

  async function exportCustomerQuotePdf() {
    const nextQuote = buildSavedQuote()
    if (!nextQuote) return
    const html = customerQuoteHtml()
    const safeName = safeDocumentName(nextQuote.quoteRef || nextQuote.quoteName || 'Quote')
    const api = desktopWindow()
    if (!api?.savePdfFromHtml) {
      downloadText(`${safeName}.html`, 'text/html;charset=utf-8', html)
      return
    }
    const savedPdf = await api.savePdfFromHtml({
      id: `quote-pdf-${nextQuote.id}`,
      fileName: `${safeName}.pdf`,
      html,
    })
    const exportedQuote: SavedQuote = {
      ...nextQuote,
      customerPdf: savedPdf.storedPath ? {
        fileName: `${safeName}.pdf`,
        previewUrl: savedPdf.previewUrl || undefined,
        storedPath: savedPdf.storedPath || undefined,
        exportedAt: new Date().toISOString(),
      } : undefined,
    }
    onSaveQuote(exportedQuote)
    setActiveQuoteId(exportedQuote.id)
    setQuoteRef(exportedQuote.quoteRef)
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
      serviceType,
      deliveryMode,
      summaryText,
      assumptions,
      basics: customerDocumentBasics,
      laborDetails: customerLaborDetails,
      travelGroups: customerTravelGroups,
      extras: customerExtras,
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
      quoteName,
      workLocation,
      currency,
      deliveryMode,
      serviceType,
      technicianCount,
      workDays,
      hoursPerDay,
      billingModel,
      rateSource,
      rateCardLocationId,
      presetRateId,
      manualRate,
      manualCallOutFee,
      fixedFee,
      techCostSource,
      technicianCostId,
      manualTechPayRate,
      travelRequired,
      travelGroups,
      consumables,
      consumablesNote,
      equipmentLabel,
      equipmentDays,
      equipmentRate,
      equipmentNote,
      extraItems,
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

  if (!activeCustomer) return <Alert message="Select a customer to start a quote." type="info" />

  return (
    <div className="fortnox-quote-layout">
      <div className="fortnox-quote-main">
        <section className="fortnox-quote-panel">
          <div className="fortnox-quote-library fortnox-quote-actions-only">
            <div className="fortnox-quote-actions fortnox-quote-actions-inline">
              <Button onClick={resetDraft}>New Quote</Button>
              <Button onClick={saveCurrentQuote} type="primary">Save Quote</Button>
              <Button onClick={() => { void exportCustomerQuotePdf() }}>Store PDF</Button>
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
              <label><span>Customer location</span><Select allowClear onChange={(value) => setWorkLocation(value || '')} options={customerLocationOptions} placeholder="Pick a saved customer site" showSearch value={customerLocationOptions.some((option) => option.value === workLocation) ? workLocation : undefined} /></label>
              <label><span>Work location</span><Input onChange={(event) => setWorkLocation(event.target.value)} placeholder="Any site, city, country, or custom location" value={workLocation} /></label>
              <label><span>Currency</span><Select onChange={setCurrency} options={['SEK', 'EUR', 'NOK', 'DKK', 'USD', 'GBP'].map((value) => ({ value, label: value }))} value={currency} /></label>
              <label className="fortnox-quote-fit-control"><span>Delivery mode</span><Segmented onChange={(value) => setDeliveryMode(value as QuoteDeliveryMode)} options={['Onsite', 'Remote', 'Mixed']} value={deliveryMode} /></label>
              <label><span>Service type</span><Select onChange={setServiceType} options={['BAU', 'Break-fix', 'Survey', 'IMAC', 'Install', 'Project work', 'Standby support'].map((value) => ({ value, label: value }))} value={serviceType} /></label>
              <label><span>Technicians</span><InputNumber min={1} onChange={(value) => setTechnicianCount(numberValue(value))} value={technicianCount} /></label>
              <label><span>Work days</span><InputNumber min={0} onChange={(value) => setWorkDays(numberValue(value))} value={workDays} /></label>
              <label><span>Hours per day</span><InputNumber min={0} onChange={(value) => setHoursPerDay(numberValue(value))} value={hoursPerDay} /></label>
              <label className="fortnox-quote-form-span-2"><span>Scope Summary</span><TextArea onChange={(event) => setSummaryText(event.target.value)} placeholder="Describe the planned work, deliverables, customer environment, and any special handling." rows={5} value={summaryText} /></label>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="fortnox-quote-form">
              {billingModel !== 'fixed-fee' ? <label className="fortnox-quote-fit-control"><span>Rate source</span><Segmented onChange={(value) => setRateSource(value as QuoteRateSource)} options={[{ value: 'preset', label: 'Saved rate card' }, { value: 'manual', label: 'Manual' }]} value={rateSource} /></label> : null}
              <label className="fortnox-quote-fit-control"><span>Billing model</span><Segmented onChange={(value) => setBillingModel(value as QuoteBillingModel)} options={[{ value: 'hourly', label: 'Hourly' }, { value: 'callout-hourly', label: 'Call-out + Hourly' }, { value: 'full-day', label: 'Full day' }, { value: 'fixed-fee', label: 'Fixed fee' }]} value={billingModel} /></label>
              {billingModel === 'fixed-fee' ? <label><span>Fixed fee</span><InputNumber min={0} onChange={(value) => setFixedFee(numberValue(value))} precision={2} value={fixedFee} /></label> : null}
              {billingModel !== 'fixed-fee' && rateSource === 'preset' ? (
                <>
                  <label><span>Rate card location</span><Select onChange={setRateCardLocationId} options={activeCustomer.locationCards.map((location) => ({ value: location.id, label: getLocationLabel(location) }))} value={selectedRateCardLocation?.id} /></label>
                  <label><span>Rate preset</span><Select onChange={setPresetRateId} options={visiblePresets.map((preset) => ({ value: preset.id, label: `${preset.label} · ${formatAmount(currency, preset.rate)}` }))} value={selectedPreset?.id} /></label>
                </>
              ) : null}
              {billingModel !== 'fixed-fee' && rateSource === 'manual' ? <label><span>{billingModel === 'full-day' ? 'Manual day rate' : 'Manual hourly rate'}</span><InputNumber min={0} onChange={(value) => setManualRate(numberValue(value))} precision={2} value={manualRate} /></label> : null}
              {billingModel === 'callout-hourly' && rateSource === 'manual' ? <label><span>Manual call-out fee</span><InputNumber min={0} onChange={(value) => setManualCallOutFee(numberValue(value))} precision={2} value={manualCallOutFee} /></label> : null}
              {billingModel !== 'fixed-fee' && rateSource === 'preset' && !visiblePresets.length ? <Alert message="No matching saved rates found for this billing model. Switch to Manual or pick another rate card location." type="warning" /> : null}
            </div>
          ) : null}

          {step === 2 ? (
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
            </div>
          ) : null}

          {step === 3 ? (
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
                </div>
              </section>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="fortnox-quote-stack">
              <div className="review-info-grid">
                <div className="info-field"><span>Customer</span><strong>{activeCustomer.name}</strong></div>
                <div className="info-field"><span>Work location</span><strong>{workLocation || '-'}</strong></div>
                <div className="info-field"><span>Service type</span><strong>{serviceType}</strong></div>
                <div className="info-field"><span>Delivery</span><strong>{deliveryMode}</strong></div>
                <div className="info-field"><span>Labor shape</span><strong>{billingModel}</strong></div>
                <div className="info-field"><span>Rate basis</span><strong>{billingModel === 'fixed-fee' ? 'Fixed fee' : rateSource === 'manual' ? 'Manual rate' : `${selectedRateCardLocation ? getLocationLabel(selectedRateCardLocation) : '-'} · ${selectedPreset?.label || 'Unselected'}`}</strong></div>
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
                    <Button onClick={() => { void exportCustomerQuotePdf() }}>Store PDF</Button>
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
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Labor</Typography.Text>
                  <ul className="fortnox-quote-doc-list">
                    {customerLaborDetails.map((item) => <li key={item}>{item}</li>)}
                  </ul>
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
                </section>
                <section className="fortnox-quote-doc-section">
                  <Typography.Text strong>Extras</Typography.Text>
                  {customerExtras.length ? (
                    <ul className="fortnox-quote-doc-list">
                      {customerExtras.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  ) : <div className="page-description">No extras included.</div>}
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

          {step === 5 ? (
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
            <div className="info-field"><span>Workload</span><strong>{days} days · {dayHours.toFixed(2)} h/day · {technicians} tech</strong></div>
            <div className="info-field"><span>Labor hours</span><strong>{laborHours.toFixed(2)} h</strong></div>
            <div className="info-field"><span>Selected rate</span><strong>{billingModel === 'fixed-fee' ? formatAmount(currency, fixedFee || 0) : formatAmount(currency, resolvedRate)}</strong></div>
            <div className="info-field"><span>Call-out</span><strong>{billingModel === 'callout-hourly' ? formatAmount(currency, resolvedCallOut) : '-'}</strong></div>
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
