import type { Customer, ImportResult } from '../domain/types'
import { parseDelimited } from './csv'
import { importB612Rows } from './b612Report'
import { importTelesolRows } from './telesolReport'
import { readFirstWorksheet } from './xlsxWorkbook'

function headerSet(headers: string[]) {
  return new Set(headers.map((header) => header.trim().toLowerCase()))
}

function isB612Format(headers: string[]) {
  const values = headerSet(headers)
  return [
    'date',
    'client',
    'job location',
    'related ticket',
    'name',
    'ibh_tf_total_2025',
    'obh_tf_total_2025',
  ].every((header) => values.has(header))
}

function parseRows(customer: Customer, rows: Record<string, string>[], headers: string[], sheetName?: string): ImportResult {
  return isB612Format(headers)
    ? importB612Rows(customer, rows, headers, sheetName)
    : importTelesolRows(rows, headers, sheetName)
}

export async function importCustomerReportFile(customer: Customer, file: File): Promise<ImportResult> {
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const sheet = await readFirstWorksheet(file)
    return parseRows(customer, sheet.rows, sheet.headers, sheet.name)
  }

  const parsed = parseDelimited(await file.text())
  return parseRows(customer, parsed.rows, parsed.headers, 'Report')
}
