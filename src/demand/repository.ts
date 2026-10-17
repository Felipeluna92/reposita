import { supabase } from "../lib/supabase";
import { loadData, moveStock } from "../lib/repository";
import type {
  Demand,
  DemandData,
  DemandInput,
  DemandStatus,
  PublicStore,
  PurchaseInput,
  PurchaseTest,
} from "./types";
import { validateDemand, validatePurchase, purchaseScenarios } from "./logic";
const key = "reposita.demand.v1";
export function readDemandDemo(): DemandData {
  const raw = localStorage.getItem(key);
  if (!raw) return { demands: [], tests: [], store: null };
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.demands) || !Array.isArray(data.tests))
      throw new Error();
    return data;
  } catch {
    throw new Error(
      "Os dados locais de procura estão inválidos. Guarde uma cópia antes de limpar o navegador.",
    );
  }
}
function persist(data: DemandData) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    throw new Error(
      "Não foi possível salvar no navegador. Verifique o espaço disponível.",
    );
  }
  return data;
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const result = await supabase.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function rows(table: string) {
  const result: unknown[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase!
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + 499);
    if (error)
      throw new Error(
        "Execute a nova migration 202610170003_demand.sql para ativar procura e testes. Detalhe: " +
          error.message,
      );
    result.push(...data);
    if (data.length < 500) return result;
  }
}
export async function loadDemand(demo: boolean): Promise<DemandData> {
  if (demo) return readDemandDemo();
  const [demands, tests, storeResult] = await Promise.all([
    rows("reposita_demands"),
    rows("reposita_purchase_tests"),
    supabase!.from("reposita_public_stores").select("*").maybeSingle(),
  ]);
  if (storeResult.error) throw new Error(storeResult.error.message);
  return {
    demands: demands as Demand[],
    tests: tests as PurchaseTest[],
    store: storeResult.data as PublicStore | null,
  };
}
export async function saveDemand(
  demo: boolean,
  input: DemandInput,
  id: string,
) {
  validateDemand(input);
  if (demo) {
    const data = readDemandDemo();
    const previous = data.demands.find((d) => d.id === id);
    const record: Demand = {
      ...input,
      id,
      source: previous?.source ?? "manual",
      status: previous?.status ?? "new",
      created_at: previous?.created_at ?? new Date().toISOString(),
      consent_at: input.contact_consent
        ? (previous?.consent_at ?? new Date().toISOString())
        : null,
    };
    return persist({
      ...data,
      demands: previous
        ? data.demands.map((d) => (d.id === id ? record : d))
        : [record, ...data.demands],
    });
  }
  await rpc("reposita_save_demand", { p_id: id, p_input: input });
  return loadDemand(false);
}
export async function demandAction(
  demo: boolean,
  id: string,
  action: DemandStatus | "forget_contact",
) {
  if (demo) {
    const data = readDemandDemo();
    return persist({
      ...data,
      demands: data.demands.map((d) =>
        d.id !== id
          ? d
          : action === "forget_contact"
            ? { ...d, contact: "", contact_consent: false, consent_at: null }
            : { ...d, status: action },
      ),
    });
  }
  await rpc("reposita_demand_action", { p_id: id, p_action: action });
  return loadDemand(false);
}
export async function saveTest(
  demo: boolean,
  input: PurchaseInput,
  id: string,
) {
  validatePurchase(input);
  if (demo) {
    const data = readDemandDemo();
    const old = data.tests.find((t) => t.id === id);
    if (old && old.status !== "planned")
      throw new Error(
        "O teste já foi iniciado. As premissas foram preservadas.",
      );
    const test: PurchaseTest = {
      ...input,
      id,
      status: "planned",
      created_at: old?.created_at ?? new Date().toISOString(),
      started_at: null,
      finished_at: null,
      outcome_note: "",
    };
    return persist({
      ...data,
      tests: old
        ? data.tests.map((t) => (t.id === id ? test : t))
        : [test, ...data.tests],
    });
  }
  await rpc("reposita_save_purchase_test", { p_id: id, p_input: input });
  return loadDemand(false);
}
export async function testAction(
  demo: boolean,
  id: string,
  action: "purchase" | "complete" | "cancel",
  note = "",
) {
  if (demo) {
    const data = readDemandDemo();
    const test = data.tests.find((t) => t.id === id);
    if (!test) throw new Error("Teste não encontrado.");
    if (action === "purchase") {
      if (test.status === "purchased" || test.status === "completed")
        return data;
      if (test.status !== "planned") throw new Error("Teste cancelado.");
      const inventory = await loadData(true);
      await moveStock(true, inventory, {
        id,
        product_id: test.product_id,
        kind: "purchase",
        quantity: test.quantity,
        unit_cost: purchaseScenarios(test).landed,
        unit_price: test.sale_price,
        note: "Teste de compra: " + test.title,
        created_at: new Date().toISOString(),
      });
    }
    if (action === "complete" && test.status !== "purchased")
      throw new Error("Inicie a compra antes de concluir.");
    if (action === "cancel" && test.status !== "planned")
      throw new Error(
        "Compras registradas não são apagadas ao encerrar um teste.",
      );
    return persist({
      ...data,
      tests: data.tests.map((t) =>
        t.id !== id
          ? t
          : {
              ...t,
              status:
                action === "purchase"
                  ? "purchased"
                  : action === "complete"
                    ? "completed"
                    : "canceled",
              started_at:
                action === "purchase" ? new Date().toISOString() : t.started_at,
              finished_at:
                action === "complete"
                  ? new Date().toISOString()
                  : t.finished_at,
              outcome_note: note.slice(0, 500),
            },
      ),
    });
  }
  await rpc("reposita_purchase_test_action", {
    p_id: id,
    p_action: action,
    p_note: note,
  });
  return loadDemand(false);
}
export async function saveStore(
  demo: boolean,
  name: string,
  enabled: boolean,
  rotate = false,
) {
  if (!name.trim() || name.length > 80)
    throw new Error("Informe um nome de loja com até 80 caracteres.");
  if (demo) {
    const data = readDemandDemo();
    return persist({
      ...data,
      store: {
        name,
        enabled,
        public_token: rotate
          ? crypto.randomUUID()
          : (data.store?.public_token ?? crypto.randomUUID()),
      },
    });
  }
  await rpc("reposita_save_public_store", {
    p_name: name,
    p_enabled: enabled,
    p_rotate: rotate,
  });
  return loadDemand(false);
}
export async function submitDemoDemand(input: DemandInput, id: string) {
  if (!readDemandDemo().store?.enabled) throw new Error("Página desativada.");
  await saveDemand(true, input, id);
  const data = readDemandDemo();
  return persist({
    ...data,
    demands: data.demands.map((d) =>
      d.id === id ? { ...d, source: "public" } : d,
    ),
  });
}
