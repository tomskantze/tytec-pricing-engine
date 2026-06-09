import { Card } from 'antd'
import { getFortnoxArticleNumber } from '../../domain/fortnoxArticles'
import type { FortnoxArticleMap, FortnoxLineKind } from '../../domain/fortnoxArticles'
import type { Customer, LocationCard, ShiftRate } from '../../domain/types'
import { formatAmount } from '../../domain/money'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'

type LocationRow = {
  key: string
  location: LocationCard
}

type ShiftRow = {
  key: string
  shift: ShiftRate
  shiftLabel: string
  callOutAmount: string
  callOutArticleKind?: FortnoxLineKind
  includes: string
  additionalAmount: string
  additionalArticleKind?: FortnoxLineKind
  location: LocationCard
}

function locationLabel(location: LocationCard) {
  return `${location.city}${location.cityCode ? ` (${location.cityCode})` : ''}, ${location.country}`
}

const locationColumns: ErpTableColumn<LocationRow>[] = [
  { title: 'Location', render: (_, row) => locationLabel(row.location), erpSize: 'text' },
  { title: 'Currency', render: (_, row) => row.location.currency || '-', erpSize: 'compact' },
  { title: 'Metro', render: (_, row) => row.location.cityCode || '-', erpSize: 'compact' },
  {
    title: 'Invoicing',
    render: (_, row) => row.location.invoiceMode === 'task' ? 'Per Task' : 'Monthly',
    erpSize: 'compact',
  },
  {
    title: 'SLA',
    render: (_, row) => row.location.slaEnabled ? `Yes ${formatAmount(row.location.currency, row.location.slaAmount)}` : 'No',
    erpSize: 'money',
  },
]

function fortnoxArticle(
  row: ShiftRow,
  kind: FortnoxLineKind | undefined,
  fortnoxArticles: FortnoxArticleMap,
) {
  if (!kind) return '-'
  const article = getFortnoxArticleNumber(row.location.id, row.shift.shift, kind, fortnoxArticles)
  return <span className={article ? 'table-article-text' : 'table-article-text is-missing'}>{article || '-'}</span>
}

function fullShiftLabel(shift: ShiftRate) {
  return shift.shift === '08:00-18:00' ? 'Full day' : 'Full night'
}

function getShiftColumns(fortnoxArticles: FortnoxArticleMap): ErpTableColumn<ShiftRow>[] {
  return [
    { title: 'Shift', dataIndex: 'shiftLabel', width: 118 },
    { title: 'Call-out / Full', dataIndex: 'callOutAmount', width: 112 },
    {
      title: 'Fortnox Article',
      render: (_, row) => fortnoxArticle(row, row.callOutArticleKind, fortnoxArticles),
      width: 104,
    },
    { title: 'Includes', dataIndex: 'includes', width: 78 },
    { title: 'Additional Hour', dataIndex: 'additionalAmount', width: 118 },
    {
      title: 'Fortnox Article',
      render: (_, row) => fortnoxArticle(row, row.additionalArticleKind, fortnoxArticles),
      width: 104,
    },
  ]
}

function getRateRows(location: LocationCard): ShiftRow[] {
  const standardRows = location.shifts.map((shift) => ({
    key: `${location.id}-${shift.shift}`,
    shift,
    shiftLabel: shift.shift,
    callOutAmount: formatAmount(location.currency, shift.callOutFee),
    callOutArticleKind: 'callOut' as const,
    includes: `${shift.includedHours.toFixed(2)} hrs`,
    additionalAmount: formatAmount(location.currency, shift.additionalHours),
    additionalArticleKind: 'additionalHour' as const,
    location,
  }))
  return [
    ...standardRows,
    ...location.shifts.filter((shift) => shift.shift !== 'Weekend / Holiday').map((shift) => ({
      key: `${location.id}-${shift.shift}-full`,
      shift,
      shiftLabel: fullShiftLabel(shift),
      callOutAmount: formatAmount(location.currency, shift.fullShiftRate),
      callOutArticleKind: 'fullShift' as const,
      includes: '-',
      additionalAmount: '-',
      additionalArticleKind: undefined,
      location,
    })),
  ]
}

function LocationFocusPanel({
  fortnoxArticles,
  location,
}: {
  fortnoxArticles: FortnoxArticleMap
  location: LocationCard
}) {
  const rows = getRateRows(location)

  return (
    <Card className="section-card section-card-compact" variant="borderless">
      <ErpDataTable<ShiftRow>
        className="nested-table rate-card-detail-table"
        columnSizing="manual"
        columns={getShiftColumns(fortnoxArticles)}
        dataSource={rows}
        rowKey="key"
        scroll={{ x: 634 }}
      />
      {location.slaNote ? (
        <div className="info-field info-field-spaced">
          <span>SLA Note</span>
          <strong>{location.slaNote}</strong>
        </div>
      ) : null}
    </Card>
  )
}

export function RateCardsTable({
  customer,
  selectedLocationKey,
  expandedLocationKeys,
  fortnoxArticles,
  onSelectedLocationKeyChange,
  onExpandedLocationKeysChange,
}: {
  customer: Customer
  selectedLocationKey: string | null
  expandedLocationKeys: string[]
  fortnoxArticles: FortnoxArticleMap
  onSelectedLocationKeyChange: (locationKey: string | null) => void
  onExpandedLocationKeysChange: (locationKeys: string[]) => void
}) {
  const rows = customer.locationCards.map((location) => ({ key: location.id, location }))

  function toggleLocation(row: LocationRow) {
    const isExpanded = expandedLocationKeys.includes(row.key)
    onSelectedLocationKeyChange(
      isExpanded && selectedLocationKey === row.key ? null : isExpanded ? selectedLocationKey : row.key,
    )
    onExpandedLocationKeysChange(
      isExpanded
        ? expandedLocationKeys.filter((locationKey) => locationKey !== row.key)
        : [...expandedLocationKeys, row.key],
    )
  }

  return (
    <ErpDataTable<LocationRow>
      columns={locationColumns}
      dataSource={rows}
      expandable={{
        expandedRowKeys: expandedLocationKeys,
        expandedRowRender: (row) => (
          <LocationFocusPanel
            fortnoxArticles={fortnoxArticles}
            location={row.location}
          />
        ),
        expandIcon: () => null,
        showExpandColumn: false,
      }}
      onRow={(row) => ({ onClick: () => toggleLocation(row) })}
      rowClassName={(row) =>
        [
          row.key === selectedLocationKey && expandedLocationKeys.includes(row.key) ? 'selected-row' : '',
          expandedLocationKeys.includes(row.key) ? 'expanded-row' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
      rowKey="key"
    />
  )
}
