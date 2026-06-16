import type { LocationCard, RateCardMode, ShiftLabel, ShiftRate } from './types'

const timeWindowOptions: Array<{ value: ShiftLabel; label: string }> = [
  { value: '08:00-18:00', label: '08:00-18:00' },
  { value: '18:00-08:00', label: '18:00-08:00' },
  { value: 'Weekend / Holiday', label: 'Weekend / Holiday' },
]

const categoryOptions: Array<{ value: ShiftLabel; label: string }> = [
  { value: 'REG', label: 'REG' },
  { value: 'OBH1', label: 'OBH1' },
]

const timeWindowDefaults: ShiftRate[] = [
  { shift: '08:00-18:00', includedHours: 2, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
  { shift: '18:00-08:00', includedHours: 2, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
  { shift: 'Weekend / Holiday', includedHours: 3, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
]

const categoryDefaults: ShiftRate[] = [
  { shift: 'REG', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
  { shift: 'OBH1', includedHours: 0, callOutFee: 0, additionalHours: 0, fullShiftRate: 0 },
]

export function getRateCardMode(location?: Pick<LocationCard, 'rateCardMode'> | null): RateCardMode {
  return location?.rateCardMode ?? 'time-window'
}

export function rateLabelOptions(mode: RateCardMode) {
  return mode === 'category' ? categoryOptions : timeWindowOptions
}

export function defaultRatesForMode(mode: RateCardMode) {
  return (mode === 'category' ? categoryDefaults : timeWindowDefaults).map((shift) => ({ ...shift }))
}

export function isCategoryMode(location?: Pick<LocationCard, 'rateCardMode'> | null) {
  return getRateCardMode(location) === 'category'
}

export function showsFullShift(label: ShiftLabel) {
  return label === '08:00-18:00' || label === '18:00-08:00'
}
