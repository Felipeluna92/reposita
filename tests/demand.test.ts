import { describe, it, expect } from "vitest";
import { blankDemand } from "../src/demand/DemandFields";
import {
  demandKey,
  opportunities,
  purchaseScenarios,
  testResult,
  validateDemand,
  validatePurchase,
  whatsappLink,
} from "../src/demand/logic";
import { applyMovement } from "../src/lib/inventory";
import type { Demand, PurchaseInput, PurchaseTest } from "../src/demand/types";
import type { InventoryData, Movement } from "../src/types";
const plan: PurchaseInput = {
  product_id: "p",
  title: "Fornecedor A",
  demand_key: "",
  quantity: 10,
  unit_cost: 10,
  freight: 20,
  packaging: 1,
  sale_price: 25,
  fee: 5,
  tax: 5,
  expected_units: 8,
  days: 10,
  note: "",
};
const record = (id: string, overrides: Partial<Demand> = {}): Demand => ({
  ...blankDemand,
  id,
  label: "Café",
  quantity: 2,
  source: "manual",
  status: "new",
  created_at: "2026-10-01T12:00:00Z",
  ...overrides,
});
describe("procura e oportunidades", () => {
  it("exige autorização para guardar contato e aceita pedido sem contato", () => {
    expect(() =>
      validateDemand({ ...blankDemand, label: "Pneu", contact: "11999999999" }),
    ).toThrow("autorização");
    expect(() =>
      validateDemand({ ...blankDemand, label: "Pneu" }),
    ).not.toThrow();
  });
  it("recusa valores fracionários, infinitos e textos excessivos", () => {
    for (const patch of [
      { quantity: 1.5 },
      { budget: Infinity },
      { label: "a".repeat(161) },
      { reason: "constructor" },
      { contact: "invalido", contact_consent: true },
    ])
      expect(() =>
        validateDemand({
          ...blankDemand,
          label: "Café",
          ...patch,
        } as typeof blankDemand),
      ).toThrow();
  });
  it("agrupa grafias equivalentes, mas preserva variantes e não conta fechados", () => {
    const groups = opportunities([
      record("1", { label: "Café", variant: "500 g", budget: 20 }),
      record("2", { label: "CAFE", variant: "500 G", budget: 30 }),
      record("3", { variant: "1 kg" }),
      record("4", { status: "closed" }),
      record("5", { status: "ignored" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ units: 4, budget: 25 });
    expect(groups[0].records).toHaveLength(2);
  });
  it("vínculos reúnem nomes diferentes sem misturar tamanhos", () => {
    expect(demandKey(record("a", { product_id: "p", label: "A" }))).toBe(
      demandKey(record("b", { product_id: "p", label: "B" })),
    );
    expect(demandKey(record("a", { product_id: "p", variant: "P" }))).not.toBe(
      demandKey(record("a", { product_id: "p", variant: "G" })),
    );
  });
  it("monta apenas link manual e não trata e-mail como WhatsApp", () => {
    expect(whatsappLink("contato@loja.com", "Café")).toBeNull();
    expect(whatsappLink("(11) 99999-9999", "Café")).toContain(
      "https://wa.me/5511999999999?text=",
    );
    expect(
      decodeURIComponent(whatsappLink("(11) 99999-9999", "Café")!),
    ).toContain("não quiser mais");
  });
});
describe("cenários explícitos de compra", () => {
  it("rateia frete, limita saída ao lote e distingue caixa de contribuição", () => {
    const s = purchaseScenarios(plan);
    expect(s.investment).toBe(120);
    expect(s.landed).toBe(12);
    expect(s.contribution).toBe(9.5);
    expect(s.scenarios.map((x) => x.units)).toEqual([4, 8, 10]);
    expect(s.scenarios[1]).toMatchObject({
      cashAfterPurchase: 52,
      contribution: 76,
      remaining: 2,
    });
  });
  it("aceita nenhuma saída e evidencia dinheiro imobilizado", () => {
    expect(
      purchaseScenarios({ ...plan, expected_units: 0 }).scenarios[0]
        .cashAfterPurchase,
    ).toBe(-120);
  });
  it("recusa percentuais impossíveis e NaN", () => {
    expect(() => validatePurchase({ ...plan, fee: 90, tax: 10 })).toThrow();
    expect(() => validatePurchase({ ...plan, unit_cost: NaN })).toThrow();
    expect(() => validatePurchase({ ...plan, days: 0 })).toThrow();
  });
  it("observa só vendas do produto dentro da janela e mantém custo histórico", () => {
    const test: PurchaseTest = {
      ...plan,
      id: "t",
      status: "purchased",
      started_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01",
      finished_at: null,
      outcome_note: "",
    };
    const sale: Movement = {
      id: "m",
      product_id: "p",
      kind: "sale",
      quantity: 2,
      unit_cost: 11,
      unit_price: 26,
      note: "",
      created_at: "2026-01-02T12:00:00Z",
    };
    const inventory = {
      products: [],
      movements: [
        sale,
        { ...sale, id: "before", created_at: "2025-12-31T00:00:00Z" },
        { ...sale, id: "after", created_at: "2026-01-12T00:00:00Z" },
        { ...sale, id: "purchase", kind: "purchase" as const },
        { ...sale, id: "other", product_id: "other" },
      ],
    };
    expect(testResult(test, inventory)).toEqual({
      units: 2,
      revenue: 52,
      gross: 30,
      events: 1,
    });
    expect(
      testResult({ ...test, finished_at: "2026-01-02T00:00:00Z" }, inventory)
        .units,
    ).toBe(0);
  });
});
describe("custo médio nas compras", () => {
  const data: InventoryData = {
    products: [
      {
        id: "p",
        name: "Pneu",
        sku: "P",
        category: "Geral",
        stock: 100,
        min_stock: 2,
        cost: 10,
        price: 20,
        active: true,
        created_at: "2026-01-01",
      },
    ],
    movements: [],
  };
  const purchase: Movement = {
    id: "buy",
    product_id: "p",
    kind: "purchase",
    quantity: 100,
    unit_cost: 20,
    unit_price: 30,
    note: "",
    created_at: "2026-01-02",
  };
  it("100 a R$10 mais 100 a R$20 resulta em 200 a R$15", () => {
    const result = applyMovement(data, purchase);
    expect(result.products[0]).toMatchObject({ stock: 200, cost: 15 });
    expect(data.products[0].cost).toBe(10);
    expect(applyMovement(result, purchase).products[0].stock).toBe(200);
  });
  it("saldo zero assume o novo custo e saída preserva média", () => {
    const zero = {
      ...data,
      products: [{ ...data.products[0], stock: 0, cost: 1 }],
    };
    expect(
      applyMovement(zero, { ...purchase, quantity: 100, unit_cost: 10 })
        .products[0],
    ).toMatchObject({ stock: 100, cost: 10 });
    expect(
      applyMovement(data, {
        ...purchase,
        kind: "sale",
        quantity: 1,
        unit_cost: 3,
      }).products[0].cost,
    ).toBe(10);
  });
});
