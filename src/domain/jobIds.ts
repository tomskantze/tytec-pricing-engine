import type { JobInput } from './types'

function normalizeId(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || fallback
}

export function ensureUniqueJobIds<T extends JobInput>(jobs: T[]): T[] {
  const seen = new Set<string>()
  return jobs.map((job, index) => {
    const fallback = `row-${job.sourceRow || index + 2}`
    const baseId = normalizeId(job.id || job.ticket, fallback)
    let nextId = baseId

    if (seen.has(nextId)) {
      const rowSuffix = job.sourceRow ? `-${job.sourceRow}` : ''
      nextId = `${baseId}${rowSuffix}`
      let counter = 2
      while (seen.has(nextId)) {
        nextId = `${baseId}${rowSuffix}-${counter}`
        counter += 1
      }
    }

    seen.add(nextId)
    return nextId === job.id ? job : { ...job, id: nextId }
  })
}
