import type { CategoryRateLabel, CategoryRateType, Customer, LocationCard, TechnicianProfile, TechnicianRate } from './types'

export function normalizeTechnicianName(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function getCategoryRateType(value: string): CategoryRateType | null {
  const normalized = normalizeTechnicianName(value)
  if (normalized === 'day') return 'Day'
  if (normalized === 'night') return 'Night'
  return null
}

export function getTechnicianProfile(customer: Customer, value: string): TechnicianProfile | undefined {
  const normalized = normalizeTechnicianName(value)
  if (!normalized) return undefined
  return (customer.technicians || []).find((technician) => {
    const names = [technician.name, ...(technician.aliases || [])].map(normalizeTechnicianName)
    return names.includes(normalized)
  })
}

export function getTechnicianTierAssignment(customer: Customer, technicianId: string, locationId: string) {
  return (customer.technicianTierAssignments || []).find((entry) => entry.technicianId === technicianId && entry.locationId === locationId)
}

export function getTechnicianAssignedLocation(customer: Customer, technicianName: string): LocationCard | undefined {
  const technician = getTechnicianProfile(customer, technicianName)
  if (!technician) return undefined
  const assignmentLocationIds = Array.from(new Set(
    (customer.technicianTierAssignments || [])
      .filter((assignment) => assignment.technicianId === technician.id)
      .map((assignment) => assignment.locationId),
  ))
  const rateLocationIds = Array.from(new Set(
    (customer.technicianRates || [])
      .filter((rate) => rate.technicianId === technician.id)
      .map((rate) => rate.locationId),
  ))
  const allLocationIds = Array.from(new Set([...assignmentLocationIds, ...rateLocationIds]))
  return allLocationIds.length === 1
    ? customer.locationCards.find((card) => card.id === allLocationIds[0])
    : undefined
}

function tierRate(
  customer: Customer,
  technicianId: string,
  locationId: string,
  shift: CategoryRateLabel,
  rateType: CategoryRateType,
) {
  const assignment = getTechnicianTierAssignment(customer, technicianId, locationId)
  if (!assignment) return undefined
  if (shift === 'OBH1' && !assignment.obh1Enabled) return null
  const location = customer.locationCards.find((card) => card.id === locationId)
  if (!location?.tierRates?.length) return undefined
  if (shift === 'REG') {
    return location.tierRates.find((rate) => rate.tier === assignment.tier && rate.shift === shift)
  }
  return location.tierRates.find((rate) => rate.tier === assignment.tier && rate.shift === shift && rate.rateType === rateType)
}

function exactRate(
  customer: Customer,
  technicianId: string,
  locationId: string,
  shift: CategoryRateLabel,
  rateType: CategoryRateType,
) {
  return (customer.technicianRates || []).find((rate) =>
    rate.technicianId === technicianId
    && rate.locationId === locationId
    && rate.shift === shift
    && rate.rateType === rateType
  )
}

function fallbackRate(customer: Customer, technicianId: string, locationId: string, shift: CategoryRateLabel) {
  return (customer.technicianRates || []).find((rate) =>
    rate.technicianId === technicianId
    && rate.locationId === locationId
    && rate.shift === shift
  )
}

export function getTechnicianRate(
  customer: Customer,
  location: LocationCard,
  technicianName: string,
  shift: CategoryRateLabel,
  rateTypeValue: string,
): TechnicianRate | undefined {
  const technician = getTechnicianProfile(customer, technicianName)
  if (!technician) return undefined
  const rateType = getCategoryRateType(rateTypeValue)
  if (shift === 'REG') {
    const tierMatched = tierRate(customer, technician.id, location.id, shift, rateType || 'Day')
    if (tierMatched === null) return undefined
    if (tierMatched) {
      return {
        id: `tier-${technician.id}-${location.id}-${shift}-${rateType || 'Day'}`,
        technicianId: technician.id,
        locationId: location.id,
        shift,
        rateType: rateType || 'Day',
        rate: tierMatched.rate,
      }
    }
    return fallbackRate(customer, technician.id, location.id, shift)
  }
  if (rateType) {
    const tierMatched = tierRate(customer, technician.id, location.id, shift, rateType)
    if (tierMatched === null) return undefined
    if (tierMatched) {
      return {
        id: `tier-${technician.id}-${location.id}-${shift}-${rateType}`,
        technicianId: technician.id,
        locationId: location.id,
        shift,
        rateType,
        rate: tierMatched.rate,
      }
    }
    return exactRate(customer, technician.id, location.id, shift, rateType) || fallbackRate(customer, technician.id, location.id, shift)
  }
  return fallbackRate(customer, technician.id, location.id, shift)
}
