import { createQuoteDraftDefaults, createQuoteExtraItem, type QuoteDraftSession, type SavedQuote } from "../modules/fortnox/quoteTypes";

const quoteDraftKeyPrefix = "tytec-pricing-engine:quote-draft:v1";

function normalizeExtraItems(draft: Partial<SavedQuote['draft']> | undefined) {
  if (Array.isArray(draft?.extraItems) && draft.extraItems.length) return draft.extraItems;
  const label = String(draft?.otherCostLabel || '').trim();
  const note = String(draft?.otherCostNote || '').trim();
  const amount = typeof draft?.otherCost === 'number' ? draft.otherCost : 0;
  if (!label && !note && !amount) return [];
  return [{
    ...createQuoteExtraItem(1),
    label: label || 'Other cost',
    quantity: 1,
    unit: 'lot',
    unitCost: amount,
    note,
  }];
}

export function normalizeQuote(quote: Partial<SavedQuote>): SavedQuote {
  const defaults = createQuoteDraftDefaults({
    currency: quote.currency || 'EUR',
    rateCardLocationId: quote.draft?.rateCardLocationId || '',
    customerKey: quote.customerKey || '',
    quoteRef: quote.quoteRef || quote.draft?.quoteRef || '',
  })
  return {
    id: quote.id || `quote-${Date.now()}`,
    customerKey: quote.customerKey || '',
    quoteRef: quote.quoteRef || quote.draft?.quoteRef || defaults.quoteRef,
    quoteName: quote.quoteName || quote.draft?.quoteName || 'Untitled Quote',
    currency: quote.currency || quote.draft?.currency || 'EUR',
    grandTotal: typeof quote.grandTotal === 'number' ? quote.grandTotal : 0,
    updatedAt: quote.updatedAt || new Date().toISOString(),
    customerPdf: quote.customerPdf
      ? {
          fileName: quote.customerPdf.fileName || `${quote.quoteRef || quote.draft?.quoteRef || quote.quoteName || 'quote'}.pdf`,
          previewUrl: quote.customerPdf.previewUrl,
          storedPath: quote.customerPdf.storedPath,
          exportedAt: quote.customerPdf.exportedAt || new Date().toISOString(),
        }
      : undefined,
    draft: {
      ...defaults,
      ...quote.draft,
      extraItems: normalizeExtraItems(quote.draft),
      travelGroups: Array.isArray(quote.draft?.travelGroups) && quote.draft?.travelGroups.length
        ? quote.draft.travelGroups
        : defaults.travelGroups,
    },
  }
}

export function loadQuoteDraftSession(
  customerKey: string,
  defaults?: { currency?: string; rateCardLocationId?: string; customerKey?: string; quoteRef?: string },
): QuoteDraftSession | null {
  try {
    const raw = window.localStorage.getItem(`${quoteDraftKeyPrefix}:${customerKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QuoteDraftSession>;
    const fallback = createQuoteDraftDefaults(defaults);
    return {
      activeQuoteId: String(parsed.activeQuoteId || ''),
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      draft: {
        ...fallback,
        ...parsed.draft,
        extraItems: normalizeExtraItems(parsed.draft),
        travelGroups: Array.isArray(parsed.draft?.travelGroups) && parsed.draft?.travelGroups.length
          ? parsed.draft.travelGroups
          : fallback.travelGroups,
      },
    };
  }
  catch {
    return null;
  }
}

export function saveQuoteDraftSession(customerKey: string, session: QuoteDraftSession): void {
  window.localStorage.setItem(`${quoteDraftKeyPrefix}:${customerKey}`, JSON.stringify(session));
}
