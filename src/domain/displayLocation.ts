import type { PricedJob } from './types'

const summaryAliases: Record<string, string> = {
  STO: 'Stockholm',
  STHLM: 'Stockholm',
  OSL: 'Oslo',
  OSLO: 'Oslo',
  CPH: 'Copenhagen',
  HEL: 'Helsinki',
  MALMO: 'Malmo',
  'MALMÖ': 'Malmo',
  LISBOA: 'Lisbon',
  VIE: 'Vienna',
  VNA: 'Vienna',
  GVA: 'Geneva',
  ZRH: 'Zurich',
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function summaryToken(job: PricedJob) {
  const summary = String(job.jiraSummary || job.summary || '').trim()
  return summary.split(':').map((part) => part.trim()).filter(Boolean)[1] || ''
}

export function displayOriginalLocation(job: PricedJob) {
  const token = summaryToken(job)
  if (token) return summaryAliases[token.toUpperCase()] || titleCase(token)
  if (job.jiraLocation) return job.jiraLocation
  return [job.city, job.country].filter(Boolean).join(', ')
}

export function displayCity(job: PricedJob) {
  const location = displayOriginalLocation(job)
  return location ? location.split(',')[0].trim() : job.city
}
