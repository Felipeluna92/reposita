import { useState } from "react";
import { Dialog } from "../components/Dialog";
import { money } from "../lib/finance";
import type { Product } from "../types";
import type { PurchaseInput } from "./types";
import { purchaseScenarios } from "./logic";
export function PurchaseForm({
  products,
  initial,
  close,
  save,
}: {
  products: Product[];
  initial: Partial<PurchaseInput>;
  close: () => void;
  save: (v: PurchaseInput, id: string) => Promise<void>;
}) {
  const first =
    products.find((p) => p.id === initial.product_id) ?? products[0];
  const [id] = useState(() => crypto.randomUUID());
  const [value, setValue] = useState<PurchaseInput>({
    product_id: first?.id ?? "",
    demand_key: "",
    title: "",
    quantity: 10,
    unit_cost: first?.cost ?? 0,
    freight: 0,
    packaging: 0,
    sale_price: first?.price ?? 0,
    fee: 0,
    tax: 0,
    expected_units: 5,
    days: 30,
    note: "",
    ...initial,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  let result: ReturnType<typeof purchaseScenarios> | null = null;
  try {
    result = purchaseScenarios(value);
  } catch {
    /* Show full validation when saving. */
  }
  const fields = [
    ["quantity", "Unidades do lote", 1, 10000, 1],
    ["unit_cost", "Custo por unidade, R$", 0, 10000000, 0.01],
    ["freight", "Frete total do lote, R$", 0, 10000000, 0.01],
    ["packaging", "Embalagem por venda, R$", 0, 10000000, 0.01],
    ["sale_price", "Preço de venda planejado, R$", 0.01, 10000000, 0.01],
    ["fee", "Taxas de venda, %", 0, 99.99, 0.01],
    ["tax", "Impostos estimados, %", 0, 99.99, 0.01],
    ["expected_units", "Unidades que espera vender", 0, 100000, 1],
    ["days", "Período de observação, dias", 1, 365, 1],
  ] as const;
  return (
    <Dialog title="Comparar uma compra" close={close} busy={busy}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await save(value, id);
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Simule ofertas de fornecedores salvando um plano para cada oferta.
          Salvar o plano ainda não altera o estoque.
        </p>
        <label>
          Produto do catálogo
          <select
            required
            value={value.product_id}
            onChange={(e) => {
              const p = products.find((p) => p.id === e.target.value)!;
              setValue({
                ...value,
                product_id: p.id,
                unit_cost: p.cost,
                sale_price: p.price,
              });
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · saldo {p.stock}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nome da oferta / fornecedor
          <input
            required
            maxLength={160}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
        </label>
        <div className="form-grid">
          {fields.map(([key, label, min, max, step]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                required
                min={min}
                max={max}
                step={step}
                value={Number.isNaN(value[key]) ? "" : value[key]}
                onChange={(e) =>
                  setValue({ ...value, [key]: e.target.valueAsNumber })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Premissas e condições (opcional)
          <textarea
            maxLength={500}
            value={value.note}
            onChange={(e) => setValue({ ...value, note: e.target.value })}
          />
        </label>
        {result && (
          <section className="scenario-preview" aria-label="Cenários da compra">
            <div className="mini-metrics">
              <div>
                <small>Investimento inicial</small>
                <strong>{money(result.investment)}</strong>
              </div>
              <div>
                <small>Contribuição por venda</small>
                <strong>{money(result.contribution)}</strong>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <caption>
                  Hipóteses para {value.days} dias · nenhum cenário é uma
                  previsão
                </caption>
                <thead>
                  <tr>
                    <th>Cenário</th>
                    <th>Vendas</th>
                    <th>Saldo em caixa*</th>
                    <th>Sobra</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td>{s.units}</td>
                      <td>{money(s.cashAfterPurchase)}</td>
                      <td>{s.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>
              *Recebimentos menos lote completo, frete, taxas, impostos e
              embalagens. Supõe pagamento e recebimento à vista; não inclui
              despesas fixas. Estoque restante não é prejuízo realizado.
            </small>
            {result.contribution <= 0 && (
              <p className="error">
                O preço informado não cobre os custos variáveis deste cenário.
              </p>
            )}
          </section>
        )}
        <p className="muted">
          O preço planejado não muda automaticamente o preço do catálogo. As
          vendas continuam usando os valores informados em cada movimentação.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !products.length}>
          {busy ? "Salvando…" : "Salvar plano de compra"}
        </button>
      </form>
    </Dialog>
  );
}
