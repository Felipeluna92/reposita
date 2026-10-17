export type DemandReason =
  | "missing"
  | "out_of_stock"
  | "variant"
  | "price"
  | "delivery";
export type DemandStatus =
  | "new"
  | "reviewing"
  | "contacted"
  | "closed"
  | "ignored";
export type DemandInput = {
  label: string;
  variant: string;
  product_id: string | null;
  reason: DemandReason;
  quantity: number;
  budget: number | null;
  note: string;
  contact: string;
  contact_consent: boolean;
};
export type Demand = DemandInput & {
  id: string;
  source: "manual" | "public";
  status: DemandStatus;
  created_at: string;
  consent_at?: string | null;
};
export type PurchaseInput = {
  product_id: string;
  demand_key: string;
  title: string;
  quantity: number;
  unit_cost: number;
  freight: number;
  packaging: number;
  sale_price: number;
  fee: number;
  tax: number;
  expected_units: number;
  days: number;
  note: string;
};
export type PurchaseTest = PurchaseInput & {
  id: string;
  status: "planned" | "purchased" | "completed" | "canceled";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  outcome_note: string;
};
export type PublicStore = {
  name: string;
  public_token: string;
  enabled: boolean;
};
export type DemandData = {
  demands: Demand[];
  tests: PurchaseTest[];
  store: PublicStore | null;
};
export type Opportunity = {
  key: string;
  label: string;
  variant: string;
  product_id: string | null;
  records: Demand[];
  units: number;
  contacts: number;
  budget: number | null;
  last_at: string;
};
