import { Button, Empty, Modal, Popconfirm, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { formatAmount } from '../../domain/money'
import { PdfDocumentPreview } from '../invoice-prep/PdfDocumentPreview'
import type { SavedQuote } from './quoteTypes'

export function SavedQuotesPanel({
  onDeleteQuote,
  onSavePdfAs,
  quotes,
  onLoadQuote,
}: {
  onDeleteQuote: (quoteId: string) => void
  onSavePdfAs: (quoteId: string) => void
  quotes: SavedQuote[]
  onLoadQuote: (quoteId: string) => void
}) {
  const [previewQuoteId, setPreviewQuoteId] = useState('')
  const previewQuote = useMemo(
    () => quotes.find((quote) => quote.id === previewQuoteId) || null,
    [previewQuoteId, quotes],
  )

  return (
    <section className="fortnox-quote-panel">
      <div className="toolbar-row">
        <Typography.Text strong>Saved Quotes</Typography.Text>
        <span className="toolbar-count">{quotes.length}</span>
      </div>
      {quotes.length ? (
        <div className="fortnox-saved-quotes">
          {quotes.map((quote) => (
            <div className="fortnox-saved-quote" key={quote.id}>
              <div className="fortnox-saved-quote-main">
                <div className="fortnox-saved-quote-head">
                  <strong>{quote.quoteName}</strong>
                  <span className="fortnox-saved-quote-ref">{quote.quoteRef}</span>
                </div>
                <div className="fortnox-saved-quote-meta">
                  <span>{formatAmount(quote.currency, quote.grandTotal)}</span>
                  <span>{new Date(quote.updatedAt).toLocaleDateString()}</span>
                  <span>{quote.customerPdf?.storedPath ? 'PDF stored' : 'Draft only'}</span>
                </div>
              </div>
              <div className="fortnox-quote-actions fortnox-quote-actions-inline">
                <Button onClick={() => onLoadQuote(quote.id)} size="small">Load</Button>
                <Button
                  disabled={!quote.customerPdf?.storedPath}
                  onClick={() => setPreviewQuoteId(quote.id)}
                  size="small"
                >
                  View PDF
                </Button>
                <Button
                  disabled={!quote.customerPdf?.storedPath}
                  onClick={() => onSavePdfAs(quote.id)}
                  size="small"
                >
                  Save As...
                </Button>
                <Popconfirm
                  okText="Delete"
                  okType="danger"
                  onConfirm={() => onDeleteQuote(quote.id)}
                  title="Delete this saved quote?"
                >
                  <Button danger size="small">Delete</Button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      <Modal
        footer={null}
        onCancel={() => setPreviewQuoteId('')}
        open={Boolean(previewQuote?.customerPdf?.storedPath)}
        title={previewQuote ? `${previewQuote.quoteRef} · ${previewQuote.quoteName}` : 'Saved Quote'}
        width={980}
      >
        {previewQuote?.customerPdf?.storedPath ? <PdfDocumentPreview storedPath={previewQuote.customerPdf.storedPath} /> : null}
      </Modal>
    </section>
  )
}
