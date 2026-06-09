import { readZipTextEntries } from './xlsxZip'

export type WorkbookSheet = {
  name: string
  headers: string[]
  rows: Record<string, string>[]
}

const parser = new DOMParser()

function doc(xml: string) {
  return parser.parseFromString(xml, 'application/xml')
}

function textContent(node: Element | null) {
  return node?.textContent ?? ''
}

function columnIndex(cellRef: string) {
  const letters = cellRef.replace(/[^A-Za-z]/g, '')
  let value = 0
  for (const letter of letters) value = value * 26 + letter.toUpperCase().charCodeAt(0) - 64
  return Math.max(0, value - 1)
}

function getSharedStrings(texts: Map<string, string>) {
  const xml = texts.get('xl/sharedStrings.xml')
  if (!xml) return []
  return Array.from(doc(xml).getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t')).map((node) => node.textContent ?? '').join(''),
  )
}

function workbookRelationships(texts: Map<string, string>) {
  const xml = texts.get('xl/_rels/workbook.xml.rels')
  const relationships = new Map<string, string>()
  if (!xml) return relationships
  Array.from(doc(xml).getElementsByTagName('Relationship')).forEach((item) => {
    const id = item.getAttribute('Id')
    const target = item.getAttribute('Target')
    if (id && target) relationships.set(id, target)
  })
  return relationships
}

function firstSheetPath(texts: Map<string, string>) {
  const workbook = doc(texts.get('xl/workbook.xml') ?? '')
  const sheet = workbook.getElementsByTagName('sheet')[0]
  if (!sheet) throw new Error('Workbook does not contain a sheet.')
  const relId = sheet.getAttribute('r:id') ?? ''
  const target = workbookRelationships(texts).get(relId)
  if (!target) throw new Error('Workbook first sheet target was not found.')
  return {
    name: sheet.getAttribute('name') ?? 'Sheet 1',
    path: target.startsWith('/') ? target.slice(1) : `xl/${target}`,
  }
}

function cellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute('t')
  if (type === 's') return sharedStrings[Number(textContent(cell.getElementsByTagName('v')[0]))] ?? ''
  if (type === 'inlineStr') return Array.from(cell.getElementsByTagName('t')).map((node) => node.textContent ?? '').join('')
  return textContent(cell.getElementsByTagName('v')[0])
}

function sheetRows(xml: string, sharedStrings: string[]) {
  return Array.from(doc(xml).getElementsByTagName('row')).map((row) => {
    const cells: string[] = []
    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const index = columnIndex(cell.getAttribute('r') ?? 'A1')
      while (cells.length <= index) cells.push('')
      cells[index] = cellValue(cell, sharedStrings).trim()
    })
    return cells
  })
}

export async function readFirstWorksheet(file: File): Promise<WorkbookSheet> {
  const texts = await readZipTextEntries(await file.arrayBuffer())
  const sharedStrings = getSharedStrings(texts)
  const firstSheet = firstSheetPath(texts)
  const xml = texts.get(firstSheet.path)
  if (!xml) throw new Error('Workbook first sheet XML was not found.')
  const rows = sheetRows(xml, sharedStrings).filter((row) => row.some(Boolean))
  const headers = rows[0] ?? []
  return {
    name: firstSheet.name,
    headers,
    rows: rows.slice(1).map((row) =>
      headers.reduce<Record<string, string>>((record, header, index) => {
        record[header] = row[index] ?? ''
        return record
      }, {}),
    ),
  }
}
