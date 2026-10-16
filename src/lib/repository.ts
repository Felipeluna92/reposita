import { supabase } from "./supabase";
import { applyMovement, validateProduct } from "./inventory";
import type { InventoryData, Movement, ProductInput } from "../types";
const storageKey = "reposita.demo.v2";
export function readDemo(): InventoryData {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { products: [], movements: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.products) || !Array.isArray(parsed.movements))
      throw new Error();
    return parsed;
  } catch {
    throw new Error(
      "Dados de demonstração inválidos. Faça uma cópia do armazenamento antes de limpá-lo.",
    );
  }
}
function persist(data: InventoryData) {
  localStorage.setItem(storageKey, JSON.stringify(data));
  return data;
}
export function exampleData() {
  if (readDemo().products.length)
    throw new Error(
      "Os exemplos só podem ser inseridos numa demonstração vazia.",
    );
  const now = new Date().toISOString();
  return persist({
    products: [
      {
        id: crypto.randomUUID(),
        name: "Café especial 500 g",
        sku: "CAF-001",
        category: "Mercearia",
        stock: 18,
        min_stock: 10,
        cost: 24.5,
        price: 42.9,
        active: true,
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        name: "Organizador modular",
        sku: "CAS-001",
        category: "Casa",
        stock: 3,
        min_stock: 8,
        cost: 18,
        price: 39.9,
        active: true,
        created_at: now,
      },
      {
        id: crypto.randomUUID(),
        name: "Camiseta básica",
        sku: "VES-001",
        category: "Vestuário",
        stock: 32,
        min_stock: 12,
        cost: 22,
        price: 59.9,
        active: true,
        created_at: now,
      },
    ],
    movements: [],
  });
}
async function rows(table: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const result: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error)
      throw new Error(
        `Banco indisponível: ${error.message}. Confira a migration e as permissões RLS.`,
      );
    result.push(...data);
    if (data.length < 500) return result;
  }
}
export async function loadData(demo: boolean): Promise<InventoryData> {
  if (demo) return readDemo();
  const [products, movements] = await Promise.all([
    rows("reposita_products"),
    rows("reposita_movements"),
  ]);
  return { products, movements } as InventoryData;
}
export async function saveProduct(
  demo: boolean,
  data: InventoryData,
  input: ProductInput,
  id?: string,
) {
  validateProduct(input);
  if (
    data.products.some(
      (p) => p.id !== id && p.sku && p.sku === input.sku.trim(),
    )
  )
    throw new Error("Este código SKU já existe.");
  if (demo) {
    const existing = data.products.find((p) => p.id === id);
    const product = {
      ...input,
      name: input.name.trim(),
      sku: input.sku.trim(),
      category: input.category.trim() || "Geral",
      id: id || crypto.randomUUID(),
      stock: existing?.stock ?? input.initial_stock,
      active: existing?.active ?? true,
      created_at: existing?.created_at ?? new Date().toISOString(),
    };
    const products = existing
      ? data.products.map((p) => (p.id === id ? product : p))
      : [product, ...data.products];
    const opening: Movement[] =
      !existing && input.initial_stock > 0
        ? [
            {
              id: crypto.randomUUID(),
              product_id: product.id,
              quantity: input.initial_stock,
              kind: "adjustment_in",
              unit_cost: input.cost,
              unit_price: input.price,
              note: "Saldo inicial",
              created_at: product.created_at,
            },
          ]
        : [];
    return persist({ products, movements: [...opening, ...data.movements] });
  }
  const { error } = await supabase!.rpc("reposita_save_product", {
    p_id: id ?? null,
    p_input: input,
  });
  if (error) throw new Error(error.message);
  return loadData(false);
}
export async function moveStock(
  demo: boolean,
  data: InventoryData,
  movement: Movement,
) {
  const next = applyMovement(data, movement);
  if (demo) return persist(next);
  const { error } = await supabase!.rpc("reposita_move_stock", {
    p_request: movement.id,
    p_product: movement.product_id,
    p_kind: movement.kind,
    p_quantity: movement.quantity,
    p_cost: movement.unit_cost,
    p_price: movement.unit_price,
    p_note: movement.note,
  });
  if (error) throw new Error(error.message);
  return loadData(false);
}
export async function archiveProduct(
  demo: boolean,
  data: InventoryData,
  id: string,
) {
  if (data.products.find((p) => p.id === id)?.stock !== 0)
    throw new Error("Zere o saldo com uma movimentação antes de arquivar.");
  if (demo)
    return persist({
      ...data,
      products: data.products.map((p) =>
        p.id === id ? { ...p, active: false } : p,
      ),
    });
  const { error } = await supabase!.rpc("reposita_archive_product", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
  return loadData(false);
}
