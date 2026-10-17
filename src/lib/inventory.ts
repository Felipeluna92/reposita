import type {
  InventoryData,
  Movement,
  MovementKind,
  ProductInput,
} from "../types";
import { nonnegative, round } from "./finance";
export const kindLabels: Record<MovementKind, string> = {
  purchase: "Entrada de compra",
  sale: "Venda",
  adjustment_in: "Ajuste de entrada",
  adjustment_out: "Ajuste de saída",
};
export const isEntry = (kind: MovementKind) =>
  kind === "purchase" || kind === "adjustment_in";
export function validateProduct(input: ProductInput) {
  for (const [key, limit] of [
    ["description", 2000],
    ["barcode", 80],
    ["supplier", 160],
    ["location", 160],
  ] as const) {
    if ((input[key]?.length ?? 0) > limit)
      throw new Error(`Campo ${key} muito longo (máximo ${limit}).`);
  }
  if (!input.name.trim()) throw new Error("Informe o nome do produto.");
  if (
    input.name.length > 160 ||
    input.sku.length > 60 ||
    input.category.length > 80
  )
    throw new Error("Nome, código ou categoria muito longos.");
  ["min_stock", "initial_stock", "cost", "price"].forEach((key) =>
    nonnegative(input[key as keyof ProductInput] as number, key),
  );
  if (
    !Number.isInteger(input.initial_stock) ||
    !Number.isInteger(input.min_stock)
  )
    throw new Error("Estoque e mínimo precisam ser números inteiros.");
}
export function applyMovement(
  data: InventoryData,
  movement: Movement,
): InventoryData {
  if (!(movement.kind in kindLabels))
    throw new Error("Tipo de movimentação inválido.");
  if (movement.note.length > 500) throw new Error("Observação muito longa.");
  if (data.movements.some((m) => m.id === movement.id)) return data;
  const product = data.products.find(
    (p) => p.id === movement.product_id && p.active,
  );
  if (!product) throw new Error("Produto não encontrado ou arquivado.");
  if (!Number.isInteger(movement.quantity) || movement.quantity <= 0)
    throw new Error("Informe uma quantidade inteira maior que zero.");
  nonnegative(movement.unit_cost, "Custo");
  nonnegative(movement.unit_price, "Preço");
  const stock =
    product.stock + (isEntry(movement.kind) ? 1 : -1) * movement.quantity;
  if (stock < 0) throw new Error("Estoque insuficiente.");
  const cost =
    movement.kind === "purchase"
      ? round(
          (product.stock * product.cost +
            movement.quantity * movement.unit_cost) /
            stock,
        )
      : product.cost;
  return {
    products: data.products.map((p) =>
      p.id === product.id ? { ...p, stock, cost } : p,
    ),
    movements: [movement, ...data.movements],
  };
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
