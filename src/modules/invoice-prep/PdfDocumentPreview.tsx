import { useEffect, useRef, useState } from 'react'

type DesktopWindowApi = {
  debugLog?: (message: string) => void
  readDocument?: (payload: { storedPath: string }) => Promise<Uint8Array | ArrayBuffer | null>
}

type PdfDocument = {
  destroy?: () => Promise<void> | void
  getPage: (pageNumber: number) => Promise<PdfPage>
  numPages: number
}

type PdfPage = {
  getViewport: (input: { scale: number }) => { height: number; width: number }
  render: (input: {
    canvasContext: CanvasRenderingContext2D
    viewport: { height: number; width: number }
  }) => { cancel?: () => void; promise: Promise<void> }
}

type PdfjsModule = {
  getDocument: (source: { data: Uint8Array }) => { promise: Promise<PdfDocument> }
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopWindowApi }).desktopWindow
}

function toUint8Array(value: Uint8Array | ArrayBuffer | ArrayLike<number> | null) {
  if (!value) return null
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
  if (Array.isArray(value)) return Uint8Array.from(value)
  if (typeof value === 'object') {
    const numericKeys = Object.keys(value).filter((key) => /^\d+$/.test(key)).sort((left, right) => Number(left) - Number(right))
    if (numericKeys.length > 0) {
      return Uint8Array.from(numericKeys.map((key) => Number(value[key as keyof typeof value])))
    }
  }
  return null
}

async function loadPdfjs(): Promise<PdfjsModule> {
  const root = globalThis as typeof globalThis & { pdfjsWorker?: unknown }
  if (!root.pdfjsWorker) {
    const workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
    root.pdfjsWorker = workerModule
  }
  return import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as Promise<PdfjsModule>
}

export function PdfDocumentPreview({ storedPath }: { storedPath: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null)
  const pdfRef = useRef<PdfDocument | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [width, setWidth] = useState(720)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasRenderedPage, setHasRenderedPage] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.max(320, Math.floor(entries[0]?.contentRect.width || 720) - 24)
      setWidth(Math.min(nextWidth, 960))
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const api = desktopWindow()
    const readDocument = api?.readDocument
    pdfRef.current = null
    renderTaskRef.current?.cancel?.()
    renderTaskRef.current = null
    setPageCount(0)
    setPageNumber(1)
    setError('')
    setHasRenderedPage(false)
    if (!readDocument || !storedPath) {
      setError('PDF preview is not available in this desktop build.')
      return
    }
    let cancelled = false
    setIsLoading(true)
    void Promise.all([readDocument({ storedPath }), loadPdfjs()])
      .then(async ([result, pdfjs]) => {
        if (cancelled) return
        const data = toUint8Array(result)
        if (!data) throw new Error('PDF data could not be loaded.')
        api?.debugLog?.(`pdf-preview read-ok path=${storedPath} bytes=${data.byteLength}`)
        const loadingTask = pdfjs.getDocument({ data })
        const document = await loadingTask.promise
        if (cancelled) {
          await document.destroy?.()
          return
        }
        pdfRef.current = document
        setPageCount(document.numPages)
        setPageNumber(1)
        api?.debugLog?.(`pdf-preview load-ok path=${storedPath} pages=${document.numPages}`)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        api?.debugLog?.(`pdf-preview load-error path=${storedPath} error=${message}`)
        setError(`PDF preview could not be rendered. ${message}`)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storedPath])

  useEffect(() => {
    const api = desktopWindow()
    const document = pdfRef.current
    const canvas = canvasRef.current
    if (!document || !canvas || pageCount < 1 || pageNumber < 1 || pageNumber > pageCount) return
    let cancelled = false
    setError('')
    renderTaskRef.current?.cancel?.()
    renderTaskRef.current = null
    const shouldShowLoading = !hasRenderedPage
    if (shouldShowLoading) setIsLoading(true)
    void document.getPage(pageNumber)
      .then(async (page) => {
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = width / Math.max(baseViewport.width, 1)
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas context is not available.')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.style.width = `${Math.ceil(viewport.width)}px`
        canvas.style.height = `${Math.ceil(viewport.height)}px`
        const renderTask = page.render({ canvasContext: context, viewport })
        renderTaskRef.current = renderTask
        await renderTask.promise
        if (cancelled) return
        setHasRenderedPage(true)
        api?.debugLog?.(`pdf-preview render-ok path=${storedPath} page=${pageNumber}`)
      })
      .catch((renderError: unknown) => {
        if (cancelled) return
        const message = renderError instanceof Error ? renderError.message : String(renderError)
        api?.debugLog?.(`pdf-preview render-error path=${storedPath} page=${pageNumber} error=${message}`)
        setError(`PDF preview could not be rendered. ${message}`)
      })
      .finally(() => {
        if (!cancelled && shouldShowLoading) setIsLoading(false)
      })
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
    }
  }, [pageCount, pageNumber, storedPath, width])

  return (
    <div className="invoice-pdf-preview" ref={hostRef}>
      {pageCount > 0 ? (
        <div className="invoice-pdf-toolbar">
          <button className="invoice-pdf-toolbar-button" disabled={pageNumber <= 1 || isLoading} onClick={() => setPageNumber((current) => Math.max(1, current - 1))} type="button">
            Previous
          </button>
          <span className="invoice-pdf-toolbar-label">Page {pageNumber} of {pageCount}</span>
          <button className="invoice-pdf-toolbar-button" disabled={pageNumber >= pageCount || isLoading} onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))} type="button">
            Next
          </button>
        </div>
      ) : null}
      {error ? <div className="invoice-document-preview-empty">{error}</div> : null}
      {!error && isLoading && !hasRenderedPage ? <div className="invoice-document-preview-empty">Loading document...</div> : null}
      {!error && !isLoading && pageCount === 0 ? <div className="invoice-document-preview-empty">Select a document to preview it.</div> : null}
      <div className="invoice-pdf-canvas-wrap" hidden={Boolean(error) || pageCount === 0}>
        <canvas className="invoice-pdf-canvas" ref={canvasRef} />
      </div>
    </div>
  )
}
