import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
const f = vi.hoisted(() => ({
  owner: false,
  proof: false,
  mode: "test",
  enabled: true,
  customer: "cus_account" as string | null,
  last: null as string | null,
  previous: null as string | null,
  rpc: vi.fn(),
  getUser: vi.fn(),
  mutations: [] as unknown[],
  stripe: {
    prices: { list: vi.fn(), retrieve: vi.fn(), create: vi.fn() },
    subscriptions: { list: vi.fn(), update: vi.fn() },
    customers: { create: vi.fn(), update: vi.fn() },
    checkout: {
      sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() },
    },
    billingPortal: {
      sessions: { create: vi.fn() },
      configurations: { update: vi.fn(), create: vi.fn() },
    },
    accounts: { retrieveCurrent: vi.fn() },
    webhookEndpoints: { create: vi.fn(), update: vi.fn() },
  },
}));
const id = "11111111-1111-4111-8111-111111111111",
  requestId = "22222222-2222-4222-8222-222222222222";
const catalog = [
  {
    code: "essential",
    name: "Essencial",
    amount_cents: 2990,
    currency: "brl",
    product_limit: 100,
    sort_order: 1,
  },
  {
    code: "professional",
    name: "Profissional",
    amount_cents: 5990,
    currency: "brl",
    product_limit: 1000,
    sort_order: 2,
  },
  {
    code: "business",
    name: "Negócios",
    amount_cents: 11990,
    currency: "brl",
    product_limit: 5000,
    sort_order: 3,
  },
];
vi.mock("stripe", async (original) => {
  const { default: RealStripe } = await original<typeof import("stripe")>();
  const real = new RealStripe("sk_test_signature_only");
  return {
    default: class {
      constructor() {
        return { ...f.stripe, webhooks: real.webhooks };
      }
    },
  };
});
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: f.getUser },
    rpc: f.rpc,
    from(table: string) {
      let mutation: unknown;
      const result = () => {
        if (mutation) f.mutations.push({ table, mutation });
        const data: unknown =
          table === "reposita_billing_settings"
            ? {
                enabled: f.enabled,
                mode: f.mode,
                trial_days: 7,
                trial_products: 50,
                support_email: "support@example.org",
              }
            : table === "reposita_billing_plans"
              ? catalog
              : table === "reposita_billing_owners"
                ? f.owner
                  ? { user_id: id }
                  : null
                : table === "reposita_billing_prices"
                  ? catalog.map((p) => ({
                      plan_code: p.code,
                      price_id: "price_" + p.code,
                      product_id: "prod_" + p.code,
                      current: true,
                    }))
                  : table === "reposita_billing_private"
                    ? {
                        endpoint_id: "we_1",
                        webhook_secret: "whsec_test_signature",
                        portal_id: "bpc_1",
                        account_id: "acct_1",
                        charges_enabled: true,
                      }
                    : table === "reposita_billing_events"
                      ? f.proof
                        ? [{ event_id: "evt_proof" }]
                        : []
                      : table === "reposita_billing_customers"
                        ? { user_id: id, customer_id: f.customer }
                        : table === "reposita_billing_subscriptions"
                          ? f.previous
                            ? { subscription_id: f.previous }
                            : null
                          : null;
        return { data, error: null };
      };
      const q: Record<string, unknown> = {};
      for (const key of ["select", "eq", "order", "not", "limit"])
        q[key] = () => q;
      q.update = (value: unknown) => {
        mutation = value;
        return q;
      };
      q.single = q.maybeSingle = async () => result();
      q.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return q;
    },
  })),
}));
import {
  billingGet,
  billingPost,
  billingWebhook,
} from "../server/billing-handler";
function req(
  action: string,
  extra: Record<string, unknown> = {},
  origin = "https://reposita.example",
  auth = true,
) {
  return new Request("https://reposita.example/api/billing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(auth ? { Authorization: "Bearer user-jwt" } : {}),
    },
    body: JSON.stringify({ action, request_id: requestId, ...extra }),
  });
}
const sub = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_1",
  created: 100,
  status: "active",
  collection_method: "charge_automatically",
  pause_collection: null,
  items: {
    data: [
      {
        id: "si_1",
        price: { id: "price_essential" },
        quantity: 1,
        current_period_end: 2000000000,
      },
    ],
  },
  cancel_at_period_end: false,
  latest_invoice: {
    id: "in_paid",
    status: "paid",
    amount_paid: 2990,
    amount_paid_off_stripe: 0,
  },
  ...overrides,
});
beforeEach(() => {
  vi.clearAllMocks();
  f.owner = false;
  f.mode = "test";
  f.enabled = true;
  f.proof = false;
  f.customer = "cus_account";
  f.last = null;
  f.previous = null;
  f.mutations = [];
  for (const [key, value] of Object.entries({
    VITE_SUPABASE_URL: "https://project.supabase.co",
    VITE_SUPABASE_ANON_KEY: "anon_test",
    SUPABASE_SERVICE_ROLE_KEY: "service_test",
    PUBLIC_SITE_URL: "https://reposita.example",
    STRIPE_SECRET_KEY: "sk_test_fake",
  }))
    vi.stubEnv(key, value);
  f.getUser.mockResolvedValue({
    data: { user: { id, email: "user@example.org" } },
    error: null,
  });
  f.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "reposita_billing_lock"
        ? { customer_id: f.customer, last_checkout: f.last }
        : name === "reposita_billing_state"
          ? { access: { is_owner: f.owner } }
          : true,
    error: null,
  }));
  f.stripe.prices.retrieve.mockImplementation(async (price: string) => ({
    id: price,
    active: true,
    unit_amount: price === "price_essential" ? 2990 : 5990,
    currency: "brl",
    recurring: { interval: "month", interval_count: 1 },
  }));
  f.stripe.subscriptions.list.mockResolvedValue({ data: [] });
  f.stripe.checkout.sessions.create.mockResolvedValue({
    id: "cs_1",
    url: "https://checkout.stripe.com/c/pay/test",
  });
  f.stripe.checkout.sessions.expire.mockResolvedValue({});
  f.stripe.customers.create.mockResolvedValue({ id: "cus_created" });
  f.stripe.customers.update.mockResolvedValue({});
  f.stripe.accounts.retrieveCurrent.mockResolvedValue({
    id: "acct_1",
    charges_enabled: true,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("API de assinaturas", () => {
  it("consulta pública só mostra catálogo e configuração sem dados privados", async () => {
    const response = await billingGet(
      new Request("https://reposita.example/api/billing"),
    );
    const data = await response.json();
    expect(data.plans).toEqual(catalog);
    expect(data.access).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/whsec_|cus_account|service_test/);
  });
  it("exige sessão e origem exata antes de qualquer escrita", async () => {
    expect(
      (
        await billingPost(
          req("checkout", { plan: "essential" }, undefined, false),
        )
      ).status,
    ).toBe(401);
    expect(
      (await billingPost(req("checkout", {}, "https://evil.example"))).status,
    ).toBe(403);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.mutations).toHaveLength(0);
  });
  it("não aceita privilégios ou valor vindos do cliente", async () => {
    expect(
      (
        await billingPost(
          req("setup", { owner: true, support_email: "a@b.org" }),
        )
      ).status,
    ).toBe(403);
    const response = await billingPost(
      req("checkout", {
        plan: "essential",
        amount: 1,
        user_id: "attacker",
        customer_id: "cus_attacker",
      }),
    );
    expect(response.status).toBe(200);
    expect(f.stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      customer: "cus_account",
      client_reference_id: id,
      line_items: [{ price: "price_essential", quantity: 1 }],
      allowed_payment_method_types: ["card"],
    });
  });
  it("recusa preço divergente e assinaturas duplicadas", async () => {
    f.stripe.prices.retrieve.mockResolvedValueOnce({
      active: true,
      unit_amount: 1,
      currency: "brl",
      recurring: { interval: "month", interval_count: 1 },
    });
    expect(
      (await billingPost(req("checkout", { plan: "essential" }))).status,
    ).toBe(409);
    f.stripe.subscriptions.list.mockResolvedValue({ data: [sub()] });
    expect(
      (await billingPost(req("checkout", { plan: "essential" }))).status,
    ).toBe(409);
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("reaproveita checkout repetido e permite nova contratação após cancelamento antigo", async () => {
    f.last = "cs_old";
    f.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: "cs_old",
      customer: "cus_account",
      status: "open",
      metadata: { request_id: requestId },
      url: "https://checkout.stripe.com/c/pay/old",
    });
    expect(
      (await billingPost(req("checkout", { plan: "essential" }))).status,
    ).toBe(200);
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
    f.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: "cs_old",
      customer: "cus_account",
      status: "complete",
      metadata: { request_id: "old" },
    });
    f.stripe.subscriptions.list.mockResolvedValue({
      data: [sub({ status: "canceled" })],
    });
    expect(
      (await billingPost(req("checkout", { plan: "essential" }))).status,
    ).toBe(200);
    expect(f.stripe.checkout.sessions.create).toHaveBeenCalledOnce();
  });
  it("troca exige confirmação e preserva o plano anterior enquanto pagamento está pendente", async () => {
    f.stripe.subscriptions.list.mockResolvedValue({ data: [sub()] });
    expect(
      (await billingPost(req("change", { plan: "professional" }))).status,
    ).toBe(400);
    f.stripe.subscriptions.update.mockResolvedValue({
      ...sub(),
      pending_update: {},
      latest_invoice: {
        hosted_invoice_url: "https://invoice.stripe.com/i/pending",
      },
    });
    const result = await billingPost(
      req("change", { plan: "professional", confirm: true }),
    );
    expect(await result.json()).toMatchObject({
      pending: true,
      url: "https://invoice.stripe.com/i/pending",
    });
    expect(f.stripe.subscriptions.update.mock.calls[0][1]).toMatchObject({
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
    });
    const snapshot = f.rpc.mock.calls.find(
      ([name]) => name === "reposita_billing_apply_subscription",
    )?.[1];
    expect(snapshot.p_price).toBe("price_essential");
    expect(snapshot.p_user).toBe(id);
  });
  it("sincronização usa cliente autenticado, nunca session_id ou plano da URL", async () => {
    f.stripe.subscriptions.list.mockResolvedValue({
      data: [sub({ pause_collection: { behavior: "void" } })],
    });
    expect(
      (
        await billingPost(
          req("sync", {
            customer: "cus_attacker",
            session_id: "cs_fake",
            plan: "business",
          }),
        )
      ).status,
    ).toBe(200);
    expect(f.stripe.subscriptions.list.mock.calls[0][0].customer).toBe(
      "cus_account",
    );
    expect(
      f.rpc.mock.calls.find(
        ([name]) => name === "reposita_billing_apply_subscription",
      )?.[1],
    ).toMatchObject({ p_status: "paused", p_payment_verified: false });
  });
  it("ativação real exige pagamento de teste validado e conta habilitada", async () => {
    f.owner = true;
    f.mode = "live";
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    expect((await billingPost(req("enable", { confirm: true }))).status).toBe(
      409,
    );
    f.proof = true;
    expect((await billingPost(req("enable", { confirm: true }))).status).toBe(
      200,
    );
    expect(f.rpc).toHaveBeenCalledWith("reposita_billing_set_enabled", {
      p_enabled: true,
    });
  });
  it("recusa chave pública e checkout real desativado", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "pk_live_public");
    expect(
      (await billingPost(req("checkout", { plan: "essential" }))).status,
    ).toBe(503);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    f.mode = "live";
    f.enabled = false;
    expect(
      (await billingPost(req("checkout", { plan: "essential" }))).status,
    ).toBe(409);
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("prepara preços existentes e webhook sem devolver segredos", async () => {
    f.owner = true;
    f.stripe.prices.list.mockImplementation(
      async ({ lookup_keys }: { lookup_keys: string[] }) => {
        const plan = catalog.find((p) =>
          lookup_keys[0].includes("_" + p.code + "_"),
        )!;
        return {
          data: [
            {
              id: "price_" + plan.code,
              product: "prod_" + plan.code,
              unit_amount: plan.amount_cents,
              currency: "brl",
              recurring: { interval: "month", interval_count: 1 },
            },
          ],
        };
      },
    );
    const result = await billingPost(
      req("setup", { support_email: "support@example.org" }),
    );
    expect(result.status).toBe(200);
    expect(await result.text()).not.toMatch(/whsec_|service_test|sk_test/);
    expect(f.stripe.prices.create).not.toHaveBeenCalled();
    expect(f.stripe.webhookEndpoints.update).toHaveBeenCalledWith(
      "we_1",
      expect.objectContaining({
        url: "https://reposita.example/api/billing-webhook",
      }),
    );
    expect(f.rpc).toHaveBeenCalledWith(
      "reposita_billing_save_setup",
      expect.objectContaining({
        p_mode: "test",
        p_secret: "whsec_test_signature",
        p_prices: expect.arrayContaining([
          expect.objectContaining({
            code: "essential",
            price_id: "price_essential",
          }),
        ]),
      }),
    );
  });
  it("revoga snapshot anterior quando preço ou quantidade deixa de ser suportado", async () => {
    f.previous = "sub_1";
    f.stripe.subscriptions.list.mockResolvedValue({
      data: [
        sub({
          items: {
            data: [
              {
                id: "si_1",
                price: { id: "price_unknown" },
                quantity: 1,
                current_period_end: 2000000000,
              },
            ],
          },
        }),
      ],
    });
    expect((await billingPost(req("sync"))).status).toBe(200);
    expect(
      f.rpc.mock.calls.find(
        ([name]) => name === "reposita_billing_apply_subscription",
      )?.[1],
    ).toMatchObject({ p_subscription: "sub_1", p_price: "price_unknown" });
    f.rpc.mockClear();
    f.stripe.subscriptions.list.mockResolvedValue({ data: [] });
    expect((await billingPost(req("sync"))).status).toBe(200);
    expect(
      f.rpc.mock.calls.find(
        ([name]) => name === "reposita_billing_apply_subscription",
      )?.[1],
    ).toMatchObject({
      p_subscription: "sub_1",
      p_status: "canceled",
      p_price: "unsupported",
    });
  });
  it("libera a trava mesmo quando Stripe falha e não expõe erros internos", async () => {
    f.stripe.prices.retrieve.mockRejectedValueOnce(
      new Error("sk_test_do_not_leak"),
    );
    const result = await billingPost(req("checkout", { plan: "essential" }));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("do_not_leak");
    expect(f.rpc).toHaveBeenCalledWith("reposita_billing_release", {
      p_user: id,
      p_mode: "test",
      p_token: requestId,
    });
  });
});
async function signedEvent(
  type: string,
  overrides: Record<string, unknown> = {},
  signatureValid = true,
) {
  const RealStripe = (await vi.importActual<typeof import("stripe")>("stripe"))
    .default;
  const raw = JSON.stringify({
    id: "evt_signed",
    type,
    livemode: false,
    data: { object: { id: "in_paid", customer: "cus_account" } },
    ...overrides,
  });
  const signature = RealStripe.webhooks.generateTestHeaderString({
    payload: raw,
    secret: signatureValid ? "whsec_test_signature" : "whsec_wrong",
  });
  return new Request("https://reposita.example/api/billing-webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: raw,
  });
}
describe("webhook assinado", () => {
  it("ignora evento de outro ambiente mesmo quando a assinatura é válida", async () => {
    const result = await billingWebhook(
      await signedEvent("invoice.paid", { livemode: true }),
    );
    expect(await result.json()).toEqual({ received: true, ignored: true });
    expect(f.stripe.subscriptions.list).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rejeita assinatura falsa sem alterar assinaturas", async () => {
    expect(
      (await billingWebhook(await signedEvent("invoice.paid", {}, false)))
        .status,
    ).toBe(400);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.mutations).toHaveLength(0);
  });
  it("apenas fatura paga positiva confere a prova de pagamento", async () => {
    f.stripe.subscriptions.list.mockResolvedValue({ data: [sub()] });
    expect(
      (await billingWebhook(await signedEvent("invoice.paid"))).status,
    ).toBe(200);
    expect(
      f.rpc.mock.calls.find(
        ([name]) => name === "reposita_billing_apply_subscription",
      )?.[1],
    ).toMatchObject({
      p_payment_verified: true,
      p_event: "evt_signed",
      p_user: id,
    });
    f.rpc.mockClear();
    expect(
      (await billingWebhook(await signedEvent("customer.subscription.created")))
        .status,
    ).toBe(200);
    expect(
      f.rpc.mock.calls.find(
        ([name]) => name === "reposita_billing_apply_subscription",
      )?.[1].p_payment_verified,
    ).toBe(false);
  });
  it("não confere prova para fatura zero ou paga fora do Stripe", async () => {
    for (const invoice of [
      { id: "in_paid", status: "paid", amount_paid: 0 },
      {
        id: "in_paid",
        status: "paid",
        amount_paid: 2990,
        amount_paid_off_stripe: 2990,
      },
    ]) {
      f.rpc.mockClear();
      f.stripe.subscriptions.list.mockResolvedValue({
        data: [sub({ latest_invoice: invoice })],
      });
      await billingWebhook(await signedEvent("invoice.paid"));
      expect(
        f.rpc.mock.calls.find(
          ([name]) => name === "reposita_billing_apply_subscription",
        )?.[1].p_payment_verified,
      ).toBe(false);
    }
  });
  it("não confirma evento quando sincronização falha, permitindo retry do Stripe", async () => {
    f.stripe.subscriptions.list.mockRejectedValueOnce(new Error("network"));
    expect(
      (await billingWebhook(await signedEvent("invoice.paid"))).status,
    ).toBe(503);
  });
});
