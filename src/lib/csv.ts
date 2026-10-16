import type { ProductInput } from "../types";
import { csvCell, validateProduct } from "./inventory";
export const csvHeaders = [
  "Produto",
  "SKU",
  "Categoria",
  "Estoque",
  "Estoque mínimo",
  "Custo unitário",
  "Preço de venda",
  "Código de barras",
  "Fornecedor",
  "Localização",
  "Descrição",
];
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes(";") ? ";" : ",";
  const result: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) result.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV inválido: aspas sem fechamento.");
  row.push(cell);
  if (row.some((v) => v.trim())) result.push(row);
  return result;
}
const normalize = (s: string) =>
  s
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function number(value: string, label: string) {
  const v = value.trim();
  if (!v) return 0;
  const normalized = v.includes(",")
    ? v.replace(/\./g, "").replace(",", ".")
    : v;
  if (!/^\d+(\.\d+)?$/.test(normalized))
    throw new Error(`${label}: número inválido.`);
  return Number(normalized);
}
export function importPreview(text: string, existingSkus: string[]) {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error("Arquivo vazio.");
  const fields = header.map(normalize);
  const get = (row: string[], label: string) => {
    const index = fields.indexOf(normalize(label));
    const value = index < 0 ? "" : (row[index] ?? "");
    return /^'[\s]*[=+@-]/.test(value) ? value.slice(1) : value;
  };
  if (!fields.includes("produto"))
    throw new Error("Coluna Produto ausente. Baixe o modelo.");
  if (rows.length > 200)
    throw new Error("Importe no máximo 200 produtos por arquivo.");
  const used = new Set(existingSkus.filter(Boolean));
  return rows.map((row, index) => {
    let input: ProductInput | undefined;
    let error = "";
    try {
      input = {
        name: get(row, "Produto"),
        sku: get(row, "SKU").trim(),
        category: get(row, "Categoria") || "Geral",
        initial_stock: number(get(row, "Estoque"), "Estoque"),
        min_stock: number(get(row, "Estoque mínimo"), "Estoque mínimo"),
        cost: number(get(row, "Custo unitário"), "Custo"),
        price: number(get(row, "Preço de venda"), "Venda"),
        barcode: get(row, "Código de barras"),
        supplier: get(row, "Fornecedor"),
        location: get(row, "Localização"),
        description: get(row, "Descrição"),
      };
      validateProduct(input);
      if (input.sku && used.has(input.sku))
        throw new Error("SKU duplicado no arquivo ou já cadastrado.");
      if (input.sku) used.add(input.sku);
    } catch (e) {
      error = (e as Error).message;
    }
    return { line: index + 2, input, error };
  });
}
