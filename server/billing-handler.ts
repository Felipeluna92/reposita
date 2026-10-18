import { createHash, randomUUID } from "node:crypto";
import Stripe from "stripe";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import {
  BillingError,
  billingEvents,
  chooseSubscription,
  gatewayMode,
  rawBody,
  reference,
  trustedBillingUrl,
  uuid,
} from "./billing-core.js";
import type { BillingPlan, BillingState } from "../src/billing/types";
type Mode = "test" | "live";
type Config = {
  url: string;
  key: string;
  anon: string;
  origin: string;
  stripeKey: string;
};
type Context = {
  db: SupabaseClient;
  config: Config;
  stripe: Stripe;
  mode: Mode;
  user: User;
  owner: boolean;
  settings: BillingState["settings"];
};
function config(): Config | null {
  try {
    const url = process.env.VITE_SUPABASE_URL?.trim(),
      key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      anon = process.env.VITE_SUPABASE_ANON_KEY?.trim(),
      origin = new URL(process.env.PUBLIC_SITE_URL ?? "");
    if (!url || !key || !anon || origin.protocol !== "https:") return null;
    return {
      url,
      key,
      anon,
      origin: origin.origin,
      stripeKey: process.env.STRIPE_SECRET_KEY?.trim() ?? "",
    };
  } catch {
    return null;
  }
}
function client(c: Config) {
  return createClient(c.url, c.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function fail(error: unknown) {
  if (error instanceof BillingError)
    return json({ error: error.message }, error.status);
  return json(
    {
      error:
        "Não foi possível concluir. Confira a configuração do pagamento ou tente novamente.",
    },
    503,
  );
}
async function requiredUser(request: Request, db: SupabaseClient) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new BillingError(401, "Entre na sua conta para continuar.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new BillingError(401, "Sua sessão expirou. Entre novamente.");
  return { user: data.user, token };
}
async function rpc<T = unknown>(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await db.rpc(name, args);
  if (result.error) {
    const msg = result.error.message;
    if (msg.includes("Muitas operações"))
      throw new BillingError(
        429,
        "Muitas operações. Tente novamente em um minuto.",
      );
    if (msg.includes("Aguarde"))
      throw new BillingError(
        409,
        "Aguarde a operação anterior terminar e tente novamente.",
      );
    throw new BillingError(
      503,
      "A configuração de assinaturas no banco está incompleta. Confira a atualização SQL.",
    );
  }
  return result.data as T;
}
async function plans(db: SupabaseClient) {
  const result = await db
    .from("reposita_billing_plans")
    .select("code,name,amount_cents,currency,product_limit,sort_order")
    .eq("active", true)
    .order("sort_order");
  if (result.error)
    throw new BillingError(
      503,
      "Execute a atualização de assinaturas no Supabase.",
    );
  return result.data as BillingPlan[];
}
async function settings(db: SupabaseClient) {
  const result = await db
    .from("reposita_billing_settings")
    .select("enabled,mode,trial_days,trial_products,support_email")
    .eq("id", true)
    .single();
  if (result.error)
    throw new BillingError(
      503,
      "Execute a atualização de assinaturas no Supabase.",
    );
  return result.data as BillingState["settings"];
}
async function owner(db: SupabaseClient, id: string) {
  const result = await db
    .from("reposita_billing_owners")
    .select("user_id")
    .eq("user_id", id)
    .maybeSingle();
  if (result.error)
    throw new BillingError(
      503,
      "Execute a atualização de assinaturas no Supabase.",
    );
  return !!result.data;
}
function readyKey(c: Config) {
  try {
    gatewayMode(c.stripeKey);
    return true;
  } catch {
    return false;
  }
}
export async function billingGet(request: Request) {
  const c = config();
  if (!c)
    return json({
      configured: false,
      setup_required: true,
      stripe_ready: false,
      owner_setup_needed: true,
      plans: [],
      settings: {
        enabled: false,
        mode: "test",
        trial_days: 7,
        trial_products: 50,
        support_email: "",
      },
    });
  try {
    const db = client(c);
    let cfg: BillingState["settings"], catalog: BillingPlan[];
    try {
      [cfg, catalog] = await Promise.all([settings(db), plans(db)]);
    } catch {
      return json({
        configured: false,
        setup_required: true,
        stripe_ready: readyKey(c),
        owner_setup_needed: true,
        plans: [],
        settings: {
          enabled: false,
          mode: "test",
          trial_days: 7,
          trial_products: 50,
          support_email: "",
        },
      });
    }
    const base = {
      configured: true,
      setup_required: false,
      stripe_ready: readyKey(c),
      owner_setup_needed: false,
      plans: catalog,
      settings: cfg,
    };
    if (!request.headers.has("authorization")) return json(base);
    const { user, token } = await requiredUser(request, db);
    const scoped = createClient(c.url, c.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    const data = await rpc<Partial<BillingState>>(
      scoped,
      "reposita_billing_state",
    );
    if (data.admin)
      data.admin.gateway_mode = readyKey(c) ? gatewayMode(c.stripeKey) : null;
    return json({ ...base, ...data });
  } catch (e) {
    return fail(e);
  }
}
async function context(request: Request): Promise<Context> {
  const c = config();
  if (!c)
    throw new BillingError(
      503,
      "Configure o Supabase e PUBLIC_SITE_URL na Vercel.",
    );
  if (request.headers.get("origin") !== c.origin)
    throw new BillingError(403, "Origem não autorizada.");
  const db = client(c),
    { user } = await requiredUser(request, db);
  const [isOwner, cfg] = await Promise.all([owner(db, user.id), settings(db)]);
  const mode = gatewayMode(c.stripeKey);
  return {
    db,
    config: c,
    stripe: new Stripe(c.stripeKey, { maxNetworkRetries: 1, timeout: 12000 }),
    mode,
    user,
    owner: isOwner,
    settings: cfg,
  };
}
type PrivateSetup = {
  endpoint_id: string;
  webhook_secret: string;
  portal_id: string;
  account_id: string;
  charges_enabled: boolean;
};
async function privateSetup(ctx: Pick<Context, "db" | "mode">) {
  const result = await ctx.db
    .from("reposita_billing_private")
    .select("*")
    .eq("mode", ctx.mode)
    .maybeSingle();
  if (result.error)
    throw new BillingError(503, "Configuração de pagamento indisponível.");
  return result.data as PrivateSetup | null;
}
async function setup(ctx: Context, email: unknown) {
  if (!ctx.owner)
    throw new BillingError(
      403,
      "Somente o administrador pode preparar os pagamentos.",
    );
  if (
    typeof email !== "string" ||
    email.length > 160 ||
    !/^\S+@\S+\.\S+$/.test(email)
  )
    throw new BillingError(400, "Informe o e-mail público de suporte.");
  const catalog = await plans(ctx.db);
  if (catalog.length !== 3)
    throw new BillingError(400, "São necessários os três planos configurados.");
  const namespace = createHash("sha256")
    .update(ctx.config.origin)
    .digest("hex")
    .slice(0, 12);
  const existing = await privateSetup(ctx);
  const prices = [];
  for (const plan of catalog) {
    const lookup = `reposita_${namespace}_${plan.code}_${plan.amount_cents}_monthly`;
    const result = await ctx.stripe.prices.list({
      lookup_keys: [lookup],
      active: true,
      limit: 1,
    });
    let price = result.data[0];
    if (!price)
      price = await ctx.stripe.prices.create(
        {
          currency: plan.currency,
          unit_amount: plan.amount_cents,
          recurring: { interval: "month" },
          lookup_key: lookup,
          product_data: {
            name: "Reposita · " + plan.name,
            metadata: {
              app: "reposita",
              plan: plan.code,
              origin: ctx.config.origin,
            },
          },
          metadata: { app: "reposita", plan: plan.code },
          tax_behavior: "inclusive",
        },
        { idempotencyKey: "reposita_price_" + ctx.mode + "_" + lookup },
      );
    if (
      price.unit_amount !== plan.amount_cents ||
      price.currency !== "brl" ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw new BillingError(
        409,
        "O preço do Stripe não corresponde ao plano. Revise o catálogo.",
      );
    prices.push({
      code: plan.code,
      price_id: price.id,
      product_id: reference(price.product)!,
    });
  }
  const features = {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" as const },
  };
  let portalId = existing?.portal_id;
  if (portalId)
    await ctx.stripe.billingPortal.configurations.update(portalId, {
      features,
    });
  else {
    const portal = await ctx.stripe.billingPortal.configurations.create(
      {
        business_profile: { headline: "Gerencie sua assinatura do Reposita" },
        features,
        default_return_url: ctx.config.origin + "/?billing=manage",
        metadata: { app: "reposita", origin: ctx.config.origin },
      },
      { idempotencyKey: `reposita_portal_${ctx.mode}_${namespace}` },
    );
    portalId = portal.id;
  }
  let hookId = existing?.endpoint_id,
    secret = existing?.webhook_secret;
  if (hookId)
    await ctx.stripe.webhookEndpoints.update(hookId, {
      url: ctx.config.origin + "/api/billing-webhook",
      enabled_events: [...billingEvents],
    });
  else {
    const hook = await ctx.stripe.webhookEndpoints.create(
      {
        url: ctx.config.origin + "/api/billing-webhook",
        enabled_events: [...billingEvents],
        metadata: { app: "reposita", origin: ctx.config.origin },
      },
      {
        idempotencyKey: `reposita_hook_${ctx.mode}_${namespace}_${Math.floor(Date.now() / 300000)}`,
      },
    );
    hookId = hook.id;
    secret = hook.secret;
  }
  if (!secret)
    throw new BillingError(
      503,
      "Não foi possível preparar a confirmação de pagamentos.",
    );
  const account = await ctx.stripe.accounts.retrieveCurrent();
  await rpc(ctx.db, "reposita_billing_save_setup", {
    p_mode: ctx.mode,
    p_prices: prices,
    p_hook: hookId,
    p_secret: secret,
    p_portal: portalId,
    p_account: account.id,
    p_charges: account.charges_enabled === true,
    p_email: email.trim(),
  });
  return {
    notice:
      ctx.mode === "test"
        ? "Stripe preparado em modo de teste. Faça uma assinatura de teste antes de ativar produção."
        : "Stripe preparado em modo real. Confira os pré-requisitos antes de ativar a cobrança.",
  };
}
async function priceRows(ctx: Pick<Context, "db" | "mode">, current = false) {
  let query = ctx.db
    .from("reposita_billing_prices")
    .select("plan_code,price_id,product_id,current")
    .eq("mode", ctx.mode);
  if (current) query = query.eq("current", true);
  const result = await query;
  if (result.error)
    throw new BillingError(503, "Catálogo de pagamentos indisponível.");
  return result.data as {
    plan_code: string;
    price_id: string;
    product_id: string;
    current: boolean;
  }[];
}
async function syncCustomer(
  ctx: Pick<Context, "db" | "mode" | "stripe">,
  customer: string,
  eventId: string,
  paidInvoice?: string,
) {
  const row = await ctx.db
    .from("reposita_billing_customers")
    .select("user_id")
    .eq("mode", ctx.mode)
    .eq("customer_id", customer)
    .maybeSingle();
  if (row.error)
    throw new BillingError(
      503,
      "Não foi possível identificar a conta do pagamento.",
    );
  if (!row.data) return;
  const observed = new Date().toISOString();
  const prices = await priceRows(ctx);
  const all = await ctx.stripe.subscriptions.list({
    customer,
    status: "all",
    limit: 100,
    expand: ["data.latest_invoice"],
  });
  if (all.has_more)
    throw new BillingError(
      409,
      "Há muitas assinaturas neste cliente. Peça ao suporte para revisar a conta Stripe.",
    );
  let subscription = chooseSubscription(
    all.data,
    new Set(prices.map((p) => p.price_id)),
  );
  let previousId: string | null = null;
  if (!subscription) {
    // A subscription changed to an unsupported price/quantity must revoke the
    // previous entitlement, rather than leave its old paid snapshot active.
    const previous = await ctx.db
      .from("reposita_billing_subscriptions")
      .select("subscription_id")
      .eq("user_id", row.data.user_id)
      .eq("mode", ctx.mode)
      .maybeSingle();
    if (previous.error)
      throw new BillingError(
        503,
        "Não foi possível conferir a assinatura anterior.",
      );
    previousId = previous.data?.subscription_id ?? null;
    if (!previousId) return;
    subscription = all.data.find((s) => s.id === previousId) ?? null;
  }
  const item =
    subscription?.items.data.length === 1 &&
    subscription.items.data[0].quantity === 1
      ? subscription.items.data[0]
      : null;
  const invoice =
    typeof subscription?.latest_invoice === "object"
      ? subscription.latest_invoice
      : null;
  const verified = !!(
    paidInvoice &&
    invoice?.id === paidInvoice &&
    invoice.status === "paid" &&
    invoice.amount_paid > 0 &&
    !(invoice.amount_paid_off_stripe ?? 0)
  );
  await rpc(ctx.db, "reposita_billing_apply_subscription", {
    p_user: row.data.user_id,
    p_mode: ctx.mode,
    p_event: eventId,
    p_subscription: subscription?.id ?? previousId,
    p_customer: customer,
    p_price: item?.price.id ?? "unsupported",
    p_status: !subscription
      ? "canceled"
      : subscription.pause_collection ||
          subscription.collection_method !== "charge_automatically"
        ? "paused"
        : subscription.status,
    p_end: item
      ? new Date(item.current_period_end * 1000).toISOString()
      : observed,
    p_cancel: subscription?.cancel_at_period_end ?? false,
    p_observed: observed,
    p_payment_verified: verified,
  });
}
async function customer(
  ctx: Context,
  lease: Record<string, unknown>,
  token: string,
) {
  if (typeof lease.customer_id === "string") return lease.customer_id;
  const created = await ctx.stripe.customers.create(
    {
      metadata: { app: "reposita", user_id: ctx.user.id },
    },
    { idempotencyKey: `reposita_customer_${ctx.mode}_${ctx.user.id}` },
  );
  const result = await ctx.db
    .from("reposita_billing_customers")
    .update({ customer_id: created.id })
    .eq("user_id", ctx.user.id)
    .eq("mode", ctx.mode)
    .eq("lease_token", token)
    .select("customer_id")
    .single();
  if (result.error)
    throw new BillingError(
      503,
      "Não foi possível vincular o pagamento à sua conta.",
    );
  if (ctx.user.email)
    await ctx.stripe.customers.update(created.id, { email: ctx.user.email });
  return created.id;
}
function urlResult(url: string | null) {
  if (!url || !trustedBillingUrl(url))
    throw new BillingError(503, "A página de pagamento não está disponível.");
  return { url };
}
async function checkout(
  ctx: Context,
  planCode: unknown,
  lease: Record<string, unknown>,
  token: string,
) {
  if (typeof planCode !== "string")
    throw new BillingError(400, "Escolha um plano.");
  if (ctx.mode !== ctx.settings.mode)
    throw new BillingError(
      409,
      "O administrador precisa concluir a preparação do gateway.",
    );
  if (ctx.mode === "live" && !ctx.settings.enabled)
    throw new BillingError(
      409,
      "As assinaturas ainda não estão disponíveis para contratação.",
    );
  if (ctx.owner && ctx.mode === "live")
    throw new BillingError(
      400,
      "A conta administradora já tem acesso sem assinatura.",
    );
  const plan = (await plans(ctx.db)).find((p) => p.code === planCode);
  const row = (await priceRows(ctx, true)).find(
    (p) => p.plan_code === planCode,
  );
  if (!plan || !row)
    throw new BillingError(400, "Este plano não está disponível.");
  const price = await ctx.stripe.prices.retrieve(row.price_id);
  if (
    !price.active ||
    price.unit_amount !== plan.amount_cents ||
    price.currency !== plan.currency ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1
  )
    throw new BillingError(
      409,
      "O preço do plano está sendo atualizado. Tente novamente mais tarde.",
    );
  const id = await customer(ctx, lease, token);
  const existing = await ctx.stripe.subscriptions.list({
    customer: id,
    status: "all",
    limit: 100,
  });
  if (existing.has_more)
    throw new BillingError(
      409,
      "Peça ao suporte para revisar suas assinaturas antes de contratar novamente.",
    );
  if (
    existing.data.some(
      (s) => !["canceled", "incomplete_expired"].includes(s.status),
    )
  )
    throw new BillingError(
      409,
      "Você já possui uma assinatura ou pagamento pendente. Use Gerenciar assinatura ou Trocar plano.",
    );
  if (typeof lease.last_checkout === "string") {
    const previous = await ctx.stripe.checkout.sessions.retrieve(
      lease.last_checkout,
    );
    if (previous.customer !== id)
      throw new BillingError(
        409,
        "Sessão de pagamento não corresponde à conta.",
      );
    if (previous.status === "open" && previous.metadata?.request_id === token)
      return urlResult(previous.url);
    if (previous.status === "open")
      await ctx.stripe.checkout.sessions.expire(previous.id);
    // Completed historical sessions must not prevent a new subscription after cancellation.
    if (
      previous.status === "complete" &&
      previous.metadata?.request_id === token
    )
      throw new BillingError(
        409,
        "Seu pagamento está em confirmação. Atualize a assinatura antes de tentar novamente.",
      );
  }
  const session = await ctx.stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: id,
      client_reference_id: ctx.user.id,
      allowed_payment_method_types: ["card"],
      line_items: [{ price: row.price_id, quantity: 1 }],
      success_url:
        ctx.config.origin +
        "/?billing=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: ctx.config.origin + "/?billing=cancel",
      subscription_data: {
        metadata: { app: "reposita", user_id: ctx.user.id, plan: plan.code },
      },
      metadata: {
        app: "reposita",
        user_id: ctx.user.id,
        plan: plan.code,
        request_id: token,
      },
    },
    { idempotencyKey: `reposita_checkout_${ctx.mode}_${ctx.user.id}_${token}` },
  );
  const saved = await ctx.db
    .from("reposita_billing_customers")
    .update({ last_checkout: session.id })
    .eq("user_id", ctx.user.id)
    .eq("mode", ctx.mode)
    .eq("lease_token", token);
  if (saved.error)
    throw new BillingError(
      503,
      "Não foi possível salvar a sessão de pagamento. Tente atualizar sua assinatura.",
    );
  return urlResult(session.url);
}
async function change(
  ctx: Context,
  code: unknown,
  lease: Record<string, unknown>,
  confirmed: unknown,
  token: string,
) {
  if (confirmed !== true || typeof code !== "string")
    throw new BillingError(400, "Confirme a alteração de plano.");
  if (typeof lease.customer_id !== "string")
    throw new BillingError(400, "Nenhuma assinatura foi encontrada.");
  const rows = await priceRows(ctx),
    current = rows.find((p) => p.current && p.plan_code === code);
  const plan = (await plans(ctx.db)).find((p) => p.code === code);
  if (!current || !plan) throw new BillingError(400, "Plano indisponível.");
  const all = await ctx.stripe.subscriptions.list({
    customer: lease.customer_id,
    status: "all",
    limit: 100,
  });
  if (all.has_more)
    throw new BillingError(
      409,
      "Peça ao suporte para revisar suas assinaturas antes de alterar o plano.",
    );
  const sub = chooseSubscription(
    all.data,
    new Set(rows.map((p) => p.price_id)),
  );
  if (
    !sub ||
    !["active", "trialing"].includes(sub.status) ||
    sub.cancel_at_period_end ||
    sub.pending_update
  )
    throw new BillingError(
      409,
      "Gerencie a assinatura ou conclua o pagamento pendente antes de trocar o plano.",
    );
  const item = sub.items.data[0];
  if (item.price.id === current.price_id)
    return { notice: "Você já está neste plano." };
  const target = await ctx.stripe.prices.retrieve(current.price_id);
  if (
    target.unit_amount !== plan.amount_cents ||
    !target.active ||
    target.currency !== "brl" ||
    target.recurring?.interval !== "month"
  )
    throw new BillingError(409, "Preço indisponível.");
  const updated = await ctx.stripe.subscriptions.update(
    sub.id,
    {
      items: [{ id: item.id, price: target.id, quantity: 1 }],
      payment_behavior: "pending_if_incomplete",
      proration_behavior: "always_invoice",
      expand: ["latest_invoice"],
    },
    { idempotencyKey: `reposita_change_${ctx.mode}_${ctx.user.id}_${token}` },
  );
  await syncCustomer(ctx, lease.customer_id, "sync:" + token);
  const invoice =
    typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
  if (updated.pending_update && invoice?.hosted_invoice_url)
    return { ...urlResult(invoice.hosted_invoice_url), pending: true };
  return {
    notice: updated.pending_update
      ? "A troca aguarda confirmação do pagamento. Seu plano anterior foi preservado."
      : "Plano alterado. Confira o novo limite e os créditos/cobranças proporcionais na fatura.",
  };
}
export async function billingPost(request: Request) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new BillingError(400, "Formato inválido.");
    const body = JSON.parse(await rawBody(request)) as Record<string, unknown>;
    if (!body || !uuid(body.request_id) || typeof body.action !== "string")
      throw new BillingError(400, "Solicitação inválida.");
    const ctx = await context(request);
    const lock = await rpc<Record<string, unknown>>(
      ctx.db,
      "reposita_billing_lock",
      { p_user: ctx.user.id, p_mode: ctx.mode, p_token: body.request_id },
    );
    try {
      if (body.action === "setup")
        return json(await setup(ctx, body.support_email));
      if (body.action === "enable" || body.action === "disable") {
        if (!ctx.owner || body.confirm !== true)
          throw new BillingError(
            403,
            "Confirme esta ação na conta administradora.",
          );
        if (body.action === "enable") {
          if (ctx.mode !== ctx.settings.mode)
            throw new BillingError(
              409,
              "Prepare o Stripe neste ambiente primeiro.",
            );
          const stored = await privateSetup(ctx);
          if (!stored || (await priceRows(ctx, true)).length !== 3)
            throw new BillingError(
              409,
              "Prepare os planos e a confirmação de pagamentos primeiro.",
            );
          if (ctx.mode === "live") {
            const proof = await ctx.db
              .from("reposita_billing_events")
              .select("event_id")
              .eq("mode", "test")
              .eq("payment_verified", true)
              .limit(1);
            const account = await ctx.stripe.accounts.retrieveCurrent();
            if (proof.error || !proof.data?.length || !account.charges_enabled)
              throw new BillingError(
                409,
                "Conclua um pagamento de teste e ative sua conta Stripe antes de receber pagamentos reais.",
              );
          }
        }
        await rpc(ctx.db, "reposita_billing_set_enabled", {
          p_enabled: body.action === "enable",
        });
        return json({
          notice:
            body.action === "enable"
              ? ctx.mode === "live"
                ? "Assinaturas reais ativadas."
                : "Controle de planos ativado em modo de teste, sem cobranças reais."
              : "Controle de assinaturas pausado. O histórico foi preservado.",
        });
      }
      if (ctx.mode !== ctx.settings.mode)
        throw new BillingError(
          409,
          "O administrador precisa concluir a preparação do gateway.",
        );
      if (body.action === "checkout")
        return json(await checkout(ctx, body.plan, lock, body.request_id));
      if (body.action === "change")
        return json(
          await change(ctx, body.plan, lock, body.confirm, body.request_id),
        );
      if (body.action === "portal") {
        if (typeof lock.customer_id !== "string")
          throw new BillingError(
            400,
            "Nenhum cliente de pagamento foi encontrado.",
          );
        const stored = await privateSetup(ctx);
        if (!stored)
          throw new BillingError(
            503,
            "Portal de pagamentos ainda não configurado.",
          );
        const session = await ctx.stripe.billingPortal.sessions.create({
          customer: lock.customer_id,
          configuration: stored.portal_id,
          return_url: ctx.config.origin + "/?billing=manage",
        });
        return json(urlResult(session.url));
      }
      if (body.action === "sync") {
        if (typeof lock.customer_id === "string")
          await syncCustomer(ctx, lock.customer_id, "sync:" + body.request_id);
        return json({
          notice: "Assinatura atualizada com os dados do gateway.",
        });
      }
      throw new BillingError(400, "Ação inválida.");
    } finally {
      await ctx.db.rpc("reposita_billing_release", {
        p_user: ctx.user.id,
        p_mode: ctx.mode,
        p_token: body.request_id,
      });
    }
  } catch (e) {
    if (e instanceof SyntaxError)
      return json({ error: "Solicitação inválida." }, 400);
    return fail(e);
  }
}
export async function billingWebhook(request: Request) {
  try {
    const c = config();
    if (!c || !readyKey(c))
      throw new BillingError(503, "Serviço de confirmação indisponível.");
    const signature = request.headers.get("stripe-signature");
    if (!signature)
      throw new BillingError(400, "Assinatura do evento ausente.");
    const raw = await rawBody(request, 262144);
    let data: { livemode?: boolean };
    try {
      data = JSON.parse(raw);
    } catch {
      throw new BillingError(400, "Evento inválido.");
    }
    const mode = data.livemode ? "live" : "test",
      db = client(c),
      stored = await privateSetup({ db, mode });
    if (!stored)
      throw new BillingError(503, "Confirmação ainda não configurada.");
    const stripe = new Stripe(c.stripeKey, {
      maxNetworkRetries: 1,
      timeout: 12000,
    });
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        raw,
        signature,
        stored.webhook_secret,
      );
    } catch {
      throw new BillingError(400, "Assinatura do evento inválida.");
    }
    if (event.livemode !== (mode === "live"))
      throw new BillingError(400, "Ambiente do evento inválido.");
    if (mode !== gatewayMode(c.stripeKey))
      return json({ received: true, ignored: true });
    if (!(billingEvents as readonly string[]).includes(event.type))
      return json({ received: true, ignored: true });
    const object = event.data.object as unknown as {
      customer?: unknown;
      id?: string;
    };
    const customer = reference(object.customer);
    if (customer)
      await syncCustomer(
        { db, mode, stripe },
        customer,
        event.id,
        event.type === "invoice.paid" ? object.id : undefined,
      );
    const updated = await db
      .from("reposita_billing_private")
      .update({ last_webhook_at: new Date().toISOString() })
      .eq("mode", mode);
    if (updated.error)
      throw new BillingError(503, "Não foi possível confirmar o recebimento.");
    return json({ received: true });
  } catch (e) {
    return fail(e);
  }
}
