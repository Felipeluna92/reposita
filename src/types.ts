export type Product = {
  id: string;
  user_id?: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  min_stock: number;
  cost: number;
  price: number;
  active: boolean;
  created_at: string;
  description?: string;
  barcode?: string;
  supplier?: string;
  location?: string;
  image_path?: string | null;
};
export type ProductInput = Pick<
  Product,
  "name" | "sku" | "category" | "min_stock" | "cost" | "price"
> & {
  initial_stock: number;
  description?: string;
  barcode?: string;
  supplier?: string;
  location?: string;
  image_path?: string | null;
};
export type MovementKind =
  | "purchase"
  | "sale"
  | "adjustment_in"
  | "adjustment_out";
export type Movement = {
  id: string;
  product_id: string;
  kind: MovementKind;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  note: string;
  created_at: string;
};
export type InventoryData = { products: Product[]; movements: Movement[] };
