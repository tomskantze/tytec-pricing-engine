import type { JiraIssue, JobInput } from '../domain/types'
import { parseDelimited } from './csv'

const ticketPattern = /\bT\d{5}\b/i
const customerRefPattern = /\b[A-Z]+-\d+(?:-R\d+)?\b/gi

function get(row: Record<string, string>, key: string) {
  return String(row[key] ?? '').trim()
}

function summaryReferences(summary: string) {
  return Array.from(new Set([
    ...(summary.match(ticketPattern)?.map((value) => value.toUpperCase()) ?? []),
    ...(summary.match(customerRefPattern)?.map((value) => value.toUpperCase()) ?? []),
  ]))
}

function issueFromRow(row: Record<string, string>): JiraIssue {
  const summary = get(row, 'Summary')
  const references = summaryReferences(summary)
  return {
    issueKey: get(row, 'Issue key'),
    issueId: get(row, 'Issue id'),
    summary,
    dueDate: get(row, 'Custom field (Due Date)'),
    status: get(row, 'Status'),
    taskFailure: get(row, 'Custom field (Task Failure)'),
    location: get(row, 'Custom field (Location)'),
    ttrComment: get(row, 'Custom field (TTR Comment)'),
    customerTicket: references[0] ?? '',
    summaryReferences: references,
  }
}

export function importJiraIssuesFromText(text: string) {
  const rows = parseDelimited(text).rows
  const issues = rows.map(issueFromRow).filter((issue) => issue.issueKey || issue.summary)
  const warnings = issues.length ? [] : ['No Jira issue rows were found in the uploaded report.']
  return { issues, warnings }
}

export function mergeJobsWithJira(jobs: JobInput[], issues: JiraIssue[]) {
  const byTicket = new Map<string, JiraIssue>()
  issues.forEach((issue) => {
    const references = issue.summaryReferences?.length ? issue.summaryReferences : issue.customerTicket ? [issue.customerTicket] : []
    references.forEach((reference) => {
      if (reference && !byTicket.has(reference)) byTicket.set(reference, issue)
    })
  })

  const mergedJobs = jobs.map((job) => {
    const issue = [
      job.ticket.toUpperCase(),
      job.customerRef.toUpperCase(),
    ].map((reference) => byTicket.get(reference)).find(Boolean)
    if (!issue) return job
    return {
      ...job,
      jiraIssueKey: issue.issueKey,
      jiraIssueId: issue.issueId,
      jiraSummary: issue.summary,
      jiraStatus: issue.status,
      jiraLocation: issue.location,
      jiraDueDate: issue.dueDate,
      summary: issue.summary || job.summary,
    }
  })

  const warnings: string[] = []
  if (jobs.length && !issues.length) warnings.push('Upload the matching Jira report to attach Tytec ticket numbers.')
  const unmatched = issues.length ? mergedJobs.filter((job) => !job.jiraIssueKey).length : 0
  if (unmatched) warnings.push(`${unmatched} customer row${unmatched === 1 ? '' : 's'} did not match a Jira issue.`)
  return { jobs: mergedJobs, warnings }
}
