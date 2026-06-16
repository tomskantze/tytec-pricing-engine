export type InvoiceMode = "monthly" | "task";
export type QueueState = "Ready" | "Blocked" | "Invoiced";
export type RateCardMode = "time-window" | "category";
export type TimeWindowShiftLabel = "08:00-18:00" | "18:00-08:00" | "Weekend / Holiday";
export type CategoryRateLabel = "REG" | "OBH1";
export type CategoryRateType = "Day" | "Night";
export type TierLevel = "Tier 1" | "Tier 2" | "Tier 3";
export type ShiftLabel = TimeWindowShiftLabel | CategoryRateLabel;

export type ShiftBucket = {
  bh: number;
  night: number;
  weekend: number;
};

export type ShiftRate = {
  shift: ShiftLabel;
  includedHours: number;
  callOutFee: number;
  additionalHours: number;
  fullShiftRate: number;
};

export type LocationTierRate = {
  tier: TierLevel;
  shift: CategoryRateLabel;
  rateType: CategoryRateType;
  rate: number;
};

export type LocationCard = {
  id: string;
  city: string;
  cityCode: string;
  siteAliases?: string[];
  country: string;
  currency: string;
  invoiceMode: InvoiceMode;
  rateCardMode?: RateCardMode;
  slaEnabled: boolean;
  slaAmount: number;
  slaAttributedTo?: string;
  slaNote?: string;
  shifts: ShiftRate[];
  tierRates?: LocationTierRate[];
  endCustomerOverrides?: { endCustomer: string; invoiceMode: InvoiceMode }[];
};

export type TechnicianProfile = {
  id: string;
  name: string;
  aliases?: string[];
  active: boolean;
};

export type TechnicianRate = {
  id: string;
  technicianId: string;
  locationId: string;
  shift: CategoryRateLabel;
  rateType: CategoryRateType;
  rate: number;
};

export type TechnicianTierAssignment = {
  id: string;
  technicianId: string;
  locationId: string;
  tier: TierLevel;
  obh1Enabled?: boolean;
  dayRate?: number;
  nightRate?: number;
};

export type Customer = {
  name: string;
  customerKey: string;
  defaultInvoiceMode: InvoiceMode;
  customerLegalName: string;
  customerAddress: string;
  billingAddress: string;
  financeEmail: string;
  customerLegalId: string;
  locationCards: LocationCard[];
  technicians?: TechnicianProfile[];
  technicianRates?: TechnicianRate[];
  technicianTierAssignments?: TechnicianTierAssignment[];
};

export type ReportedHours = {
  bh: number;
  obh: number;
  wh: number;
};

export type ReportedHoursByLabel = Partial<Record<ShiftLabel, number>>;

export type JobInput = {
  id: string;
  sourceRow: number;
  customerKey?: string;
  date: string;
  businessEntity?: string;
  serviceAppointment?: string;
  serviceDate?: string;
  ticket: string;
  jiraIssueKey?: string;
  jiraIssueId?: string;
  jiraSummary?: string;
  jiraStatus?: string;
  jiraLocation?: string;
  jiraDueDate?: string;
  customerRef: string;
  city: string;
  country: string;
  endCustomer: string;
  technician: string;
  summary: string;
  sow?: string;
  reportStatus: string;
  completionNotes: string;
  travelStart: string;
  onSite: string;
  offSite: string;
  travelFinish: string;
  publicHoliday?: boolean;
  reportedHours?: ReportedHours;
  reportedHoursByLabel?: ReportedHoursByLabel;
  consumablesAmount: number;
  consumablesDescription: string;
  raw: Record<string, string>;
};

export type JiraIssue = {
  issueKey: string;
  issueId: string;
  summary: string;
  dueDate: string;
  status: string;
  taskFailure: string;
  location: string;
  ttrComment: string;
  customerTicket: string;
  summaryReferences?: string[];
};

export type JobReviewOverride = {
  approved?: boolean;
  forceReview?: boolean;
  treatAsLocationId?: string;
  manualRateLabel?: CategoryRateLabel;
  manualRateType?: CategoryRateType;
  manualLaborAmount?: number;
  manualTravelAmount?: number;
  manualConsumablesAmount?: number;
  manualFinalAmount?: number;
  note?: string;
};

export type LineItem = {
  articleNumber?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
};

export type PricingBreakdown = {
  currency: string;
  crossedShift: boolean;
  method: "single-shift-callout" | "split-shift" | "start-shift-callout";
  callOutFee: number;
  callOutShift?: TimeWindowShiftLabel;
  includedHours?: number;
  hours: { bh: number; obh: number; wh: number };
  splitHours: ShiftBucket;
  bhAmount: number;
  obhAmount: number;
  whAmount: number;
  totalAmount: number;
  comparison?: {
    splitShift: number;
    startShiftCallOut: number;
  };
  lineItems: LineItem[];
};

export type PricedJob = JobInput & {
  reviewOverride?: JobReviewOverride;
  queueState: QueueState;
  manualReasons: string[];
  currency: string;
  laborAmount: number | null;
  travelAmount: number;
  totalAmount: number | null;
  invoiceMode: InvoiceMode;
  matchedLocation?: LocationCard;
  pricing?: PricingBreakdown;
};

export type SlaLine = {
  articleNumber?: string;
  label: string;
  amount: number;
  currency: string;
};

export type InvoiceBatch = {
  batchKind: "jobs" | "sla";
  batch: string;
  customer: string;
  businessEntity: string;
  invoiceMode: "Monthly" | "Per Task" | "Retainer";
  period: string;
  jobs: number;
  total: number | null;
  combinedTotal: number | null;
  currency: string;
  status: QueueState | "Sent";
  slaLines: SlaLine[];
  slaTotal: number;
  items: PricedJob[];
};

export type InvoiceSummary = {
  invoiceId: string;
  label: string;
  sourceKind: "import" | "generated";
  jobs: number;
  reviewCount: number;
  laborTotal: number;
  slaTotal: number;
  total: number;
  currency: string;
  status: QueueState | "Draft";
  updatedAt: string;
};

export type ImportResult = {
  jobs: JobInput[];
  headers?: string[];
  sheetName?: string;
  warnings: string[];
};
