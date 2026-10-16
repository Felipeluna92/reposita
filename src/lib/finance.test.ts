import { describe, expect, it } from "vitest";
import { margin, pricing, type PricingInput } from "./finance";
const base: PricingInput = {
  cost: 40,
  freight: 5,
  packaging: 3,
  other: 2,
  fee: 5,
  tax: 5,
  target: 30,
  price: 100,
  quantity: 10,
  fixed: 200,
};
describe("precificação", () => {
  it("calcula custo, preço mínimo, contribuição e despesas fixas", () => {
    expect(pricing(base)).toEqual({
      unitCost: 50,
      floor: 55.56,
      suggested: 83.34,
      contribution: 40,
      margin: 40,
      result: 200,
      breakEven: 5,
    });
  });
  it("não confunde margem com markup", () => {
    expect(margin(50, 100)).toBe(50);
  });
  it("não divide por zero", () => {
    expect(margin(0, 0)).toBeNull();
    expect(pricing({ ...base, price: 0 }).breakEven).toBeNull();
  });
  it("recusa margem impossível", () => {
    expect(() => pricing({ ...base, target: 90 })).toThrow();
  });
  it("recusa negativos, NaN e infinito", () => {
    [-1, NaN, Infinity].forEach((cost) =>
      expect(() => pricing({ ...base, cost })).toThrow(),
    );
  });
  it("mostra prejuízo em vez de lucro inventado", () => {
    expect(pricing({ ...base, price: 10 }).contribution).toBe(-41);
  });
});
