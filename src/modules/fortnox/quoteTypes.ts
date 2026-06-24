export type QuoteDeliveryMode = 'Onsite' | 'Remote' | 'Mixed'
export type QuoteBillingModel = 'hourly' | 'callout-hourly' | 'full-day' | 'fixed-fee'
export type QuoteTravelMode = 'mileage' | 'air' | 'rail' | 'ferry' | 'rental-car' | 'taxi'
export type QuoteRateSource = 'preset' | 'manual'
export type QuoteTechCostSource = 'manual' | 'saved'

export type QuoteTravelGroup = {
  id: string
  label: string
  travelers: number | null
  mode: QuoteTravelMode
  billTravelTime: boolean
  travelHours: number | null
  travelRateMultiplier: number | null
  mileageKm: number | null
  mileageRate: number | null
  ticketCost: number | null
  baggageCost: number | null
  transferCost: number | null
  rentalDays: number | null
  rentalDayRate: number | null
  fuelTolls: number | null
  taxiCost: number | null
  hotelRequired: boolean
  hotelNights: number | null
  hotelNightRate: number | null
  hotelRooms: number | null
  perDiemEnabled: boolean
  perDiemDays: number | null
  perDiemRate: number | null
}

export type QuoteExtraItem = {
  id: string
  label: string
  quantity: number | null
  unit: string
  unitCost: number | null
  note: string
}

export type QuoteDraft = {
  quoteRef: string
  quoteName: string
  workLocation: string
  currency: string
  deliveryMode: QuoteDeliveryMode
  serviceType: string
  technicianCount: number | null
  workDays: number | null
  hoursPerDay: number | null
  obhHours: number | null
  obhMultiplier: number | null
  weekendHours: number | null
  weekendMultiplier: number | null
  billingModel: QuoteBillingModel
  rateSource: QuoteRateSource
  rateCardLocationId: string
  presetRateId: string
  manualRate: number | null
  manualCallOutFee: number | null
  manualObhCallOutFee: number | null
  manualWeekendCallOutFee: number | null
  manualIncludedHours: number | null
  manualObhIncludedHours: number | null
  manualWeekendIncludedHours: number | null
  laborCustomerNote: string
  fixedFee: number | null
  techCostSource: QuoteTechCostSource
  technicianCostId: string
  manualTechPayRate: number | null
  travelRequired: boolean
  travelGroups: QuoteTravelGroup[]
  travelCustomerNote: string
  consumables: number | null
  consumablesNote: string
  equipmentLabel: string
  equipmentDays: number | null
  equipmentRate: number | null
  equipmentNote: string
  extraItems: QuoteExtraItem[]
  extrasCustomerNote: string
  otherCostLabel: string
  otherCost: number | null
  otherCostNote: string
  markupPercent: number | null
  discountPercent: number | null
  contingencyPercent: number | null
  summaryText: string
  assumptions: string
}

export type SavedQuote = {
  id: string
  customerKey: string
  customerName: string
  quoteRef: string
  quoteName: string
  currency: string
  grandTotal: number
  updatedAt: string
  customerPdf?: {
    fileName: string
    previewUrl?: string
    storedPath?: string
    exportedAt: string
  }
  draft: QuoteDraft
}

export type QuoteDraftSession = {
  activeQuoteId: string
  step: number
  draft: QuoteDraft
}

function createDefaultQuoteRef(customerKey?: string) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${(customerKey || 'QUOTE').toUpperCase()}-Q${yy}${mm}${dd}-01`
}

export const defaultQuoteAssumptions = [
  'Quoted pricing assumes reasonable and timely access to the data center, MMRs, cages, racks, power, and any customer-managed systems or consoles required to complete the work.',
  'Any site delays outside Tytec control, including but not limited to access restrictions, escort delays, permit issues, missing parts, unavailable equipment, blocked work areas, delivery delays, customs delays, or customer/vendor readiness issues, may extend the visit and will be billed accordingly.',
  'Time spent on site, including waiting time caused by access or readiness issues, is billable.',
  'If the scope changes after dispatch or while work is in progress, Tytec reserves the right to requote or bill additional labor, travel, materials, rentals, and standby time as applicable.',
  'Quoted travel, accommodation, per diem, rental, and pass-through costs are estimates unless explicitly stated otherwise and may be adjusted to actuals where agreed.',
  'Customer is responsible for ensuring that all required hardware, deliveries, remote hands authorizations, and points of contact are available at the scheduled time.',
  'Work not explicitly included in the quoted scope is excluded.',
].join('\n\n')

export function createTravelGroup(index: number): QuoteTravelGroup {
  return {
    id: `travel-group-${Date.now()}-${index}`,
    label: `Travel group ${index}`,
    travelers: 1,
    mode: 'mileage',
    billTravelTime: false,
    travelHours: 2,
    travelRateMultiplier: 1,
    mileageKm: 0,
    mileageRate: 0,
    ticketCost: 0,
    baggageCost: 0,
    transferCost: 0,
    rentalDays: 0,
    rentalDayRate: 0,
    fuelTolls: 0,
    taxiCost: 0,
    hotelRequired: false,
    hotelNights: 0,
    hotelNightRate: 0,
    hotelRooms: 1,
    perDiemEnabled: false,
    perDiemDays: 0,
    perDiemRate: 0,
  }
}

export function createQuoteExtraItem(index: number): QuoteExtraItem {
  return {
    id: `quote-extra-${Date.now()}-${index}`,
    label: '',
    quantity: 1,
    unit: 'pcs',
    unitCost: 0,
    note: '',
  }
}

export function createQuoteDraftDefaults(defaults?: {
  currency?: string
  rateCardLocationId?: string
  customerKey?: string
  quoteRef?: string
}): QuoteDraft {
  return {
    quoteRef: defaults?.quoteRef || createDefaultQuoteRef(defaults?.customerKey),
    quoteName: '',
    workLocation: '',
    currency: defaults?.currency || 'EUR',
    deliveryMode: 'Onsite',
    serviceType: 'Break-fix',
    technicianCount: 1,
    workDays: 1,
    hoursPerDay: 4,
    obhHours: 0,
    obhMultiplier: 1.5,
    weekendHours: 0,
    weekendMultiplier: 2,
    billingModel: 'hourly',
    rateSource: 'preset',
    rateCardLocationId: defaults?.rateCardLocationId || '',
    presetRateId: '',
    manualRate: null,
    manualCallOutFee: null,
    manualObhCallOutFee: null,
    manualWeekendCallOutFee: null,
    manualIncludedHours: null,
    manualObhIncludedHours: null,
    manualWeekendIncludedHours: null,
    laborCustomerNote: '',
    fixedFee: null,
    techCostSource: 'manual',
    technicianCostId: '',
    manualTechPayRate: null,
    travelRequired: true,
    travelGroups: [createTravelGroup(1)],
    travelCustomerNote: '',
    consumables: 0,
    consumablesNote: '',
    equipmentLabel: '',
    equipmentDays: 0,
    equipmentRate: 0,
    equipmentNote: '',
    extraItems: [],
    extrasCustomerNote: '',
    otherCostLabel: '',
    otherCost: 0,
    otherCostNote: '',
    markupPercent: 0,
    discountPercent: 0,
    contingencyPercent: 0,
    summaryText: '',
    assumptions: defaultQuoteAssumptions,
  }
}
