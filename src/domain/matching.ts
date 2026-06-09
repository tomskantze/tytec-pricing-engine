import type { Customer, JobInput, LocationCard } from "./types";

export function normalizeLocationText(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeCountry(value: string): string {
  const normalized = normalizeLocationText(value);
  const aliases: Record<string, string> = {
    se: "sweden",
    sverige: "sweden",
    sweden: "sweden",
    no: "norway",
    norge: "norway",
    norway: "norway",
    dk: "denmark",
    danmark: "denmark",
    denmark: "denmark",
    fi: "finland",
    suomi: "finland",
    finland: "finland",
    nl: "netherlands",
    nederland: "netherlands",
    netherlands: "netherlands",
    at: "austria",
    austria: "austria",
    ch: "switzerland",
    swiss: "switzerland",
    switzerland: "switzerland",
    fr: "france",
    france: "france",
    it: "italy",
    italy: "italy",
    cz: "czechrepublic",
    czechia: "czechrepublic",
    czechrepublic: "czechrepublic",
    pt: "portugal",
    portugal: "portugal",
    sk: "slovakia",
    slovakia: "slovakia",
    slovensko: "slovakia",
  };
  return aliases[normalized] || normalized;
}

function cityTokens(card: LocationCard): string[] {
  const names = card.city
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const codes = card.cityCode.split(/[\/,]/).map((item) => item.trim());
  return [card.city, card.cityCode, ...codes, ...names].map(normalizeLocationText).filter(Boolean);
}

export function getMatchedLocationCard(customer: Customer, job: JobInput): LocationCard | undefined {
  const city = normalizeLocationText(job.city);
  const country = normalizeCountry(job.country);
  return customer.locationCards.find((card) => {
    const sameCity = cityTokens(card).includes(city);
    const sameCountry = normalizeCountry(card.country) === country;
    return sameCity && sameCountry;
  });
}

export function getLocationLabel(card: LocationCard): string {
  return `${card.city}, ${card.country}`;
}
