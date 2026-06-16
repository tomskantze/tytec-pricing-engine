import tytecBurstDataUrl from './assets/tytec-burst.jpg?inline'
import tytecWordmarkDataUrl from './assets/tytec-wordmark.png?inline'

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type QuoteHtmlLine = {
  label: string
  amount: string
}

type QuoteHtmlTravelGroup = {
  title: string
  details: string[]
}

function paragraphMarkup(value: string) {
  const parts = String(value || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return ''
  return parts.map((part) => `<p>${escapeHtml(part)}</p>`).join('')
}

function listMarkup(items: string[]) {
  const filtered = items.map((item) => item.trim()).filter(Boolean)
  if (!filtered.length) return ''
  return `<ul class="detail-list">${filtered.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
}

function sectionMarkup(title: string, content: string) {
  if (!content.trim()) return ''
  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      ${content}
    </section>
  `
}

export function buildCustomerQuoteHtml(input: {
  customerName: string
  quoteRef: string
  quoteName: string
  workLocation: string
  currency: string
  serviceType: string
  deliveryMode: string
  summaryText: string
  assumptions: string
  basics: Array<{ label: string; value: string }>
  laborDetails: string[]
  travelGroups: QuoteHtmlTravelGroup[]
  extras: string[]
  summaryLines: QuoteHtmlLine[]
  total: string
}) {
  const issueDate = new Date()
  const validUntil = new Date(issueDate)
  validUntil.setDate(validUntil.getDate() + 30)
  const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const issueDateLabel = dateFormatter.format(issueDate)
  const validUntilLabel = dateFormatter.format(validUntil)
  const basicsMarkup = input.basics
    .map((item) => `
      <div class="meta-row">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </div>
    `)
    .join('')
  const scopeMarkup = paragraphMarkup(input.summaryText)
  const laborMarkup = listMarkup(input.laborDetails)
  const travelMarkup = input.travelGroups.length
    ? `<div class="group-grid">${input.travelGroups.map((group) => `
      <section class="group-card">
        <h3>${escapeHtml(group.title)}</h3>
        ${listMarkup(group.details)}
      </section>
    `).join('')}</div>`
    : ''
  const extrasMarkup = listMarkup(input.extras)
  const assumptionsMarkup = listMarkup(
    String(input.assumptions || '')
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean),
  )
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.quoteName || 'Quote')}</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: Inter, Arial, sans-serif; font-size: 12px; color: #21314d; margin: 0; background: #eef3f7; }
    .page { position: relative; max-width: 860px; margin: 0 auto; background: #fff; padding: 18px 24px 22px; overflow: hidden; }
    .watermark { position: absolute; top: 265px; left: 50%; width: 82%; transform: translateX(-50%); opacity: 0.04; z-index: 0; }
    .watermark img { display: block; width: 100%; height: auto; }
    .masthead, .hero, .notice, .meta, .section, .footer { position: relative; z-index: 1; }
    .masthead { display: flex; justify-content: space-between; align-items: start; gap: 20px; padding-bottom: 10px; border-bottom: 1px solid #d9e3ee; }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand-mark { width: 42px; height: 42px; object-fit: cover; border-radius: 999px; opacity: 0.9; }
    .brand-wordmark { height: 40px; width: auto; display: block; }
    .doc-meta { min-width: 236px; display: grid; gap: 6px; }
    .doc-meta-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
    .doc-meta-row span { color: #6b7890; text-transform: uppercase; letter-spacing: 0.06em; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 10px; padding: 14px 0 12px; border-bottom: 1px solid #d9e3ee; }
    .hero-label { margin: 0 0 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #657590; }
    .hero h1 { margin: 0 0 4px; font-size: 26px; line-height: 1.14; color: #1a3158; }
    .hero p { margin: 0; }
    .hero-sub { color: #556680; font-size: 13px; }
    .notice { margin-top: 12px; padding: 8px 10px; border-left: 2px solid #2f66e8; background: #f7f9fc; color: #43526a; font-size: 11px; line-height: 1.45; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; margin: 14px 0 0; padding: 10px 0 2px; border-top: 1px solid #e4ebf2; border-bottom: 1px solid #e4ebf2; }
    .meta-row { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; padding: 6px 0; border-bottom: 1px solid #f0f3f7; }
    .meta-row:nth-last-child(-n + 2) { border-bottom: 0; }
    .meta-row span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7890; }
    .meta-row strong { font-size: 12px; color: #1c2c49; text-align: right; }
    .section { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e4ebf2; break-inside: avoid-page; page-break-inside: avoid; }
    .section h2 { font-size: 14px; margin: 0 0 8px; color: #203252; }
    .section h3 { font-size: 12px; margin: 0 0 6px; color: #253b61; }
    .section p { margin: 0 0 8px; line-height: 1.45; white-space: pre-wrap; }
    .detail-list { margin: 0; padding-left: 16px; line-height: 1.42; }
    .detail-list li { margin: 0 0 3px; }
    .group-grid { display: grid; gap: 8px; }
    .group-card { padding: 9px 10px; border: 1px solid #dfe7f1; border-radius: 7px; background: #fbfcfe; break-inside: avoid-page; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; break-inside: auto; page-break-inside: auto; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { text-align: left; padding: 7px 0; border-bottom: 1px solid #e4ebf2; font-size: 12px; }
    th { color: #60708a; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
    th:last-child, td:last-child { text-align: right; }
    .total { margin-top: 10px; display: flex; justify-content: flex-end; gap: 12px; font-size: 16px; font-weight: 700; color: #1d3154; }
    .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #d9e3ee; display: flex; justify-content: space-between; align-items: end; gap: 14px; color: #6b7890; font-size: 10px; line-height: 1.4; }
    .footer-brand { display: flex; align-items: center; gap: 8px; }
    .footer-mark { width: 20px; height: 20px; object-fit: cover; border-radius: 999px; opacity: 0.72; }
  </style>
</head>
<body>
  <div class="page">
    <div class="watermark">
      <img src="${tytecWordmarkDataUrl}" alt="" />
    </div>
    <div class="masthead">
      <div class="brand">
        <img class="brand-mark" src="${tytecBurstDataUrl}" alt="" />
        <div class="brand-copy">
          <img class="brand-wordmark" src="${tytecWordmarkDataUrl}" alt="Tytec" />
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-meta-row"><span>Quote Ref</span><strong>${escapeHtml(input.quoteRef || '-')}</strong></div>
        <div class="doc-meta-row"><span>Issue Date</span><strong>${escapeHtml(issueDateLabel)}</strong></div>
        <div class="doc-meta-row"><span>Valid Until</span><strong>${escapeHtml(validUntilLabel)}</strong></div>
        <div class="doc-meta-row"><span>Currency</span><strong>${escapeHtml(input.currency)}</strong></div>
      </div>
    </div>

    <div class="hero">
      <div>
        <p class="hero-label">Quotation</p>
        <h1>${escapeHtml(input.quoteName || 'Quote')}</h1>
        <p class="hero-sub">Prepared for ${escapeHtml(input.customerName)}</p>
      </div>
    </div>

    <div class="notice">
      This quotation is valid for 30 calendar days from issue date and is subject to resource availability, site access confirmation, and the commercial assumptions stated below.
    </div>

    <div class="meta">
      ${basicsMarkup}
    </div>

    ${sectionMarkup('Scope Summary', scopeMarkup)}
    ${sectionMarkup('Labor', laborMarkup)}
    ${sectionMarkup('Travel & Stay', travelMarkup)}
    ${sectionMarkup('Extras', extrasMarkup)}

    <section class="section">
      <h2>Price Summary</h2>
      <table>
        <thead><tr><th>Item</th><th>${escapeHtml(input.currency)}</th></tr></thead>
        <tbody>
          ${input.summaryLines.map((line) => `<tr><td>${escapeHtml(line.label)}</td><td>${escapeHtml(line.amount)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="total"><span>Total</span><span>${escapeHtml(input.total)}</span></div>
    </section>

    ${sectionMarkup('Assumptions / Exclusions', assumptionsMarkup)}

    <div class="footer">
      <div>
        Quoted work is based on the stated scope, assumptions, and access conditions. Delays outside Tytec control may affect schedule and billable time.
      </div>
      <div class="footer-brand">
        <img class="footer-mark" src="${tytecBurstDataUrl}" alt="" />
        <div>
          TYTEC<br />
          ${escapeHtml(input.customerName)} quotation
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}
