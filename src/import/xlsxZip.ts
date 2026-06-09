type ZipEntry = {
  compressedSize: number
  compression: number
  localOffset: number
}

const decoder = new TextDecoder()

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

function findEndOfCentralDirectory(view: DataView) {
  const min = Math.max(0, view.byteLength - 66000)
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) return offset
  }
  throw new Error('XLSX ZIP directory was not found.')
}

async function inflateRaw(bytes: Uint8Array) {
  const payload = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(payload).set(bytes)
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readEntry(buffer: ArrayBuffer, entry: ZipEntry) {
  const view = new DataView(buffer)
  if (u32(view, entry.localOffset) !== 0x04034b50) throw new Error('XLSX ZIP entry is invalid.')
  const nameLength = u16(view, entry.localOffset + 26)
  const extraLength = u16(view, entry.localOffset + 28)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const bytes = new Uint8Array(buffer, start, entry.compressedSize)
  if (entry.compression === 0) return bytes
  if (entry.compression === 8) return inflateRaw(bytes)
  throw new Error(`Unsupported XLSX compression method ${entry.compression}.`)
}

export async function readZipTextEntries(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const eocd = findEndOfCentralDirectory(view)
  const entryCount = u16(view, eocd + 10)
  let offset = u32(view, eocd + 16)
  const entries = new Map<string, ZipEntry>()

  for (let index = 0; index < entryCount; index += 1) {
    if (u32(view, offset) !== 0x02014b50) throw new Error('XLSX ZIP central directory is invalid.')
    const compression = u16(view, offset + 10)
    const compressedSize = u32(view, offset + 20)
    const nameLength = u16(view, offset + 28)
    const extraLength = u16(view, offset + 30)
    const commentLength = u16(view, offset + 32)
    const localOffset = u32(view, offset + 42)
    const nameStart = offset + 46
    const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLength))
    entries.set(name, { compressedSize, compression, localOffset })
    offset = nameStart + nameLength + extraLength + commentLength
  }

  const texts = new Map<string, string>()
  for (const [name, entry] of entries) {
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue
    texts.set(name, decoder.decode(await readEntry(buffer, entry)))
  }
  return texts
}
