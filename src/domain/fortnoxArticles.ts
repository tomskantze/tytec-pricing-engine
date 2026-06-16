import type { LineItem, ShiftLabel } from "./types";

export type FortnoxLineKind = "callOut" | "additionalHour" | "fullShift";
export type FortnoxArticleMap = Record<string, LocationArticles>;
export const RETAINER_ARTICLE_NUMBER = "388";

type ArticleMatch = Partial<Record<FortnoxLineKind, string>>;
type LocationArticles = Partial<Record<ShiftLabel, ArticleMatch>>;

export const defaultFortnoxArticles: FortnoxArticleMap = {
  "telesol-sto": {
    "08:00-18:00": { callOut: "241", additionalHour: "150", fullShift: "154" },
    "18:00-08:00": { callOut: "307", additionalHour: "151", fullShift: "155" },
    "Weekend / Holiday": { callOut: "236", additionalHour: "387" },
  },
  "telesol-osl": {
    "08:00-18:00": { callOut: "332", additionalHour: "176", fullShift: "196" },
    "18:00-08:00": { callOut: "389", additionalHour: "315" },
  },
  "telesol-hel": {
    "08:00-18:00": { callOut: "378", additionalHour: "331", fullShift: "330" },
    "18:00-08:00": { additionalHour: "306" },
  },
  "telesol-vna": {
    "08:00-18:00": { additionalHour: "178", fullShift: "198" },
    "18:00-08:00": { additionalHour: "308" },
  },
  "telesol-brs": {
    "08:00-18:00": { additionalHour: "178" },
    "18:00-08:00": { additionalHour: "308" },
  },
  "telesol-cph": {
    "08:00-18:00": { callOut: "333", additionalHour: "180", fullShift: "200" },
    "18:00-08:00": { additionalHour: "305", fullShift: "210" },
    "Weekend / Holiday": { callOut: "390", additionalHour: "377" },
  },
  "telesol-mlm": {
    "08:00-18:00": { callOut: "383" },
  },
  "telesol-hbg": {
    "08:00-18:00": { callOut: "383" },
  },
  "telesol-mar": {
    "08:00-18:00": { additionalHour: "181", fullShift: "201" },
    "18:00-08:00": { additionalHour: "191", fullShift: "211" },
  },
  "telesol-brg": {
    "08:00-18:00": { additionalHour: "263" },
    "18:00-08:00": { additionalHour: "264" },
    "Weekend / Holiday": { additionalHour: "309" },
  },
  "telesol-mil": {
    "08:00-18:00": { callOut: "328", additionalHour: "329", fullShift: "202" },
    "18:00-08:00": { additionalHour: "192" },
  },
  "telesol-lis": {
    "08:00-18:00": { additionalHour: "184", fullShift: "204" },
    "18:00-08:00": { additionalHour: "194", fullShift: "214" },
  },
};

const legacyLocationKeys: Record<string, string[]> = {
  "telesol-vna-brs": ["telesol-vna", "telesol-brs"],
  "telesol-zur-gen": ["telesol-zur", "telesol-gen"],
  "telesol-mlm-hbg": ["telesol-mlm", "telesol-hbg"],
  "telesol-prg-brn": ["telesol-prg", "telesol-brn"],
};

export function getFortnoxLocationKey(locationId: string) {
  return locationId.replace(/^telesol-us-/, "telesol-");
}

function cloneMap(source: FortnoxArticleMap) {
  return Object.fromEntries(
    Object.entries(source).map(([locationId, shifts]) => [
      locationId,
      Object.fromEntries(Object.entries(shifts).map(([shift, match]) => [shift, { ...match }])),
    ]),
  ) as FortnoxArticleMap;
}

export function withFortnoxArticleDefaults(source?: Partial<FortnoxArticleMap>): FortnoxArticleMap {
  const merged = cloneMap(defaultFortnoxArticles);
  const entries = Object.entries(source ?? {});
  entries.filter(([locationId]) => legacyLocationKeys[getFortnoxLocationKey(locationId)]).forEach(([locationId, shifts]) => {
    const key = getFortnoxLocationKey(locationId);
    legacyLocationKeys[key].forEach((targetKey) => mergeArticleShifts(merged, targetKey, shifts));
  });
  entries.filter(([locationId]) => !legacyLocationKeys[getFortnoxLocationKey(locationId)]).forEach(([locationId, shifts]) => {
    mergeArticleShifts(merged, getFortnoxLocationKey(locationId), shifts);
  });
  return merged;
}

function mergeArticleShifts(target: FortnoxArticleMap, key: string, shifts?: LocationArticles) {
  target[key] ||= {};
  Object.entries(shifts ?? {}).forEach(([shift, match]) => {
    const shiftKey = shift as ShiftLabel;
    target[key][shiftKey] = { ...(target[key][shiftKey] ?? {}), ...match };
  });
}

export function setFortnoxArticleNumber(
  source: FortnoxArticleMap,
  locationId: string,
  shift: ShiftLabel,
  kind: FortnoxLineKind,
  articleNumber: string,
): FortnoxArticleMap {
  const key = getFortnoxLocationKey(locationId);
  const next = cloneMap(source);
  next[key] ||= {};
  next[key][shift] = { ...(next[key][shift] ?? {}), [kind]: articleNumber.trim() };
  return next;
}

export function getFortnoxArticleNumber(
  locationId: string,
  shift: ShiftLabel,
  kind: FortnoxLineKind,
  source: FortnoxArticleMap = defaultFortnoxArticles,
): string | undefined {
  const value = source[getFortnoxLocationKey(locationId)]?.[shift]?.[kind]?.trim();
  return value || undefined;
}

export function formatFortnoxArticleNumbers(lineItems: LineItem[] | undefined, emptyValue = "-") {
  const articleNumbers = Array.from(new Set((lineItems ?? []).map((item) => item.articleNumber).filter(Boolean)));
  return articleNumbers.length ? articleNumbers.join(", ") : emptyValue;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatFortnoxArticleUsage(lineItems: LineItem[] | undefined, emptyValue = "-") {
  const usage = new Map<string, number>();
  (lineItems ?? []).forEach((item) => {
    if (!item.articleNumber) return;
    usage.set(item.articleNumber, (usage.get(item.articleNumber) || 0) + item.quantity);
  });
  const values = Array.from(usage.entries()).map(([articleNumber, quantity]) => `${articleNumber} x ${formatQuantity(quantity)}`);
  return values.length ? values.join(", ") : emptyValue;
}
