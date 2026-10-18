export type BillingPlan = {
  code: string;
  name: string;
  amount_cents: number;
  currency: string;
  product_limit: number;
  sort_order: number;
};
export type BillingAccess = {
  is_owner: boolean;
  allowed: boolean;
  status: string;
  plan_code: string | null;
  product_limit: number | null;
  used: number;
  trial_ends_at: string | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer?: boolean;
};
export type BillingState = {
  configured: boolean;
  setup_required: boolean;
  stripe_ready: boolean;
  owner_setup_needed: boolean;
  plans: BillingPlan[];
  settings: {
    enabled: boolean;
    mode: "test" | "live";
    trial_days: number;
    trial_products: number;
    support_email: string;
  };
  access?: BillingAccess;
  admin?: {
    ready: boolean;
    charges_enabled: boolean;
    has_webhook: boolean;
    prices_ready: boolean;
    last_webhook_at: string | null;
    test_verified: boolean;
    gateway_mode: "test" | "live" | null;
  };
};
export type BillingAction =
  | "setup"
  | "enable"
  | "disable"
  | "checkout"
  | "portal"
  | "change"
  | "sync";
export type BillingActionInput = {
  plan?: string;
  support_email?: string;
  confirm?: boolean;
};
export type BillingActionResult = {
  url?: string;
  notice?: string;
  pending?: boolean;
};
