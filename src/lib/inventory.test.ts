import { describe, expect, it } from "vitest";
import { applyMovement, csvCell, validateProduct } from "./inventory";
import type { InventoryData, Movement } from "../types";
const data: InventoryData = {
  products: [
    {
      id: "p1",
      name: "Teste",
      sku: "",
      category: "Geral",
      stock: 5,
      min_stock: 2,
      cost: 10,
      price: 20,
      active: true,
      created_at: "",
    },
  ],
  movements: [],
};
const sale: Movement = {
  id: "m1",
  product_id: "p1",
  kind: "sale",
  quantity: 2,
  unit_cost: 10,
  unit_price: 20,
  note: "",
  created_at: "",
};
describe("estoque", () => {
  it("registra saída sem mutar o estado anterior", () => {
    const next = applyMovement(data, sale);
    expect(next.products[0].stock).toBe(3);
    expect(data.products[0].stock).toBe(5);
  });
  it("registra entradas", () =>
    expect(
      applyMovement(data, { ...sale, kind: "purchase" }).products[0].stock,
    ).toBe(7));
  it("impede saldo negativo", () =>
    expect(() => applyMovement(data, { ...sale, quantity: 6 })).toThrow(
      "Estoque insuficiente",
    ));
  it("impede zero e quantidade fracionária", () =>
    [0, -1, 1.5].forEach((quantity) =>
      expect(() => applyMovement(data, { ...sale, quantity })).toThrow(),
    ));
  it("não duplica a mesma requisição", () => {
    const next = applyMovement(data, sale);
    expect(applyMovement(next, sale).movements).toHaveLength(1);
  });
  it("recusa produto inexistente e custo inválido", () => {
    expect(() =>
      applyMovement(data, { ...sale, product_id: "other" }),
    ).toThrow();
    expect(() => applyMovement(data, { ...sale, unit_cost: NaN })).toThrow();
  });
  it("valida cadastro", () => {
    expect(() =>
      validateProduct({
        name: "",
        sku: "",
        category: "Geral",
        initial_stock: 0,
        min_stock: 0,
        cost: 0,
        price: 0,
      }),
    ).toThrow();
  });
});
describe("CSV seguro", () => {
  it("escapa aspas e separadores", () =>
    expect(csvCell('Produto; "A"')).toBe('"Produto; ""A"""'));
  it("neutraliza fórmulas de planilha", () =>
    ["=cmd()", "+SUM(1)", "-1+2", "@SUM(1)", "  =A1"].forEach((value) =>
      expect(csvCell(value)).toMatch(/^"'/),
    ));
});
