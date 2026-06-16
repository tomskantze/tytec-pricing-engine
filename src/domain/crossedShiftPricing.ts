import { getShiftLabelForDate } from "./dates";
import { getFortnoxArticleNumber } from "./fortnoxArticles";
import type { FortnoxArticleMap } from "./fortnoxArticles";
import { roundMoney } from "./money";
import type { LocationCard, PricingBreakdown, ShiftBucket, ShiftLabel, ShiftRate, TimeWindowShiftLabel } from "./types";

type WorkInterval = { start: Date; end: Date };
type ShiftHours = { bh: number; night: number; weekend: number };

function isLineItem<T>(value: T | null): value is T {
  return value != null;
}

function calculateShiftRowAmount(rateRow: ShiftRate, hours: number, includeCallOut: boolean) {
  const roundedHours = Math.round(Math.max(0, hours) * 100) / 100;
  const additionalHours = includeCallOut ? Math.max(0, roundedHours - rateRow.includedHours) : roundedHours;
  const callOutFee = includeCallOut ? rateRow.callOutFee : 0;
  return {
    amount: roundMoney(callOutFee + additionalHours * rateRow.additionalHours),
    additionalHourRate: rateRow.additionalHours,
    additionalHours,
    callOutFee,
  };
}

function getShiftMap(card: LocationCard) {
  return {
    bh: card.shifts.find((row) => row.shift === "08:00-18:00"),
    night: card.shifts.find((row) => row.shift === "18:00-08:00"),
    weekend: card.shifts.find((row) => row.shift === "Weekend / Holiday"),
  };
}

function addHours(target: ShiftHours, shift: ShiftLabel, hours: number) {
  if (shift === "08:00-18:00") target.bh += hours;
  else if (shift === "18:00-08:00") target.night += hours;
  else target.weekend += hours;
}

function toHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function billedAmounts(hours: ShiftHours, rows: ReturnType<typeof getShiftMap>) {
  if (hours.bh > 0 && !rows.bh) return null;
  if (hours.night > 0 && !rows.night) return null;
  if (hours.weekend > 0 && !rows.weekend) return null;
  return {
    bh: rows.bh ? calculateShiftRowAmount(rows.bh, hours.bh, false) : null,
    night: rows.night ? calculateShiftRowAmount(rows.night, hours.night, false) : null,
    weekend: rows.weekend ? calculateShiftRowAmount(rows.weekend, hours.weekend, false) : null,
  };
}

function buildLineItems(card: LocationCard, hours: ShiftHours, rows: ReturnType<typeof getShiftMap>, fortnoxArticles?: FortnoxArticleMap) {
  return [
    hours.bh > 0 && rows.bh
      ? {
          articleNumber: getFortnoxArticleNumber(card.id, "08:00-18:00", "additionalHour", fortnoxArticles),
          description: "BH Additional Hours",
          quantity: hours.bh,
          unitPrice: rows.bh.additionalHours,
          total: roundMoney(hours.bh * rows.bh.additionalHours),
          currency: card.currency,
        }
      : null,
    hours.night > 0 && rows.night
      ? {
          articleNumber: getFortnoxArticleNumber(card.id, "18:00-08:00", "additionalHour", fortnoxArticles),
          description: "OBH Additional Hours",
          quantity: hours.night,
          unitPrice: rows.night.additionalHours,
          total: roundMoney(hours.night * rows.night.additionalHours),
          currency: card.currency,
        }
      : null,
    hours.weekend > 0 && rows.weekend
      ? {
          articleNumber: getFortnoxArticleNumber(card.id, "Weekend / Holiday", "additionalHour", fortnoxArticles),
          description: "Weekend / Holiday Additional Hours",
          quantity: hours.weekend,
          unitPrice: rows.weekend.additionalHours,
          total: roundMoney(hours.weekend * rows.weekend.additionalHours),
          currency: card.currency,
        }
      : null,
  ].filter(isLineItem);
}

function splitShiftPricing(card: LocationCard, buckets: ShiftBucket, startShift: TimeWindowShiftLabel, endShift: TimeWindowShiftLabel, fortnoxArticles?: FortnoxArticleMap): PricingBreakdown | null {
  const rows = getShiftMap(card);
  const billed = { bh: buckets.bh, night: buckets.night, weekend: buckets.weekend };
  addHours(billed, startShift, 0.5);
  addHours(billed, endShift, 0.5);
  const amounts = billedAmounts(billed, rows);
  if (!amounts) return null;
  return {
    currency: card.currency,
    crossedShift: true,
    method: "split-shift",
    callOutFee: 0,
    hours: { bh: billed.bh, obh: billed.night, wh: billed.weekend },
    splitHours: billed,
    bhAmount: amounts.bh?.amount || 0,
    obhAmount: amounts.night?.amount || 0,
    whAmount: amounts.weekend?.amount || 0,
    totalAmount: roundMoney((amounts.bh?.amount || 0) + (amounts.night?.amount || 0) + (amounts.weekend?.amount || 0)),
    lineItems: buildLineItems(card, billed, rows, fortnoxArticles),
  };
}

function startShiftCallOutPricing(card: LocationCard, interval: WorkInterval, startShift: TimeWindowShiftLabel, fortnoxArticles?: FortnoxArticleMap): PricingBreakdown | null {
  const rows = getShiftMap(card);
  const startRow = card.shifts.find((row) => row.shift === startShift);
  if (!startRow) return null;
  const billed = { bh: 0, night: 0, weekend: 0 };
  let includedMinutes = startRow.includedHours * 60;
  let current = new Date(interval.start.getTime());

  while (current < interval.end) {
    const next = new Date(Math.min(current.getTime() + 15 * 60 * 1000, interval.end.getTime()));
    const minutes = (next.getTime() - current.getTime()) / 60000;
    const billableMinutes = Math.max(0, minutes - Math.min(minutes, includedMinutes));
    if (billableMinutes > 0) addHours(billed, getShiftLabelForDate(current), toHours(billableMinutes));
    includedMinutes = Math.max(0, includedMinutes - minutes);
    current = next;
  }

  const amounts = billedAmounts(billed, rows);
  if (!amounts) return null;
  const lineItems = [
    {
      articleNumber: getFortnoxArticleNumber(card.id, startShift, "callOut", fortnoxArticles),
      description: "Call-Out Fee",
      quantity: 1,
      unitPrice: startRow.callOutFee,
      total: startRow.callOutFee,
      currency: card.currency,
    },
    ...buildLineItems(card, billed, rows, fortnoxArticles),
  ];
  return {
    currency: card.currency,
    crossedShift: true,
    method: "start-shift-callout",
    callOutFee: startRow.callOutFee,
    callOutShift: startShift,
    includedHours: startRow.includedHours,
    hours: { bh: billed.bh, obh: billed.night, wh: billed.weekend },
    splitHours: billed,
    bhAmount: amounts.bh?.amount || 0,
    obhAmount: amounts.night?.amount || 0,
    whAmount: amounts.weekend?.amount || 0,
    totalAmount: roundMoney(startRow.callOutFee + (amounts.bh?.amount || 0) + (amounts.night?.amount || 0) + (amounts.weekend?.amount || 0)),
    lineItems,
  };
}

export function getCrossedShiftPricing(
  card: LocationCard,
  interval: WorkInterval,
  buckets: ShiftBucket,
  startShift: TimeWindowShiftLabel,
  endShift: TimeWindowShiftLabel,
  fortnoxArticles?: FortnoxArticleMap,
): PricingBreakdown | null {
  const split = splitShiftPricing(card, buckets, startShift, endShift, fortnoxArticles);
  const startCallOut = startShiftCallOutPricing(card, interval, startShift, fortnoxArticles);
  if (!split || !startCallOut) return startCallOut || split;
  const comparison = { splitShift: split.totalAmount, startShiftCallOut: startCallOut.totalAmount };
  return startCallOut.totalAmount > split.totalAmount
    ? { ...startCallOut, comparison }
    : { ...split, comparison };
}
