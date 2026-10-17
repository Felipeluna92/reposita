import { round, nonnegative } from "../lib/finance";
import type { InventoryData } from "../types";
import type {
  Demand,
  DemandInput,
  Opportunity,
  PurchaseInput,
  PurchaseTest,
} from "./types";
export const reasons = {
  missing: "Não vendemos este produto",
  out_of_stock: "Estava esgotado",
  variant: "Faltou medida, cor ou modelo",
  price: "Preço acima do esperado",
  delivery: "Prazo de entrega não serviu",
} as const;
export const statuses = {
  new: "Novo",
  reviewing: "Em análise",
  contacted: "Contato realizado",
  closed: "Concluído",
  ignored: "Descartado",
} as const;
export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function demandKey(
  demand: Pick<DemandInput, "label" | "variant" | "product_id">,
) {
  return (
    (demand.product_id
      ? "product:" + demand.product_id
      : "request:" + normalize(demand.label)) +
    "|" +
    normalize(demand.variant)
  );
}
export function validateDemand(input: DemandInput) {
  if (!input.label.trim() || input.label.length > 160)
    throw new Error("Informe o produto procurado (até 160 caracteres).");
  if (
    input.variant.length > 80 ||
    input.note.length > 500 ||
    input.contact.length > 160
  )
    throw new Error("Modelo, observação ou contato muito longo.");
  if (!Object.prototype.hasOwnProperty.call(reasons, input.reason))
    throw new Error("Motivo inválido.");
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 1000
  )
    throw new Error("Quantidade entre 1 e 1.000 unidades.");
  if (input.budget !== null) {
    nonnegative(input.budget, "Preço esperado");
    if (input.budget > 1_000_000) throw new Error("Preço esperado muito alto.");
  }
  if (input.contact.trim() && !input.contact_consent)
    throw new Error(
      "Registre a autorização para retornar este pedido antes de salvar o contato.",
    );
  const contact = input.contact.trim();
  if (
    contact &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) &&
    !/^\+?[\d ()-]{8,24}$/.test(contact)
  )
    throw new Error("Informe um e-mail ou telefone válido.");
}
export function opportunities(demands: Demand[]): Opportunity[] {
  const groups = new Map<string, Opportunity>();
  for (const demand of demands) {
    if (demand.status === "ignored" || demand.status === "closed") continue;
    const key = demandKey(demand);
    const group = groups.get(key) ?? {
      key,
      label: demand.label,
      variant: demand.variant,
      product_id: demand.product_id,
      records: [],
      units: 0,
      contacts: 0,
      budget: null,
      last_at: demand.created_at,
    };
    group.records.push(demand);
    group.units += demand.quantity;
    if (demand.contact && demand.contact_consent) group.contacts++;
    group.last_at =
      demand.created_at > group.last_at ? demand.created_at : group.last_at;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => {
      const prices = g.records
        .filter((d) => d.budget !== null)
        .map((d) => d.budget!);
      return {
        ...g,
        budget: prices.length
          ? round(prices.reduce((a, b) => a + b, 0) / prices.length)
          : null,
      };
    })
    .sort(
      (a, b) =>
        b.records.length - a.records.length ||
        b.last_at.localeCompare(a.last_at),
    );
}
export function validatePurchase(input: PurchaseInput) {
  if (
    !input.product_id ||
    !input.title.trim() ||
    input.title.length > 160 ||
    input.note.length > 500 ||
    input.demand_key.length > 300
  )
    throw new Error("Vincule um produto e informe um título válido.");
  for (const key of [
    "unit_cost",
    "freight",
    "packaging",
    "sale_price",
    "fee",
    "tax",
    "expected_units",
  ] as const)
    nonnegative(input[key], key);
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 10000
  )
    throw new Error("Lote entre 1 e 10.000 unidades.");
  if (
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    input.days > 365 ||
    !Number.isInteger(input.expected_units) ||
    input.expected_units > 100000
  )
    throw new Error(
      "Prazo e unidades esperadas precisam ser inteiros válidos.",
    );
  if (input.sale_price <= 0 || input.fee + input.tax >= 100)
    throw new Error("Defina um preço positivo e taxas somando menos de 100%.");
}
export function purchaseScenarios(input: PurchaseInput) {
  validatePurchase(input);
  const investment = input.quantity * input.unit_cost + input.freight;
  const landed = input.unit_cost + input.freight / input.quantity;
  const variable = landed + input.packaging;
  const rate = (input.fee + input.tax) / 100;
  const scenarios = [
    ["Conservador", 0.5],
    ["Informado por você", 1],
    ["Maior saída", 1.5],
  ] as const;
  return {
    investment: round(investment),
    landed: round(landed),
    contribution: round(input.sale_price * (1 - rate) - variable),
    margin:
      ((input.sale_price * (1 - rate) - variable) / input.sale_price) * 100,
    scenarios: scenarios.map(([label, factor]) => {
      const units = Math.min(
        input.quantity,
        Math.floor(input.expected_units * factor),
      );
      const netReceipts =
        units * (input.sale_price * (1 - rate) - input.packaging);
      return {
        label,
        units,
        revenue: round(units * input.sale_price),
        cashAfterPurchase: round(netReceipts - investment),
        remaining: input.quantity - units,
        contribution: round(units * (input.sale_price * (1 - rate) - variable)),
      };
    }),
  };
}
export function testResult(test: PurchaseTest, inventory: InventoryData) {
  if (!test.started_at) return { units: 0, revenue: 0, gross: 0, events: 0 };
  const since = new Date(test.started_at).getTime();
  const until = Math.min(
    test.finished_at ? new Date(test.finished_at).getTime() : Infinity,
    since + test.days * 86400000,
    Date.now(),
  );
  const sales = inventory.movements.filter(
    (m) =>
      m.kind === "sale" &&
      m.product_id === test.product_id &&
      new Date(m.created_at).getTime() >= since &&
      new Date(m.created_at).getTime() <= until,
  );
  return {
    units: sales.reduce((a, m) => a + m.quantity, 0),
    revenue: round(sales.reduce((a, m) => a + m.quantity * m.unit_price, 0)),
    gross: round(
      sales.reduce((a, m) => a + m.quantity * (m.unit_price - m.unit_cost), 0),
    ),
    events: sales.length,
  };
}
export function whatsappLink(contact: string, label: string) {
  const digits = contact.replace(/\D/g, "");
  if (contact.includes("@") || digits.length < 10) return null;
  const phone =
    digits.startsWith("55") && digits.length >= 12 ? digits : "55" + digits;
  return (
    "https://wa.me/" +
    phone +
    "?text=" +
    encodeURIComponent(
      `Olá! Sobre o produto que você procurou (${label}), posso te passar uma atualização? Se não quiser mais receber retorno sobre esse pedido, é só avisar.`,
    )
  );
}
