import { SearchOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import { useMemo, useState } from 'react'
import type { PricedJob } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'

function reasonFor(job: PricedJob) {
  return job.manualReasons.join('; ')
    || job.reviewOverride?.note
    || (job.reviewOverride?.forceReview ? 'Manual review requested' : 'Review required')
}

function searchable(job: PricedJob) {
  return [job.date, job.ticket, job.jiraIssueKey, job.customerRef, job.city, reasonFor(job)].join(' ').toLowerCase()
}

export function isPendingReviewJob(job: PricedJob) {
  return job.queueState === 'Blocked' || Boolean(job.reviewOverride?.forceReview && !job.reviewOverride.approved)
}

export function ReviewJobList({
  jobs,
  selectedJobId,
  onSelectJob,
}: {
  jobs: PricedJob[]
  selectedJobId: string
  onSelectJob: (jobId: string) => void
}) {
  const [query, setQuery] = useState('')
  const reviewJobs = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return jobs
      .filter(isPendingReviewJob)
      .filter((job) => !needle || searchable(job).includes(needle))
      .sort((left, right) => left.sourceRow - right.sourceRow)
  }, [jobs, query])
  const columns: ErpTableColumn<PricedJob>[] = [
    { title: 'Date', dataIndex: 'date', erpSize: 'date' },
    { title: 'Ticket', dataIndex: 'ticket', erpSize: 'compact' },
    { title: 'Tytec', dataIndex: 'jiraIssueKey', erpSize: 'compact' },
    { title: 'Reason', erpSize: 'text', render: (_, job) => reasonFor(job) },
  ]

  return (
    <>
      <div className="toolbar-row">
        <Input
          allowClear
          className="toolbar-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search review queue"
          prefix={<SearchOutlined />}
          value={query}
        />
        <span className="toolbar-count">{reviewJobs.length} rows</span>
      </div>
      <ErpDataTable<PricedJob>
        columns={columns}
        dataSource={reviewJobs}
        locale={{ emptyText: 'No jobs are currently waiting in the review queue.' }}
        onRow={(job) => ({ onClick: () => onSelectJob(job.id) })}
        rowClassName={(job) => (job.id === selectedJobId ? 'selected-row' : '')}
        rowKey="id"
      />
    </>
  )
}
