import { EditOutlined, LockOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Modal, Select, Space } from 'antd'
import { useMemo, useState } from 'react'
import { getFortnoxArticleNumber } from '../../domain/fortnoxArticles'
import type { FortnoxArticleMap, FortnoxLineKind } from '../../domain/fortnoxArticles'
import { getLocationLabel } from '../../domain/matching'
import { formatAmount } from '../../domain/money'
import { getRateCardMode, showsFullShift } from '../../domain/rateCards'
import type { Customer, RateCardMode, ShiftLabel } from '../../domain/types'
import { PageHeader } from '../../design-system/PageHeader'
import { CustomerIndexTable } from '../customers/CustomerIndexTable'
import { CustomerSummary } from '../customers/CustomerSummary'

type FortnoxRow = {
  key: string
  locationId: string
  location: string
  currency: string
  rateCardMode: RateCardMode
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
      rateCardMode: getRateCardMode(location),
      shift: shift.shift,
      callOutFee: shift.callOutFee,
      additionalRate: shift.additionalHours,
      fullShiftRate: shift.fullShiftRate,
    })),
  )
}

function isCategoryRow(row: FortnoxRow) {
  return row.rateCardMode === 'category'
}

function shouldShowFullShift(row: FortnoxRow) {
  return !isCategoryRow(row) && showsFullShift(row.shift)
}

function articleKinds(row: FortnoxRow): FortnoxLineKind[] {
  if (isCategoryRow(row)) return ['additionalHour']
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

function getArticle(row: FortnoxRow, kind: FortnoxLineKind, fortnoxArticles: FortnoxArticleMap) {
  return getFortnoxArticleNumber(row.locationId, row.shift, kind, fortnoxArticles) ?? ''
}

function rowMatches(row: FortnoxRow, fortnoxArticles: FortnoxArticleMap, query: string) {
  if (!query) return true
  const articleNumbers = articleKinds(row).map((kind) => getArticle(row, kind, fortnoxArticles))
  const haystack = [
    row.location,
    row.shift,
    row.callOutFee,
    row.additionalRate,
    row.fullShiftRate,
    ...articleNumbers,
  ].join(' ').toLowerCase()
  return haystack.includes(query)
}

function shiftTitle(shift: ShiftLabel) {
  return shift === 'Weekend / Holiday' ? 'Weekend/Holiday' : shift
}

function fullShiftLabel(row: FortnoxRow) {
  return row.shift === '08:00-18:00' ? 'Full day' : 'Full night'
}

function rateForKind(row: FortnoxRow, kind: FortnoxLineKind) {
  if (kind === 'callOut') return row.callOutFee
  if (kind === 'fullShift') return row.fullShiftRate
  return row.additionalRate
}

function kindLabel(row: FortnoxRow, kind: FortnoxLineKind) {
  if (kind === 'callOut') return 'Call-Out'
  if (kind === 'fullShift') return 'Full Shift'
  return isCategoryRow(row) ? 'Hourly Rate' : 'Additional Hour'
}

function mappedCount(rows: FortnoxRow[], fortnoxArticles: FortnoxArticleMap) {
  return rows.reduce((count, row) => (
    count + articleKinds(row).filter((kind) => getArticle(row, kind, fortnoxArticles)).length
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
  const activeCustomer = customer ?? null
  const rows = useMemo(() => {
    if (!activeCustomer) return []
    const needle = query.trim().toLowerCase()
    return getRows(activeCustomer).filter((row) => rowMatches(row, fortnoxArticles, needle))
  }, [activeCustomer, fortnoxArticles, query])
  const customerOptions = useMemo(
    () => [...customers]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((item) => ({ label: item.name, value: item.customerKey })),
    [customers],
  )
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
      <PageHeader title="Article Mapping" />
      {!activeCustomer ? (
        <CustomerIndexTable
          customers={customers}
          emptyText="No customers match the current search."
          onOpenCustomer={onSelectCustomer}
        />
      ) : null}
      {activeCustomer ? (
      <Card className="workspace-card" variant="borderless">
        <CustomerSummary customer={activeCustomer} />
        <div className="toolbar-row">
          <span className="toolbar-count">
            {groups.length} locations · {mappedArticles}/{totalArticles} mapped
          </span>
          <Space size={8} wrap>
            <Select
              allowClear
              className="global-workspace-select"
              onChange={(value) => onSelectCustomer(value || '')}
              options={customerOptions}
              placeholder="Select customer"
              value={activeCustomer?.customerKey || undefined}
            />
            <Input
              allowClear
              className="toolbar-search"
              disabled={!activeCustomer}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search articles"
              prefix={<SearchOutlined />}
              value={query}
            />
          </Space>
        </div>
        {groups.length ? (
          <div className="fortnox-location-list">
            {groups.map((group) => (
              <section className="fortnox-location-section" key={group.key}>
                <div className="fortnox-location-head">
                  <span className="fortnox-location-title">{group.location}</span>
                  <span>{mappedCount(group.rows, fortnoxArticles)}/{articleTargetCount(group.rows)} mapped</span>
                </div>
                <div className="fortnox-shift-matrix">
                  {group.rows.map((row) => (
                    <div className="fortnox-shift-card" key={row.key}>
                      <div className="fortnox-shift-card-head">
                        <strong>{shiftTitle(row.shift)}</strong>
                        <span>Article</span>
                      </div>
                      {isCategoryRow(row) ? (
                        <div className="fortnox-shift-card-row">
                          <span>Hourly rate {formatAmount(row.currency, row.additionalRate)}</span>
                          <ArticleButton
                            article={getArticle(row, 'additionalHour', fortnoxArticles)}
                            onClick={() => openEditor(row, 'additionalHour')}
                          />
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
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
        ) : (
          <Empty
            description="No article rows match the current search."
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
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
              <div className="info-field"><span>Line</span><strong>{kindLabel(editor.row, editor.kind)}</strong></div>
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
      ) : null}
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
