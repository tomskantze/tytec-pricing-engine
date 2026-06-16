import type { CategoryRateType, Customer, LocationCard, TechnicianProfile, TechnicianRate, TechnicianTierAssignment, TierLevel } from '../domain/types'

function normalize(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

type AkamaiTechnicianSeed = {
  id: string
  name: string
  aliases?: string[]
}

const akamaiLocationTemplates: Array<Omit<LocationCard, 'id'> & { id: string }> = [
  {
    id: 'loc-akam-oslo',
    city: 'Oslo',
    cityCode: 'OSL',
    siteAliases: ['BULK', 'Stack', 'BULK | Stack'],
    country: 'Norway',
    currency: 'SEK',
    invoiceMode: 'monthly',
    rateCardMode: 'category',
    slaEnabled: false,
    slaAmount: 0,
    shifts: [
      { shift: 'REG', includedHours: 0, callOutFee: 0, additionalHours: 572.51, fullShiftRate: 0 },
      { shift: 'OBH1', includedHours: 0, callOutFee: 0, additionalHours: 535.97, fullShiftRate: 0 },
    ],
    tierRates: [],
  },
  {
    id: 'loc-akam-stockholm',
    city: 'Stockholm',
    cityCode: 'STHLM',
    siteAliases: [],
    country: 'Sweden',
    currency: 'SEK',
    invoiceMode: 'monthly',
    rateCardMode: 'category',
    slaEnabled: false,
    slaAmount: 0,
    shifts: [
      { shift: 'REG', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
      { shift: 'OBH1', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
    ],
    tierRates: [
      { tier: 'Tier 1', shift: 'REG', rateType: 'Day', rate: 500.47 },
      { tier: 'Tier 2', shift: 'REG', rateType: 'Day', rate: 525 },
      { tier: 'Tier 3', shift: 'REG', rateType: 'Day', rate: 583.15 },
    ],
  },
  {
    id: 'loc-akam-copenhagen',
    city: 'Copenhagen',
    cityCode: 'CPH',
    siteAliases: [],
    country: 'Denmark',
    currency: 'SEK',
    invoiceMode: 'monthly',
    rateCardMode: 'category',
    slaEnabled: false,
    slaAmount: 0,
    shifts: [
      { shift: 'REG', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
      { shift: 'OBH1', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
    ],
    tierRates: [],
  },
  {
    id: 'loc-akam-helsinki',
    city: 'Helsinki',
    cityCode: 'HELS',
    siteAliases: [],
    country: 'Finland',
    currency: 'SEK',
    invoiceMode: 'monthly',
    rateCardMode: 'category',
    slaEnabled: false,
    slaAmount: 0,
    shifts: [
      { shift: 'REG', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
      { shift: 'OBH1', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
    ],
    tierRates: [],
  },
]

const akamaiTechnicianSeeds: AkamaiTechnicianSeed[] = [
  { id: 'tech-akam-rhys-fitzpatrick', name: 'Rhys Fitzpatrick' },
  { id: 'tech-akam-simon-larson', name: 'Simon Larson' },
  { id: 'tech-akam-tyler-herin', name: 'Tyler Herin' },
  { id: 'tech-akam-antonio-dias', name: 'Antonio Dias' },
  { id: 'tech-akam-johan-strid', name: 'Johan Strid' },
  { id: 'tech-akam-amir-allan-dorraj', name: 'Amir Allan Dorraj', aliases: ['Amir Allan'] },
  { id: 'tech-akam-radu-zeida', name: 'Radu-Mihai Zeida', aliases: ['Radu Zeida'] },
  { id: 'tech-akam-oskar-lapuszek', name: 'Oskar Lapuszek' },
  { id: 'tech-akam-adrian-costas', name: 'Adrian Catalin Costas', aliases: ['Adrian Costas'] },
  { id: 'tech-akam-tom-skantze', name: 'Tom Skantze' },
]

const osloTechnicianIds = new Set([
  'tech-akam-radu-zeida',
  'tech-akam-oskar-lapuszek',
  'tech-akam-adrian-costas',
])

const stockholmTechnicianTiers: Record<string, TierLevel> = {
  'tech-akam-rhys-fitzpatrick': 'Tier 1',
  'tech-akam-simon-larson': 'Tier 1',
  'tech-akam-tyler-herin': 'Tier 3',
  'tech-akam-johan-strid': 'Tier 3',
  'tech-akam-amir-allan-dorraj': 'Tier 1',
  'tech-akam-tom-skantze': 'Tier 3',
}

function isAkamaiCustomer(customer: Customer) {
  return customer.customerKey === 'AKAM' || normalize(customer.name) === 'akamai'
}

function locationIdentity(card: Pick<LocationCard, 'city' | 'cityCode'>) {
  return `${normalize(card.city)}:${normalize(card.cityCode)}`
}

function mergeLocation(existing: LocationCard, template: LocationCard): LocationCard {
  const aliasSet = existing.siteAliases ? unique(existing.siteAliases) : unique(template.siteAliases || [])
  const existingShifts = new Map(existing.shifts.map((shift) => [shift.shift, shift]))
  const shifts = template.shifts.map((shift) => existingShifts.get(shift.shift) || shift)
  const tierRates = existing.tierRates ? existing.tierRates : template.tierRates || []
  return {
    ...template,
    ...existing,
    id: existing.id,
    city: existing.city || template.city,
    cityCode: existing.cityCode || template.cityCode,
    country: existing.country || template.country,
    currency: existing.currency || template.currency,
    invoiceMode: existing.invoiceMode || template.invoiceMode,
    rateCardMode: existing.rateCardMode || template.rateCardMode,
    shifts,
    tierRates,
    siteAliases: aliasSet,
  }
}

function mergeTechnician(existing: TechnicianProfile | undefined, seed: AkamaiTechnicianSeed): TechnicianProfile {
  const aliases = unique([...(existing?.aliases || []), ...(seed.aliases || [])])
  return {
    id: existing?.id || seed.id,
    name: existing?.name || seed.name,
    aliases,
    active: existing?.active ?? true,
  }
}

function rateId(technicianId: string, locationId: string, shift: 'REG' | 'OBH1', rateType: CategoryRateType) {
  return `${technicianId}-${locationId}-${shift.toLowerCase()}-${rateType.toLowerCase()}`
}

function assignmentId(technicianId: string, locationId: string, tier: TierLevel) {
  return `${technicianId}-${locationId}-${tier.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function withAkamaiDefaults(customer: Customer): Customer {
  if (!isAkamaiCustomer(customer)) return customer

  const locationCards = [...(customer.locationCards || [])]
  const locationIdByKey = new Map<string, string>()
  for (const location of locationCards) {
    locationIdByKey.set(locationIdentity(location), location.id)
  }
  for (const template of akamaiLocationTemplates) {
    const key = locationIdentity(template)
    const existingIndex = locationCards.findIndex((location) => locationIdentity(location) === key)
    if (existingIndex === -1) {
      locationCards.push({ ...template })
      locationIdByKey.set(key, template.id)
      continue
    }
    locationCards[existingIndex] = mergeLocation(locationCards[existingIndex], template)
    locationIdByKey.set(key, locationCards[existingIndex].id)
  }

  const existingTechnicians = customer.technicians || []
  const technicians = [...existingTechnicians]
  const technicianIdBySeedId = new Map<string, string>()
  for (const seed of akamaiTechnicianSeeds) {
    const existing = existingTechnicians.find((technician) => {
      const names = [technician.name, ...(technician.aliases || [])].map(normalize)
      return names.includes(normalize(seed.name)) || (seed.aliases || []).some((alias) => names.includes(normalize(alias)))
    })
    const merged = mergeTechnician(existing, seed)
    if (!existing) technicians.push(merged)
    else {
      const index = technicians.findIndex((technician) => technician.id === existing.id)
      technicians[index] = merged
    }
    technicianIdBySeedId.set(seed.id, merged.id)
  }
  for (const technician of technicians) {
    technicianIdBySeedId.set(technician.id, technician.id)
  }

  const existingRates = customer.technicianRates || []
  const existingKeys = new Set(existingRates.map((rate) => `${rate.technicianId}:${rate.locationId}:${rate.shift}:${rate.rateType}`))
  const technicianRates: TechnicianRate[] = [...existingRates]
  const osloLocationId = locationIdByKey.get(locationIdentity({ city: 'Oslo', cityCode: 'OSL' }))
  const stockholmLocationId = locationIdByKey.get(locationIdentity({ city: 'Stockholm', cityCode: 'STHLM' }))
  const existingAssignments = customer.technicianTierAssignments || []
  const assignmentKeys = new Set(existingAssignments.map((assignment) => `${assignment.technicianId}:${assignment.locationId}`))
  const technicianTierAssignments: TechnicianTierAssignment[] = [...existingAssignments]

  for (const seed of akamaiTechnicianSeeds) {
    const technicianId = technicianIdBySeedId.get(seed.id)
    if (!technicianId) continue
    if (osloTechnicianIds.has(seed.id) && osloLocationId) {
      const osloRates: Array<[TechnicianRate['shift'], CategoryRateType, number]> = [
        ['REG', 'Day', 572.51],
        ['REG', 'Night', 572.51],
        ['OBH1', 'Day', 535.97],
        ['OBH1', 'Night', 535.97],
      ]
      for (const [shift, rateType, rate] of osloRates) {
        const key = `${technicianId}:${osloLocationId}:${shift}:${rateType}`
        if (existingKeys.has(key)) continue
        technicianRates.push({ id: rateId(technicianId, osloLocationId, shift, rateType), technicianId, locationId: osloLocationId, shift, rateType, rate })
        existingKeys.add(key)
      }
    }
    if (!stockholmLocationId) continue
    const tier = stockholmTechnicianTiers[seed.id]
    if (!tier) continue
    const assignmentKey = `${technicianId}:${stockholmLocationId}`
    if (assignmentKeys.has(assignmentKey)) continue
    technicianTierAssignments.push({
      id: assignmentId(technicianId, stockholmLocationId, tier),
      technicianId,
      locationId: stockholmLocationId,
      tier,
      obh1Enabled: false,
    })
    assignmentKeys.add(assignmentKey)
  }

  const filteredTechnicianRates = technicianRates.filter((rate) => {
    if (!osloLocationId) return true
    if (rate.locationId === osloLocationId) return true
    return Boolean(technicianTierAssignments.find((assignment) => assignment.technicianId === rate.technicianId && assignment.locationId === rate.locationId))
  })

  return {
    ...customer,
    locationCards,
    technicians,
    technicianRates: filteredTechnicianRates,
    technicianTierAssignments,
  }
}
