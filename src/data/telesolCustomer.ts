import type { Customer, LocationCard, ShiftLabel, ShiftRate } from "../domain/types";

function rate(
  shift: ShiftLabel,
  includedHours: number,
  callOutFee: number,
  additionalHours: number,
  fullShiftRate: number,
): ShiftRate {
  return { shift, includedHours, callOutFee, additionalHours, fullShiftRate };
}

function card(
  city: string,
  cityCode: string,
  country: string,
  rates: [number, number, number, number][],
  slaAmount = 0,
  slaNote = "",
): LocationCard {
  return {
    id: `telesol-${cityCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    city,
    cityCode,
    country,
    currency: "EUR",
    invoiceMode: "monthly",
    slaEnabled: slaAmount > 0,
    slaAmount,
    slaAttributedTo: slaAmount > 0 ? "Telesol IT B.V." : undefined,
    slaNote,
    shifts: [
      rate("08:00-18:00", ...rates[0]),
      rate("18:00-08:00", ...rates[1]),
      rate("Weekend / Holiday", ...rates[2]),
    ],
  };
}

const splitLocations: Record<string, Array<{ city: string; cityCode: string; country: string }>> = {
  "telesol-vna-brs": [
    { city: "Vienna", cityCode: "VNA", country: "Austria" },
    { city: "Bratislava", cityCode: "BRS", country: "Slovakia" },
  ],
  "telesol-zur-gen": [
    { city: "Zurich", cityCode: "ZUR", country: "Switzerland" },
    { city: "Geneva", cityCode: "GEN", country: "Switzerland" },
  ],
  "telesol-mlm-hbg": [
    { city: "Malmö", cityCode: "MLM", country: "Sweden" },
    { city: "Helsingborg", cityCode: "HBG", country: "Sweden" },
  ],
  "telesol-prg-brn": [
    { city: "Prague", cityCode: "PRG", country: "Czech Republic" },
    { city: "Brno", cityCode: "BRN", country: "Czech Republic" },
  ],
};

function locationId(prefix: string, cityCode: string) {
  return `${prefix}-${cityCode.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function splitLocationCard(location: LocationCard): LocationCard[] {
  const normalizedId = location.id.replace(/^telesol-us-/, "telesol-");
  const prefix = location.id.startsWith("telesol-us-") ? "telesol-us" : "telesol";
  const split = splitLocations[normalizedId];
  if (!split) return [location];
  return split.map((item) => ({
    ...location,
    ...item,
    id: locationId(prefix, item.cityCode),
    shifts: location.shifts.map((shift) => ({ ...shift })),
  }));
}

export function splitSharedTelesolLocationCards(locationCards: LocationCard[]): LocationCard[] {
  const seen = new Set<string>();
  return locationCards.flatMap(splitLocationCard).filter((location) => {
    if (seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}

export const telesolCustomer: Customer = {
  name: "Telesol IT B.V.",
  customerKey: "TELE",
  defaultInvoiceMode: "monthly",
  customerLegalName: "TELESOL IT B.V.",
  customerAddress: "Science Park 400, 1098XH, Amsterdam, Netherlands",
  billingAddress: "Science Park 400, 1098XH, Amsterdam, Netherlands",
  financeEmail: "AccountsPayable@telesolgroup.com",
  customerLegalId: "82568774",
  locationCards: [
    card("Stockholm", "STO", "Sweden", [[2, 250, 75, 500], [2, 375, 112.5, 750], [3, 500, 150, 750]], 1000, "Billed under same PO as HEL"),
    card("Oslo", "OSL", "Norway", [[2, 275, 100, 720], [2, 412.5, 150, 1200], [3, 550, 200, 1200]]),
    card("Helsinki", "HEL", "Finland", [[2, 215, 75, 560], [2, 322.5, 112.5, 850], [3, 420, 140, 850]], 500, "Billed under same PO as STO"),
    card("Vienna", "VNA", "Austria", [[2, 210, 70, 560], [2, 315, 105, 850], [3, 420, 140, 850]]),
    card("Bratislava", "BRS", "Slovakia", [[2, 210, 70, 560], [2, 315, 105, 850], [3, 420, 140, 850]]),
    card("Zurich", "ZUR", "Switzerland", [[2, 378, 126, 1000], [2, 567, 189, 1500], [3, 756, 252, 1500]]),
    card("Geneva", "GEN", "Switzerland", [[2, 378, 126, 1000], [2, 567, 189, 1500], [3, 756, 252, 1500]]),
    card("Copenhagen", "CPH", "Denmark", [[2, 250, 85, 600], [2, 375, 127.5, 900], [3, 500, 170, 900]]),
    card("Malmö", "MLM", "Sweden", [[2, 250, 80, 500], [2, 375, 120, 750], [3, 500, 160, 750]]),
    card("Helsingborg", "HBG", "Sweden", [[2, 250, 80, 500], [2, 375, 120, 750], [3, 500, 160, 750]]),
    card("Marseille", "MAR", "France", [[2, 180, 60, 480], [2, 270, 90, 720], [3, 360, 120, 720]]),
    card("Bergamo", "BRG", "Italy", [[2, 225, 75, 600], [2, 337.5, 112.5, 900], [3, 450, 150, 900]]),
    card("Prague", "PRG", "Czech Republic", [[2, 225, 75, 600], [2, 337.5, 112.5, 900], [3, 450, 150, 900.01]]),
    card("Brno", "BRN", "Czech Republic", [[2, 225, 75, 600], [2, 337.5, 112.5, 900], [3, 450, 150, 900.01]]),
    card("Milan", "MIL", "Italy", [[2, 210, 70, 560], [2, 315, 105, 850], [3, 420, 140, 850]]),
    card("Paris", "PAR", "France", [[2, 210, 70, 560], [2, 315, 105, 850], [3, 420, 140, 850]]),
    card("Lisbon", "LIS", "Portugal", [[2, 180, 60, 480], [2, 270, 90, 720], [3, 360, 120, 720]]),
  ],
};

export const telesolUsCustomer: Customer = {
  ...telesolCustomer,
  name: "Telesol US LLC",
  customerKey: "TELE-US",
  customerLegalName: "TELESOL US LLC",
  customerAddress: telesolCustomer.customerAddress,
  billingAddress: telesolCustomer.billingAddress,
  financeEmail: telesolCustomer.financeEmail,
  customerLegalId: "",
  locationCards: telesolCustomer.locationCards.map((location) => ({
    ...location,
    id: location.id.replace("telesol-", "telesol-us-"),
    slaEnabled: false,
    slaAmount: 0,
    slaAttributedTo: undefined,
    slaNote: undefined,
  })),
};

export const defaultTelesolCustomers: Customer[] = [telesolCustomer, telesolUsCustomer];
