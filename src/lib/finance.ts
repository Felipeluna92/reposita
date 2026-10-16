export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
export const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function nonnegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} precisa ser um número maior ou igual a zero.`);
  return value;
}
export function margin(cost: number, price: number) {
  nonnegative(cost, "Custo");
  nonnegative(price, "Preço");
  return price === 0 ? null : ((price - cost) / price) * 100;
}
export type PricingInput = {
  cost: number;
  freight: number;
  packaging: number;
  other: number;
  fee: number;
  tax: number;
  target: number;
  price: number;
  quantity: number;
  fixed: number;
};
export function pricing(input: PricingInput) {
  Object.entries(input).forEach(([key, value]) => nonnegative(value, key));
  if (!Number.isInteger(input.quantity))
    throw new Error("A quantidade de unidades precisa ser inteira.");
  const rate = (input.fee + input.tax) / 100;
  const target = input.target / 100;
  if (rate + target >= 1)
    throw new Error(
      "Taxas, impostos e margem desejada precisam somar menos de 100%.",
    );
  const unitCost = input.cost + input.freight + input.packaging + input.other;
  const contribution = input.price * (1 - rate) - unitCost;
  return {
    unitCost: round(unitCost),
    floor: Math.max(0, Math.ceil((unitCost / (1 - rate) - 1e-10) * 100) / 100),
    suggested: Math.max(
      0,
      Math.ceil((unitCost / (1 - rate - target) - 1e-10) * 100) / 100,
    ),
    contribution: round(contribution),
    margin: input.price > 0 ? (contribution / input.price) * 100 : null,
    result: round(contribution * input.quantity - input.fixed),
    breakEven: contribution > 0 ? Math.ceil(input.fixed / contribution) : null,
  };
}
