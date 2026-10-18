import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import {
  chooseSubscription,
  gatewayMode,
  rawBody,
  reference,
  trustedBillingUrl,
  uuid,
} from "../server/billing-core";
function subscription(
  id: string,
  status: string,
  created: number,
  price = "price_known",
  quantity = 1,
) {
  return {
    id,
    status,
    created,
    items: { data: [{ price: { id: price }, quantity }] },
  } as unknown as Stripe.Subscription;
}
describe("regras de pagamento", () => {
  it("separa chaves reais e de teste e recusa chaves públicas", () => {
    expect(gatewayMode("sk_test_example")).toBe("test");
    expect(gatewayMode("rk_live_example")).toBe("live");
    expect(() => gatewayMode("pk_live_example")).toThrow("chave secreta");
  });
  it("seleciona a assinatura ativa sem reativar uma cancelada antiga", () => {
    const subs = [
      subscription("old", "canceled", 9),
      subscription("new", "active", 5),
      subscription("pending", "incomplete", 10),
    ];
    expect(chooseSubscription(subs, new Set(["price_known"]))?.id).toBe("new");
    expect(
      chooseSubscription(
        [
          subscription("other", "active", 3, "unrelated"),
          subscription("bulk", "active", 4, "price_known", 2),
        ],
        new Set(["price_known"]),
      ),
    ).toBeNull();
  });
  it("só redireciona para HTTPS do Stripe e valida identificadores", () => {
    expect(trustedBillingUrl("https://checkout.stripe.com/c/pay/session")).toBe(
      true,
    );
    for (const url of [
      "javascript:alert(1)",
      "https://stripe.com.evil.example/",
      "http://billing.stripe.com/",
    ])
      expect(trustedBillingUrl(url)).toBe(false);
    expect(uuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(uuid("user@example.org")).toBe(false);
    expect(reference({ id: "cus_1" })).toBe("cus_1");
    expect(reference({ customer: "cus_1" })).toBeNull();
  });
  it("limita o corpo por bytes sem depender de Content-Length", async () => {
    await expect(
      rawBody(
        new Request("https://example.org", {
          method: "POST",
          body: "á".repeat(5000),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
