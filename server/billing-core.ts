import type Stripe from "stripe";
export const billingEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;
export class BillingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function gatewayMode(key: string) {
  const match = /^(?:sk|rk)_(test|live)_/.exec(key);
  if (!match)
    throw new BillingError(
      503,
      "Configure a chave secreta Stripe de teste ou produção na Vercel.",
    );
  return match[1] as "test" | "live";
}
export function reference(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  )
    return value.id;
  return null;
}
export function chooseSubscription(
  subs: Stripe.Subscription[],
  prices: Set<string>,
): Stripe.Subscription | null {
  const relevant = subs.filter(
    (s) =>
      s.items.data.length === 1 &&
      prices.has(s.items.data[0].price.id) &&
      s.items.data[0].quantity === 1,
  );
  const rank = (s: Stripe.Subscription) =>
    ["active", "trialing"].includes(s.status)
      ? 3
      : ["past_due", "unpaid", "paused"].includes(s.status)
        ? 2
        : s.status === "incomplete"
          ? 1
          : 0;
  return (
    relevant.sort((a, b) => rank(b) - rank(a) || b.created - a.created)[0] ??
    null
  );
}
export function trustedBillingUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
    );
  } catch {
    return false;
  }
}
export function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}
export async function rawBody(request: Request, max = 8192) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new BillingError(413, "Solicitação muito longa.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
