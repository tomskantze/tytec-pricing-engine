const latin1 = new TextDecoder('latin1')

type PayinfoParseResult = {
  payinfoNumber: string
  invoiceNumbers: string[]
  totalAmount: number | null
}

export type InvoicePdfLine = {
  invoiceNumber: string
  invoiceDate: string
  technician: string
  periodStart: string
  periodEnd: string
  hours: number
  unitRate: number
  amount: number
}

type InvoicePdfParseResult = {
  invoiceNumbers: string[]
  lines: InvoicePdfLine[]
}

type PdfTextItem = {
  str?: string
  transform?: number[]
  width?: number
}

type PdfTextContent = {
  items: PdfTextItem[]
}

type PdfPage = {
  getTextContent: () => Promise<PdfTextContent>
}

type PdfDocument = {
  destroy?: () => Promise<void> | void
  getPage: (pageNumber: number) => Promise<PdfPage>
  numPages: number
}

type PdfjsModule = {
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<PdfDocument> }
}

function uniqueMatches(text: string, pattern: RegExp) {
  return Array.from(new Set(text.match(pattern) || []))
}

function parseAmount(value: string) {
  const normalized = String(value || '').replace(/[^0-9.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseLocalizedAmount(value: string) {
  const text = String(value || '').trim().replace(/\s+/g, '').replace(/[.,]+$/g, '')
  if (!text) return null
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  const decimalIndex = Math.max(lastComma, lastDot)
  if (decimalIndex >= 0) {
    const integerPart = text.slice(0, decimalIndex).replace(/[^0-9-]/g, '')
    const decimalPart = text.slice(decimalIndex + 1).replace(/[^0-9]/g, '')
    const parsed = Number(`${integerPart}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }
  const digitsOnly = text.replace(/[^0-9-]/g, '')
  if (/^-?\d{5,}$/.test(digitsOnly)) {
    const sign = digitsOnly.startsWith('-') ? '-' : ''
    const unsigned = digitsOnly.replace('-', '')
    const integerPart = unsigned.slice(0, -2) || '0'
    const decimalPart = unsigned.slice(-2)
    const parsed = Number(`${sign}${integerPart}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }
  const parsed = Number(digitsOnly)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePayinfoTotal(text: string, fileName: string) {
  const fileNameMatch = fileName.match(/([0-9][0-9.,\s]{4,})/)
  const fileNameAmount = fileNameMatch?.[1] ? parseLocalizedAmount(fileNameMatch[1]) : null
  const explicitMatch =
    text.match(/\b(?:Payment\s+Amount|Payment\s+Total|Net\s+Amount|Total\s+Amount|Total)\b[^0-9]{0,40}([0-9][0-9\s.,]+)/i)
    || text.match(/\bSEK\b[^0-9]{0,20}([0-9][0-9\s.,]+)/i)
  if (explicitMatch?.[1]) {
    const parsed = parseLocalizedAmount(explicitMatch[1])
    if (parsed != null && parsed > 0) return parsed
  }
  return fileNameAmount
}

async function loadPdfjs(): Promise<PdfjsModule> {
  const root = globalThis as typeof globalThis & { pdfjsWorker?: unknown }
  if (!root.pdfjsWorker) {
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
    root.pdfjsWorker = workerModule
  }
  return import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<PdfjsModule>
}

async function inflatePdfStream(bytes: Uint8Array) {
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'))
  const inflated = await new Response(stream).arrayBuffer()
  return latin1.decode(inflated)
}

function trimPdfStream(bytes: Uint8Array) {
  let trimmed = bytes
  while (trimmed.length && (trimmed[trimmed.length - 1] === 0x0a || trimmed[trimmed.length - 1] === 0x0d)) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed
}

async function extractPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const source = latin1.decode(bytes)
  const chunks = [source]
  let index = 0
  while ((index = source.indexOf('stream', index)) !== -1) {
    let start = index + 6
    if (source[start] === '\r' && source[start + 1] === '\n') start += 2
    else if (source[start] === '\n') start += 1
    const end = source.indexOf('endstream', start)
    if (end === -1) break
    try {
      chunks.push(await inflatePdfStream(trimPdfStream(bytes.slice(start, end))))
    }
    catch {
      // ignore non-deflate streams
    }
    index = end + 9
  }
  return chunks.join('\n')
}

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function pageLines(items: PdfTextItem[]) {
  const positioned = items
    .map((item) => ({
      text: normalizeWhitespace(item.str || ''),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .filter((item) => item.text)
    .sort((left, right) => {
      const deltaY = right.y - left.y
      if (Math.abs(deltaY) > 2) return deltaY
      return left.x - right.x
    })

  const lines: Array<{ y: number; words: Array<{ text: string; x: number }> }> = []
  for (const item of positioned) {
    const line = lines.find((entry) => Math.abs(entry.y - item.y) <= 2)
    if (line) {
      line.words.push({ text: item.text, x: item.x })
      continue
    }
    lines.push({ y: item.y, words: [{ text: item.text, x: item.x }] })
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => line.words.sort((left, right) => left.x - right.x).map((word) => word.text).join(' '))
    .map(normalizeWhitespace)
    .filter(Boolean)
}

function parseInvoicePage(lines: string[]): InvoicePdfLine[] {
  const invoiceLineIndex = lines.findIndex((line) => /V-\d{5}-\d{2}/.test(line))
  const invoiceNumber = invoiceLineIndex >= 0 ? lines[invoiceLineIndex].match(/V-\d{5}-\d{2}/)?.[0] || '' : ''
  if (!invoiceNumber) return []

  const invoiceDate =
    (invoiceLineIndex >= 0 ? lines[invoiceLineIndex].match(/\b\d{2}-\d{2}-\d{4}\b/) : null)?.[0]
    || lines.slice(Math.max(0, invoiceLineIndex - 3), Math.max(0, invoiceLineIndex + 1))
      .flatMap((line) => Array.from(line.matchAll(/\b\d{2}-\d{2}-\d{4}\b/g)).map((match) => match[0]))
      .find(Boolean)
    || ''

  const memoLine = lines.find((line) => line.includes('MEMO:')) || ''
  const memoMatch = memoLine.match(/MEMO:\s*(.+?)\s*-\s*(\d{2}-\d{2}-\d{4})\s*to\s*(\d{2}-\d{2}-\d{4})/i)
  if (!memoMatch) return []
  const technician = normalizeWhitespace(memoMatch[1])
  const periodStart = memoMatch[2]
  const periodEnd = memoMatch[3]

  return lines
    .filter((line) => /\bHours\b/.test(line))
    .map((line) => {
      const match = line.match(/Hours\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i)
      if (!match) return null
      const hours = parseAmount(match[1])
      const unitRate = parseAmount(match[2])
      const amount = parseAmount(match[3])
      if (!hours || !unitRate) return null
      return {
        invoiceNumber,
        invoiceDate,
        technician,
        periodStart,
        periodEnd,
        hours,
        unitRate,
        amount,
      }
    })
    .filter((line): line is InvoicePdfLine => Boolean(line))
}

export async function parsePayinfoPdf(file: File): Promise<PayinfoParseResult> {
  const text = await extractPdfText(file)
  return {
    payinfoNumber: text.match(/VENDPYMT\d+/)?.[0] || file.name.match(/VENDPYMT\d+/)?.[0] || '',
    invoiceNumbers: uniqueMatches(text, /V-\d{5}-\d{2}/g),
    totalAmount: parsePayinfoTotal(text, file.name),
  }
}

export async function parseInvoicePdf(file: File): Promise<InvoicePdfParseResult> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({ data })
  const document = await loadingTask.promise
  const lines: InvoicePdfLine[] = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      lines.push(...parseInvoicePage(pageLines(textContent.items)))
    }
  } finally {
    await document.destroy?.()
  }
  return {
    invoiceNumbers: Array.from(new Set(lines.map((line) => line.invoiceNumber))),
    lines,
  }
}
