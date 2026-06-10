import { EditOutlined, LockOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Modal, Select, Space, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { getFortnoxArticleNumber } from '../../domain/fortnoxArticles'
import type { FortnoxArticleMap, FortnoxLineKind } from '../../domain/fortnoxArticles'
import { getLocationLabel } from '../../domain/matching'
import { formatAmount } from '../../domain/money'
import type { Customer, ShiftLabel } from '../../domain/types'
import { CustomerSummary } from '../customers/CustomerSummary'

type FortnoxRow = {
  key: string
  locationId: string
  location: string
  currency: string
  shift: ShiftLabel
  callOutFee: number
  additionalRate: number
  fullShiftRate: number
}

type FortnoxLocationGroup = {
  key: string
  location: string
  rows: FortnoxRow[]
}

type ArticleEditor = {
  row: FortnoxRow
  kind: FortnoxLineKind
  value: string
}

function getRows(customer: Customer): FortnoxRow[] {
  return customer.locationCards.flatMap((location) =>
    location.shifts.map((shift) => ({
      key: `${location.id}-${shift.shift}`,
      locationId: location.id,
      location: getLocationLabel(location),
      currency: location.currency,
      shift: shift.shift,
      callOutFee: shift.callOutFee,
      additionalRate: shift.additionalHours,
      fullShiftRate: shift.fullShiftRate,
    })),
  )
}

function shouldShowFullShift(row: FortnoxRow) {
  return row.shift === '08:00-18:00' || row.shift === '18:00-08:00'
}

function articleKinds(row: FortnoxRow): FortnoxLineKind[] {
  return shouldShowFullShift(row) ? ['callOut', 'additionalHour', 'fullShift'] : ['callOut', 'additionalHour']
}

function getGroups(rows: FortnoxRow[]): FortnoxLocationGroup[] {
  return rows.reduce<FortnoxLocationGroup[]>((groups, row) => {
    const group = groups.find((item) => item.key === row.locationId)
    if (group) group.rows.push(row)
    else groups.push({ key: row.locationId, location: row.location, rows: [row] })
    return groups
  }, [])
}

function rowMatches(row: FortnoxRow, fortnoxArticles: FortnoxArticleMap, query: string) {
  if (!query) return true
  const haystack = [
    row.location,
    row.shift,
    row.callOutFee,
    row.additionalRate,
    row.fullShiftRate,
    getFortnoxArticleNumber(row.locationId, row.shift, 'callOut', fortnoxArticles),
    getFortnoxArticleNumber(row.locationId, row.shift, 'additionalHour', fortnoxArticles),
    getFortnoxArticleNumber(row.locationId, row.shift, 'fullShift', fortnoxArticles),
  ].join(' ').toLowerCase()
  return haystack.includes(query)
}

function getArticle(row: FortnoxRow, kind: FortnoxLineKind, fortnoxArticles: FortnoxArticleMap) {
  return getFortnoxArticleNumber(row.locationId, row.shift, kind, fortnoxArticles) ?? ''
}

function kindLabel(kind: FortnoxLineKind) {
  if (kind === 'callOut') return 'Call-Out'
  if (kind === 'fullShift') return 'Full Shift'
  return 'Additional Hour'
}

function shiftTitle(shift: ShiftLabel) {
  return shift === 'Weekend / Holiday' ? 'Weekend/Holiday' : shift
}

function rateForKind(row: FortnoxRow, kind: FortnoxLineKind) {
  if (kind === 'callOut') return row.callOutFee
  if (kind === 'fullShift') return row.fullShiftRate
  return row.additionalRate
}

function fullShiftLabel(row: FortnoxRow) {
  return row.shift === '08:00-18:00' ? 'Full day' : 'Full night'
}

function mappedCount(rows: FortnoxRow[], fortnoxArticles: FortnoxArticleMap) {
  return rows.reduce((count, row) => (
    count
    + articleKinds(row).filter((kind) => getArticle(row, kind, fortnoxArticles)).length
  ), 0)
}

function articleTargetCount(rows: FortnoxRow[]) {
  return rows.reduce((count, row) => count + articleKinds(row).length, 0)
}

export function FortnoxModule({
  customer,
  customers,
  fortnoxArticles,
  onSelectCustomer,
  onSetArticle,
}: {
  customer: Customer | null
  customers: Customer[]
  fortnoxArticles: FortnoxArticleMap
  onSelectCustomer: (customerKey: string) => void
  onSetArticle: (locationId: string, shift: ShiftLabel, kind: FortnoxLineKind, articleNumber: string) => void
}) {
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<ArticleEditor | null>(null)
  const activeCustomer = customer ?? customers[0] ?? null
  const rows = useMemo(() => {
    if (!activeCustomer) return []
    const needle = query.trim().toLowerCase()
    return getRows(activeCustomer).filter((row) => rowMatches(row, fortnoxArticles, needle))
  }, [activeCustomer, fortnoxArticles, query])
  const groups = useMemo(() => getGroups(rows), [rows])
  const mappedArticles = mappedCount(rows, fortnoxArticles)
  const totalArticles = articleTargetCount(rows)

  function openEditor(row: FortnoxRow, kind: FortnoxLineKind) {
    setEditor({ row, kind, value: getArticle(row, kind, fortnoxArticles) })
  }

  function saveEditor() {
    if (!editor) return
    const value = editor.value.trim()
    if (!value) return
    onSetArticle(editor.row.locationId, editor.row.shift, editor.kind, value)
    setEditor(null)
  }

  return (
    <>
      <div className="customer-workspace-topbar global-workspace-topbar">
        <div className="global-workspace-spacer" />
        <div className="customer-workspace-meta">
          <Select
            className="global-workspace-select"
            onChange={onSelectCustomer}
            options={customers.map((item) => ({ label: item.name, value: item.customerKey }))}
            placeholder="Select customer"
            size="small"
            value={activeCustomer?.customerKey}
          />
        </div>
      </div>
      <Card className="workspace-card" variant="borderless">
        {activeCustomer ? <CustomerSummary customer={activeCustomer} /> : null}
        <div className="toolbar-row">
          <div>
            <Typography.Text strong>Article Mapping</Typography.Text>
          </div>
          <Space size={8} wrap>
            <Input
              allowClear
              className="toolbar-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search articles"
              prefix={<SearchOutlined />}
              value={query}
            />
            <span className="toolbar-count">{mappedArticles}/{totalArticles} mapped</span>
          </Space>
        </div>
        {groups.length ? (
          <div className="fortnox-location-list">
            {groups.map((group) => (
              <section className="fortnox-location-section" key={group.key}>
                <div className="fortnox-location-head">
                  <Typography.Text className="fortnox-location-title">{group.location}</Typography.Text>
                  <span>{mappedCount(group.rows, fortnoxArticles)}/{articleTargetCount(group.rows)} mapped</span>
                </div>
                <div className="fortnox-shift-matrix">
                  {group.rows.map((row) => (
                    <div className="fortnox-shift-card" key={row.key}>
                      <div className="fortnox-shift-card-head">
                        <strong>{shiftTitle(row.shift)}</strong>
                        <span>Article</span>
                      </div>
                      <div className="fortnox-shift-card-row">
                        <span>Call out {formatAmount(row.currency, row.callOutFee)}</span>
                        <ArticleButton
                          article={getArticle(row, 'callOut', fortnoxArticles)}
                          onClick={() => openEditor(row, 'callOut')}
                        />
                      </div>
                      <div className="fortnox-shift-card-row">
                        <span>Per hour {formatAmount(row.currency, row.additionalRate)}</span>
                        <ArticleButton
                          article={getArticle(row, 'additionalHour', fortnoxArticles)}
                          onClick={() => openEditor(row, 'additionalHour')}
                        />
                      </div>
                    </div>
                  ))}
                  {group.rows.filter(shouldShowFullShift).map((row) => (
                    <div className="fortnox-shift-card fortnox-full-shift-card" key={`${row.key}-full`}>
                      <div className="fortnox-shift-card-head">
                        <strong>{fullShiftLabel(row)}</strong>
                        <span>Article</span>
                      </div>
                      <div className="fortnox-shift-card-row">
                        <span>{formatAmount(row.currency, row.fullShiftRate)}</span>
                        <ArticleButton
                          article={getArticle(row, 'fullShift', fortnoxArticles)}
                          onClick={() => openEditor(row, 'fullShift')}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        <Modal
          okButtonProps={{ disabled: !editor?.value.trim() }}
          okText="Save Article"
          onCancel={() => setEditor(null)}
          onOk={saveEditor}
          open={Boolean(editor)}
          title="Edit Fortnox Article"
        >
          {editor ? (
            <div className="fortnox-editor-grid">
              <div className="info-field"><span>Location</span><strong>{editor.row.location}</strong></div>
              <div className="info-field"><span>Shift</span><strong>{editor.row.shift}</strong></div>
              <div className="info-field"><span>Line</span><strong>{kindLabel(editor.kind)}</strong></div>
              <div className="info-field"><span>Rate</span><strong>{formatAmount(editor.row.currency, rateForKind(editor.row, editor.kind))}</strong></div>
              <Input
                autoFocus
                className="fortnox-editor-input"
                onChange={(event) => setEditor({ ...editor, value: event.target.value })}
                placeholder="Article number"
                value={editor.value}
              />
            </div>
          ) : null}
        </Modal>
      </Card>
    </>
  )
}

function ArticleButton({ article, onClick }: { article: string; onClick: () => void }) {
  return (
    <Button className={article ? '' : 'fortnox-missing-article'} icon={<LockOutlined />} onClick={onClick} size="small">
      <span>{article || 'Missing'}</span>
      <EditOutlined />
    </Button>
  )
}
