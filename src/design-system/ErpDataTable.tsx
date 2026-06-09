import { Table } from 'antd'
import type { TableProps } from 'antd'

export type ErpColumnSize = 'compact' | 'normal' | 'wide' | 'text' | 'money' | 'date' | 'status' | 'action'
type ErpColumnSizingMode = 'semantic' | 'equal' | 'manual'
export type ErpTableColumn<RecordType extends object> = NonNullable<TableProps<RecordType>['columns']>[number] & {
  erpSize?: ErpColumnSize
}

type ErpDataTableProps<RecordType extends object> = TableProps<RecordType> & {
  columnSizing?: ErpColumnSizingMode
  columns?: ErpTableColumn<RecordType>[]
}

const semanticColumnWeights: Record<ErpColumnSize, number> = {
  compact: 0.58,
  normal: 1,
  wide: 1.6,
  text: 2.9,
  money: 0.68,
  date: 0.62,
  status: 0.58,
  action: 0.48,
}

function getColumnText<RecordType extends object>(column: ErpTableColumn<RecordType>) {
  const record = column as Record<string, unknown>
  const title = typeof column.title === 'string' ? column.title : ''
  const dataIndex = Array.isArray(record.dataIndex) ? record.dataIndex.join(' ') : String(record.dataIndex ?? '')
  const key = String(column.key ?? '')
  return `${title} ${dataIndex} ${key} ${String(column.className ?? '')}`.toLowerCase()
}

function inferColumnSize<RecordType extends object>(column: ErpTableColumn<RecordType>): ErpColumnSize {
  if (column.erpSize) return column.erpSize
  const columnText = getColumnText(column)
  if (/\b(actions?|remove|delete|edit|open|view)\b/.test(columnText)) return 'action'
  if (/\b(status|state|queue state|payment|export)\b/.test(columnText)) return 'status'
  if (/\b(date|issued|due|effective|expiry|period)\b/.test(columnText)) return 'date'
  if (/\b(amount|total|price|fee|labor|travel|consumables|currency|sla|quantity|jobs)\b/.test(columnText)) return 'money'
  if (/\b(summary|description|location|address|contract|customer|legal name|scope|notes?)\b/.test(columnText)) return 'text'
  if (/\b(ticket|invoice|key|code|ref|id)\b/.test(columnText)) return 'compact'
  return 'normal'
}

function getSemanticColumns<RecordType extends object>(columns: ErpTableColumn<RecordType>[]) {
  const unsizedColumns = columns.filter((column) => !column.width)
  const totalWeight = unsizedColumns.reduce((total, column) => total + semanticColumnWeights[inferColumnSize(column)], 0)
  return columns.map((column) => {
    if (column.width) return column
    const semanticSize = inferColumnSize(column)
    const width = `${(semanticColumnWeights[semanticSize] / (totalWeight || 1)) * 100}%`
    return {
      ...column,
      className: ['erp-table-column', `erp-table-column-${semanticSize}`, column.className].filter(Boolean).join(' '),
      width,
    }
  })
}

export function ErpDataTable<RecordType extends object>({
  className,
  columns,
  columnSizing = 'semantic',
  pagination = false,
  tableLayout = 'fixed',
  ...props
}: ErpDataTableProps<RecordType>) {
  const classNames = ['erp-table', 'erp-data-table', className].filter(Boolean).join(' ')
  const normalizedColumns = columns?.length && columnSizing !== 'manual' ? getSemanticColumns(columns) : columns
  return <Table<RecordType> {...props} className={classNames} columns={normalizedColumns} pagination={pagination} tableLayout={tableLayout} />
}
