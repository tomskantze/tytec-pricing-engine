import { getCrossedShiftPricing } from "./crossedShiftPricing";
import { getShiftLabelForDate, parseWorkTimestamp } from "./dates";
import { getFortnoxArticleNumber } from "./fortnoxArticles";
import type { FortnoxArticleMap } from "./fortnoxArticles";
import { getMatchedLocationCard } from "./matching";
import { roundMoney } from "./money";
import { getRateCardMode } from "./rateCards";
import { getReportedHourBuckets, getReportedHoursPricing } from "./reportedHours";
import type { Customer, JobInput, JobReviewOverride, LocationCard, PricedJob, PricingBreakdown, ShiftBucket, ShiftRate, TimeWindowShiftLabel } from "./types";

function isCancellation(job: JobInput): boolean {
  return job.reportStatus.trim().toLowerCase() === "last minute cancellation";
}

function isShadowing(job: JobInput): boolean {
  const text = [job.completionNotes, job.summary, job.reportStatus]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bshadow(?:ed|ing)?\b/.test(text);
}

function hasReportedHourData(job: JobInput): boolean {
  if (job.reportedHours && [job.reportedHours.bh, job.reportedHours.obh, job.reportedHours.wh].some((value) => value > 0)) {
    return true
  }
  if (!job.reportedHoursByLabel) return false
  return Object.values(job.reportedHoursByLabel).some((value) => Number(value || 0) > 0)
}

function getWorkInterval(job: JobInput): { start: Date; end: Date } | null {
  const start = parseWorkTimestamp(job.onSite);
  const end = parseWorkTimestamp(job.offSite);
  if (!start || !end || end.getTime() === start.getTime()) return null;
  const normalizedEnd = new Date(end.getTime());
  if (normalizedEnd < start) normalizedEnd.setDate(normalizedEnd.getDate() + 1);
  return { start, end: normalizedEnd };
}

function shiftLabelForJob(job: JobInput, value: Date) {
  return job.publicHoliday ? "Weekend / Holiday" : getShiftLabelForDate(value);
}

function getShiftHourBuckets(job: JobInput): ShiftBucket {
  const interval = getWorkInterval(job);
  if (!interval) return { bh: 0, night: 0, weekend: 0 };

  let current = new Date(interval.start.getTime());
  let bh = 0;
  let night = 0;
  let weekend = 0;

  while (current < interval.end) {
    const next = new Date(Math.min(current.getTime() + 15 * 60 * 1000, interval.end.getTime()));
    const minutes = (next.getTime() - current.getTime()) / 60000;
    const label = shiftLabelForJob(job, current);
    if (label === "08:00-18:00") bh += minutes;
    else if (label === "18:00-08:00") night += minutes;
    else weekend += minutes;
    current = next;
  }

  return { bh: bh / 60, night: night / 60, weekend: weekend / 60 };
}

function calculateShiftRowAmount(rateRow: ShiftRate, hours: number, includeCallOut: boolean) {
  const roundedHours = Math.round(Math.max(0, hours) * 100) / 100;
  const additionalHours = includeCallOut ? Math.max(0, roundedHours - rateRow.includedHours) : roundedHours;
  const base = includeCallOut ? rateRow.callOutFee : 0;
  return {
    amount: roundMoney(base + additionalHours * rateRow.additionalHours),
    callOutFee: includeCallOut ? rateRow.callOutFee : 0,
    additionalHours,
    additionalHourRate: rateRow.additionalHours,
  };
}

function findRateRow(card: LocationCard, job: JobInput): ShiftRate | undefined {
  if (getRateCardMode(card) !== 'time-window') return undefined;
  const start = parseWorkTimestamp(job.onSite || job.travelStart);
  if (!start) return undefined;
  const shift = shiftLabelForJob(job, start);
  return card.shifts.find((row) => row.shift === shift);
}

export function getManualReasons(customer: Customer, job: JobInput, card?: LocationCard): string[] {
  const reasons: string[] = [];
  const reportedHours = getReportedHourBuckets(job);
  const hasReportedHours = hasReportedHourData(job);
  const categoryRateCard = getRateCardMode(card) === 'category';
  if (!job.ticket && !categoryRateCard) reasons.push("Missing ticket");
  if (!job.jiraIssueKey && !categoryRateCard) reasons.push("No Jira ticket match");
  if ((!job.city || !job.country) && !card) reasons.push("Missing city or country");
  if (!card) reasons.push("No customer rate card for this location");
  if (isCancellation(job)) reasons.push("Cancellation pricing needs manual decision");
  if (isShadowing(job)) reasons.push("Shadowing visit is not billable");

  if (!hasReportedHours && !getWorkInterval(job)) reasons.push("Work-report timestamps incomplete");
  if (card && getRateCardMode(card) === 'time-window' && !reportedHours && !findRateRow(card, job)) reasons.push("No rate row for derived shift");
  if (!customer.locationCards.length) reasons.push("No customer rate cards configured");
  return reasons;
}

export function getPricingBreakdown(
  customer: Customer,
  card: LocationCard,
  job: JobInput,
  fortnoxArticles?: FortnoxArticleMap,
  override?: JobReviewOverride,
): PricingBreakdown | null {
  if (isCancellation(job)) return null;
  const reportedHoursPricing = getReportedHoursPricing(customer, card, job, fortnoxArticles, override);
  if (reportedHoursPricing) return reportedHoursPricing;
  if (getRateCardMode(card) !== 'time-window') return null;

  const interval = getWorkInterval(job);
  if (!interval) return null;

  const buckets = getShiftHourBuckets(job);
  const startShift = shiftLabelForJob(job, interval.start) as TimeWindowShiftLabel;
  const endMarker = new Date(interval.end.getTime() - 1);
  const endShift = shiftLabelForJob(job, endMarker) as TimeWindowShiftLabel;
  const usedShiftCount = [buckets.bh, buckets.night, buckets.weekend].filter((value) => value > 0).length;
  const crossedShift = usedShiftCount > 1 || startShift !== endShift;

  if (!crossedShift) {
    const row = findRateRow(card, job);
    if (!row) return null;
    const hours = (interval.end.getTime() - interval.start.getTime()) / 3600000;
    const charge = calculateShiftRowAmount(row, hours, true);
    const isBusiness = startShift === "08:00-18:00";
    const isNight = startShift === "18:00-08:00";
    const isWeekend = startShift === "Weekend / Holiday";
    const additionalTotal = roundMoney(charge.amount - charge.callOutFee);

    return {
      currency: card.currency,
      crossedShift: false,
      method: "single-shift-callout",
      callOutFee: charge.callOutFee,
      callOutShift: startShift,
      includedHours: row.includedHours,
      hours: {
        bh: isBusiness ? charge.additionalHours : 0,
        obh: isNight ? charge.additionalHours : 0,
        wh: isWeekend ? charge.additionalHours : 0,
      },
      splitHours: {
        bh: isBusiness ? charge.additionalHours : 0,
        night: isNight ? charge.additionalHours : 0,
        weekend: isWeekend ? charge.additionalHours : 0,
      },
      bhAmount: isBusiness ? additionalTotal : 0,
      obhAmount: isNight ? additionalTotal : 0,
      whAmount: isWeekend ? additionalTotal : 0,
      totalAmount: roundMoney(charge.amount),
      lineItems: [
        {
          articleNumber: getFortnoxArticleNumber(card.id, startShift, "callOut", fortnoxArticles),
          description: "Call-Out Fee",
          quantity: 1,
          unitPrice: charge.callOutFee,
          total: charge.callOutFee,
          currency: card.currency,
        },
        ...(charge.additionalHours > 0
          ? [{
            articleNumber: getFortnoxArticleNumber(card.id, startShift, "additionalHour", fortnoxArticles),
            description: isBusiness ? "BH Additional Hours" : isNight ? "OBH Additional Hours" : "Weekend / Holiday Additional Hours",
            quantity: charge.additionalHours,
            unitPrice: charge.additionalHourRate,
            total: additionalTotal,
            currency: card.currency,
          }]
          : []),
      ],
    };
  }
  return getCrossedShiftPricing(card, interval, buckets, startShift, endShift, fortnoxArticles);
}

function getOverrideLocation(customer: Customer, override?: JobReviewOverride): LocationCard | undefined {
  return override?.treatAsLocationId ? customer.locationCards.find((location) => location.id === override.treatAsLocationId) : undefined;
}

function overrideNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? roundMoney(value) : null;
}

function rawNumber(value: string | undefined): number | null {
  const amount = Number(value || "");
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
}

export function priceJob(customer: Customer, job: JobInput, override?: JobReviewOverride, fortnoxArticles?: FortnoxArticleMap): PricedJob {
  const matchedLocation = getOverrideLocation(customer, override) || getMatchedLocationCard(customer, job);
  const rawManualLabor = rawNumber(job.raw.manualLaborTotal);
  const rawManualCurrency = String(job.raw.manualCurrency || "").trim();
  const manualFinal = overrideNumber(override?.manualFinalAmount);
  const manualLabor = overrideNumber(override?.manualLaborAmount) ?? rawManualLabor;
  const manualTravel = overrideNumber(override?.manualTravelAmount);
  const manualConsumables = overrideNumber(override?.manualConsumablesAmount);
  const hasManualAmounts = [manualLabor, manualTravel, manualConsumables].some((value) => value != null);

  if (manualFinal != null) {
    const currency = matchedLocation?.currency || rawManualCurrency || "EUR";
    return {
      ...job,
      reviewOverride: override,
      consumablesAmount: manualConsumables ?? job.consumablesAmount,
      matchedLocation,
      manualReasons: [],
      queueState: "Ready",
      currency,
      laborAmount: manualLabor,
      travelAmount: manualTravel ?? 0,
      totalAmount: manualFinal,
      invoiceMode: matchedLocation?.invoiceMode || customer.defaultInvoiceMode,
    };
  }

  const manualReasons = getManualReasons(customer, job, matchedLocation);
  const pricing = matchedLocation ? getPricingBreakdown(customer, matchedLocation, job, fortnoxArticles, override) : null;
  const currency = matchedLocation?.currency || rawManualCurrency || "EUR";
  const isReviewHold = Boolean(override?.forceReview && !override.approved && !hasManualAmounts);
  const laborAmount = manualLabor ?? (isReviewHold ? null : pricing?.totalAmount ?? null);
  const travelAmount = manualTravel ?? 0;
  const consumablesAmount = manualConsumables ?? job.consumablesAmount;
  const blockedForShadowing = manualFinal == null && manualLabor == null && isShadowing(job);
  const totalAmount = blockedForShadowing || laborAmount == null ? null : roundMoney(laborAmount + travelAmount + consumablesAmount);
  const approvedReady = Boolean((override?.approved || hasManualAmounts) && totalAmount != null);
  const reviewReasons = isReviewHold ? ["Manual review requested"] : [];
  const pricingReasons = !pricing && matchedLocation && getRateCardMode(matchedLocation) === 'category'
    ? ['No technician or fallback rate for this Akamai line']
    : []
  const allReasons = approvedReady ? [] : [...reviewReasons, ...(pricing && !manualReasons.length ? [] : manualReasons), ...pricingReasons];

  return {
    ...job,
    reviewOverride: override,
    consumablesAmount,
    matchedLocation,
    pricing: pricing ?? undefined,
    manualReasons: allReasons,
    queueState: totalAmount != null && !allReasons.length ? "Ready" : "Blocked",
    currency,
    laborAmount,
    travelAmount,
    totalAmount,
    invoiceMode: matchedLocation?.invoiceMode || customer.defaultInvoiceMode,
  };
}

export function priceJobs(
  customer: Customer,
  jobs: JobInput[],
  overrides: Record<string, JobReviewOverride> = {},
  fortnoxArticles?: FortnoxArticleMap,
): PricedJob[] {
  return jobs.map((job) => priceJob(customer, job, overrides[job.id], fortnoxArticles));
}
