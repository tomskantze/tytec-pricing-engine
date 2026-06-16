import { normalizeServiceDate } from '../domain/dates'
import { getPricingExplanationLines } from '../domain/pricingExplanation'
import type { PricedJob } from '../domain/types'

type Sheet = { name: string; rows: string[][] }

const encoder = new TextEncoder()
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  data.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  })
  return (crc ^ 0xffffffff) >>> 0
}

function write16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >>> 8) & 0xff)
}

function write32(bytes: number[], value: number) {
  write16(bytes, value & 0xffff)
  write16(bytes, (value >>> 16) & 0xffff)
}

function text(value: string) {
  return Array.from(encoder.encode(value))
}

function blobPart(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function zip(files: Array<{ name: string; data: Uint8Array }>) {
  const chunks: Uint8Array[] = []
  const central: number[] = []
  let offset = 0
  files.forEach((file) => {
    const name = text(file.name)
    const crc = crc32(file.data)
    const local: number[] = []
    write32(local, 0x04034b50); write16(local, 20); write16(local, 0); write16(local, 0)
    write16(local, 0); write16(local, 0); write32(local, crc); write32(local, file.data.length)
    write32(local, file.data.length); write16(local, name.length); write16(local, 0)
    chunks.push(new Uint8Array([...local, ...name]), file.data)
    write32(central, 0x02014b50); write16(central, 20); write16(central, 20); write16(central, 0); write16(central, 0)
    write16(central, 0); write16(central, 0); write32(central, crc); write32(central, file.data.length)
    write32(central, file.data.length); write16(central, name.length); write16(central, 0); write16(central, 0)
    write16(central, 0); write16(central, 0); write32(central, 0); write32(central, offset); central.push(...name)
    offset += local.length + name.length + file.data.length
  })
  const centralOffset = offset
  const centralBytes = new Uint8Array(central)
  chunks.push(centralBytes)
  const end: number[] = []
  write32(end, 0x06054b50); write16(end, 0); write16(end, 0); write16(end, files.length); write16(end, files.length)
  write32(end, centralBytes.length); write32(end, centralOffset); write16(end, 0)
  chunks.push(new Uint8Array(end))
  return new Blob(chunks.map(blobPart), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function xml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function col(index: number) {
  let value = index + 1
  let label = ''
  while (value) {
    const next = (value - 1) % 26
    label = String.fromCharCode(65 + next) + label
    value = Math.floor((value - next - 1) / 26)
  }
  return label
}

function safeSheetName(name: string, used: Set<string>) {
  const base = (name || 'Report').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Report'
  let candidate = base
  let index = 2
  while (used.has(candidate)) {
    const suffix = ` ${index}`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
    index += 1
  }
  used.add(candidate)
  return candidate
}

function sheetXml(rows: string[][]) {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const ref = `${col(colIndex)}${rowIndex + 1}`
      return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

function workbookXml(sheets: Sheet[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`
}

function workbookRels(sheets: Sheet[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`
}

function contentTypes(sheets: Sheet[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
}

function relsXml() {
  return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
}

function amount(value: number | null | undefined) {
  return value == null ? '' : value.toFixed(2)
}

function sourceValue(job: PricedJob, header: string) {
  const value = job.raw[header] ?? ''
  const key = header.trim().toLowerCase()
  if (key === 'date') return job.date || normalizeServiceDate(value)
  if (key.includes('date')) return value ? normalizeServiceDate(value) : ''
  return value
}

function pricingLogic(job: PricedJob) {
  return getPricingExplanationLines(job, false).map((line) => line.text).join(' | ')
}

function reportRows(jobs: PricedJob[], sourceHeaders: string[]) {
  const headers = [...sourceHeaders, 'Amount', 'Tytec Ticket', 'Pricing Logic']
  const rows = jobs.slice().sort((left, right) => left.sourceRow - right.sourceRow).map((job) => [
    ...sourceHeaders.map((header) => sourceValue(job, header)),
    amount(job.totalAmount),
    job.jiraIssueKey ?? '',
    pricingLogic(job),
  ])
  return [headers, ...rows]
}

export function pricedCustomerReportToXlsx(jobs: PricedJob[], sourceHeaders: string[], monthSheetName: string) {
  const usedNames = new Set<string>()
  const sheets: Sheet[] = [{ name: safeSheetName(monthSheetName || 'Priced Report', usedNames), rows: reportRows(jobs, sourceHeaders) }]
  const entities = Array.from(new Set(jobs.map((job) => job.businessEntity || 'Customer').filter(Boolean)))
  entities.forEach((entity) => {
    sheets.push({ name: safeSheetName(entity, usedNames), rows: reportRows(jobs.filter((job) => (job.businessEntity || 'Customer') === entity), sourceHeaders) })
  })
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes(sheets)) },
    { name: '_rels/.rels', data: encoder.encode(relsXml()) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml(sheets)) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels(sheets)) },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: encoder.encode(sheetXml(sheet.rows)) })),
  ]
  return zip(files)
}
