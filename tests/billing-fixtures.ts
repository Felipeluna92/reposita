import type { BillingAccess, BillingState } from "../src/billing/types";

export const userId = "a1234567-1234-4234-8234-123456789abc";
export function billingFixture(
  input: Partial<Omit<BillingState, "settings" | "access">> & {
    settings?: Partial<BillingState["settings"]>;
    access?: Partial<BillingAccess>;
  } = {},
): BillingState {
  return {
    configured: true,
    setup_required: false,
    owner_setup_needed: false,
    stripe_ready: true,
    plans: [
      {
        code: "small",
        name: "Pequeno",
        amount_cents: 1990,
        currency: "brl",
        product_limit: 2,
        sort_order: 1,
      },
      {
        code: "large",
        name: "Maior",
        amount_cents: 5990,
        currency: "brl",
        product_limit: 100,
        sort_order: 2,
      },
    ],
    ...input,
    settings: {
      enabled: true,
      mode: "test",
      trial_days: 7,
      trial_products: 50,
      support_email: "ajuda@example.com",
      ...input.settings,
    },
    access: {
      is_owner: false,
      allowed: true,
      status: "trial",
      plan_code: null,
      product_limit: 50,
      used: 1,
      trial_ends_at: "2099-01-01T00:00:00Z",
      period_end: null,
      cancel_at_period_end: false,
      ...input.access,
    },
  };
}
export const readyAdmin: NonNullable<BillingState["admin"]> = {
  ready: true,
  charges_enabled: false,
  has_webhook: true,
  prices_ready: true,
  last_webhook_at: null,
  test_verified: false,
  gateway_mode: "test",
};
export function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
