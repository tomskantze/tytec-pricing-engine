export type InvoiceMode = "monthly" | "task";
export type QueueState = "Ready" | "Blocked" | "Invoiced";
export type ShiftLabel = "08:00-18:00" | "18:00-08:00" | "Weekend / Holiday";

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

export type LocationCard = {
  id: string;
  city: string;
  cityCode: string;
  country: string;
  currency: string;
  invoiceMode: InvoiceMode;
  slaEnabled: boolean;
  slaAmount: number;
  slaAttributedTo?: string;
  slaNote?: string;
  shifts: ShiftRate[];
  endCustomerOverrides?: { endCustomer: string; invoiceMode: InvoiceMode }[];
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
};

export type JobInput = {
  id: string;
  sourceRow: number;
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
  reportStatus: string;
  travelStart: string;
  onSite: string;
  offSite: string;
  travelFinish: string;
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
};

export type JobReviewOverride = {
  approved?: boolean;
  forceReview?: boolean;
  treatAsLocationId?: string;
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
  callOutFee: number;
  hours: { bh: number; obh: number; wh: number };
  splitHours: ShiftBucket;
  bhAmount: number;
  obhAmount: number;
  whAmount: number;
  totalAmount: number;
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
  batch: string;
  customer: string;
  businessEntity: string;
  invoiceMode: "Monthly" | "Per Task";
  period: string;
  jobs: number;
  total: number | null;
  currency: string;
  status: QueueState | "Sent";
  slaLines: SlaLine[];
  slaTotal: number;
  items: PricedJob[];
};

export type ImportResult = {
  jobs: JobInput[];
  headers?: string[];
  sheetName?: string;
  warnings: string[];
};
