import { Card } from 'antd'
import { getFortnoxArticleNumber } from '../../domain/fortnoxArticles'
import type { FortnoxArticleMap, FortnoxLineKind } from '../../domain/fortnoxArticles'
import { formatAmount } from '../../domain/money'
import { getRateCardMode, showsFullShift } from '../../domain/rateCards'
import type { Customer, LocationCard, ShiftRate } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'

type LocationRow = {
  key: string
  location: LocationCard
}

type RateRow = {
  key: string
  shift: ShiftRate
  shiftLabel: string
  primaryAmount: string
  primaryArticleKind?: FortnoxLineKind
  includes: string
  secondaryAmount: string
  secondaryArticleKind?: FortnoxLineKind
  location: LocationCard
}

type TierRateRow = {
  key: string
  tier: string
  shiftLabel: string
  rateType: string
  hourlyRate: string
}

function locationLabel(location: LocationCard) {
  return `${location.city}${location.cityCode ? ` (${location.cityCode})` : ''}, ${location.country}`
}

const locationColumns: ErpTableColumn<LocationRow>[] = [
  { title: 'Location', render: (_, row) => locationLabel(row.location), erpSize: 'text' },
  { title: 'Site Aliases', render: (_, row) => row.location.siteAliases?.join(', ') || '-', erpSize: 'text' },
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
  row: RateRow,
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

function timeWindowColumns(fortnoxArticles: FortnoxArticleMap): ErpTableColumn<RateRow>[] {
  return [
    { title: 'Shift', dataIndex: 'shiftLabel', width: 118 },
    { title: 'Call-out / Full', dataIndex: 'primaryAmount', width: 112 },
    {
      title: 'Fortnox Article',
      render: (_, row) => fortnoxArticle(row, row.primaryArticleKind, fortnoxArticles),
      width: 104,
    },
    { title: 'Includes', dataIndex: 'includes', width: 78 },
    { title: 'Additional Hour', dataIndex: 'secondaryAmount', width: 118 },
    {
      title: 'Fortnox Article',
      render: (_, row) => fortnoxArticle(row, row.secondaryArticleKind, fortnoxArticles),
      width: 104,
    },
  ]
}

function categoryColumns(fortnoxArticles: FortnoxArticleMap): ErpTableColumn<RateRow>[] {
  return [
    { title: 'Rate Label', dataIndex: 'shiftLabel', width: 136 },
    { title: 'Hourly Rate', dataIndex: 'primaryAmount', width: 136 },
    {
      title: 'Fortnox Article',
      render: (_, row) => fortnoxArticle(row, row.primaryArticleKind, fortnoxArticles),
      width: 136,
    },
  ]
}

function tierRateColumns(): ErpTableColumn<TierRateRow>[] {
  return [
    { title: 'Tier', dataIndex: 'tier', width: 120 },
    { title: 'Rate Label', dataIndex: 'shiftLabel', width: 136 },
    { title: 'Rate Type', dataIndex: 'rateType', width: 116 },
    { title: 'Hourly Rate', dataIndex: 'hourlyRate', width: 136 },
  ]
}

function getRateRows(location: LocationCard): RateRow[] {
  if (getRateCardMode(location) === 'category') {
    return location.shifts.map((shift) => ({
      key: `${location.id}-${shift.shift}`,
      shift,
      shiftLabel: shift.shift,
      primaryAmount: formatAmount(location.currency, shift.additionalHours),
      primaryArticleKind: 'additionalHour',
      includes: '-',
      secondaryAmount: '-',
      secondaryArticleKind: undefined,
      location,
    }))
  }
  const standardRows = location.shifts.map((shift) => ({
    key: `${location.id}-${shift.shift}`,
    shift,
    shiftLabel: shift.shift,
    primaryAmount: formatAmount(location.currency, shift.callOutFee),
    primaryArticleKind: 'callOut' as const,
    includes: `${shift.includedHours.toFixed(2)} hrs`,
    secondaryAmount: formatAmount(location.currency, shift.additionalHours),
    secondaryArticleKind: 'additionalHour' as const,
    location,
  }))
  const fullRows = location.shifts
    .filter((shift) => showsFullShift(shift.shift))
    .map((shift) => ({
      key: `${location.id}-${shift.shift}-full`,
      shift,
      shiftLabel: fullShiftLabel(shift),
      primaryAmount: formatAmount(location.currency, shift.fullShiftRate),
      primaryArticleKind: 'fullShift' as const,
      includes: '-',
      secondaryAmount: '-',
      secondaryArticleKind: undefined,
      location,
    }))
  return [...standardRows, ...fullRows]
}

function LocationFocusPanel({
  customer,
  fortnoxArticles,
  location,
}: {
  customer: Customer
  fortnoxArticles: FortnoxArticleMap
  location: LocationCard
}) {
  const mode = getRateCardMode(location)
  const rows = getRateRows(location)
  const akamaiCategory = customer.customerKey === 'AKAM' && mode === 'category'
  const tierRows: TierRateRow[] = (location.tierRates || []).length
    ? (location.tierRates || [])
        .slice()
        .sort((left, right) =>
          `${left.tier}-${left.shift}-${left.rateType}`.localeCompare(
            `${right.tier}-${right.shift}-${right.rateType}`,
          ),
        )
        .map((rate, index) => ({
          key: `${location.id}-${rate.tier}-${rate.shift}-${rate.rateType}-${index}`,
          tier: rate.tier,
          shiftLabel: rate.shift,
          rateType: rate.shift === 'OBH1' ? rate.rateType : '-',
          hourlyRate: formatAmount(location.currency, rate.rate),
        }))
    : []

  return (
    <Card className="section-card section-card-compact" variant="borderless">
      {akamaiCategory || (mode === 'category' && tierRows.length) ? (
        <ErpDataTable<TierRateRow>
          className="nested-table rate-card-detail-table"
          columnSizing="manual"
          columns={tierRateColumns()}
          dataSource={tierRows}
          pagination={false}
          rowKey="key"
          scroll={{ x: 664 }}
        />
      ) : (
        <ErpDataTable<RateRow>
          className="nested-table rate-card-detail-table"
          columnSizing="manual"
          columns={mode === 'category' ? categoryColumns(fortnoxArticles) : timeWindowColumns(fortnoxArticles)}
          dataSource={rows}
          rowKey="key"
          scroll={{ x: mode === 'category' ? 408 : 634 }}
        />
      )}
      {location.siteAliases?.length ? (
        <div className="info-field info-field-spaced">
          <span>Site Aliases</span>
          <strong>{location.siteAliases.join(', ')}</strong>
        </div>
      ) : null}
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
          <LocationFocusPanel customer={customer} fortnoxArticles={fortnoxArticles} location={row.location} />
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
