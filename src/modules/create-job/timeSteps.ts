export const quarterHourTimeOptions = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15
  const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return { value, label: value }
})

export function snapQuarterHour(value: string) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return value
  const totalMinutes = hour * 60 + minute
  const rounded = Math.min(23 * 60 + 45, Math.max(0, Math.round(totalMinutes / 15) * 15))
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}
