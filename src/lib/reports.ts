import type { InventoryData, Movement, Product } from "../types";
import { round } from "./finance";
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function inPeriod(movement: Movement, start: string, end: string) {
  const day = dateKey(new Date(movement.created_at));
  return (!start || day >= start) && (!end || day <= end);
}
export function summarize(data: InventoryData, start: string, end: string) {
  const items = data.movements.filter((m) => inPeriod(m, start, end));
  const products = new Map(data.products.map((p) => [p.id, p]));
  const daily = new Map<
    string,
    { date: string; revenue: number; profit: number }
  >();
  const ranking = new Map<
    string,
    { id: string; name: string; units: number; revenue: number; profit: number }
  >();
  let revenue = 0,
    cost = 0,
    units = 0,
    purchase = 0;
  for (const m of items) {
    if (m.kind === "purchase") purchase += m.quantity * m.unit_cost;
    if (m.kind !== "sale") continue;
    const value = m.unit_price * m.quantity;
    const expense = m.unit_cost * m.quantity;
    revenue += value;
    cost += expense;
    units += m.quantity;
    const day = dateKey(new Date(m.created_at));
    const point = daily.get(day) ?? { date: day, revenue: 0, profit: 0 };
    point.revenue += value;
    point.profit += value - expense;
    daily.set(day, point);
    const product = ranking.get(m.product_id) ?? {
      id: m.product_id,
      name: products.get(m.product_id)?.name ?? "Produto arquivado",
      units: 0,
      revenue: 0,
      profit: 0,
    };
    product.units += m.quantity;
    product.revenue += value;
    product.profit += value - expense;
    ranking.set(m.product_id, product);
  }
  return {
    revenue: round(revenue),
    cost: round(cost),
    profit: round(revenue - cost),
    units,
    purchase: round(purchase),
    margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    ranking: [...ranking.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
export function reorder(product: Product) {
  return product.active && product.stock <= product.min_stock
    ? Math.max(product.min_stock * 2 - product.stock, 1)
    : 0;
}
export function idleProducts(data: InventoryData, days = 30, now = Date.now()) {
  const last = new Map<string, number>();
  data.movements
    .filter((m) => m.kind === "sale")
    .forEach((m) =>
      last.set(
        m.product_id,
        Math.max(last.get(m.product_id) ?? 0, new Date(m.created_at).getTime()),
      ),
    );
  const cutoff = now - days * 86400000;
  return data.products.filter(
    (p) =>
      p.active &&
      p.stock > 0 &&
      (last.get(p.id) ?? new Date(p.created_at).getTime()) < cutoff,
  );
}
