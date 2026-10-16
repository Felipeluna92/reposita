import { useState } from "react";
import { money, pricing, type PricingInput } from "../lib/finance";
const fields: [keyof PricingInput, string, string][] = [
  ["cost", "Compra por unidade", "R$"],
  ["freight", "Frete rateado por unidade", "R$"],
  ["packaging", "Embalagem por unidade", "R$"],
  ["other", "Outros custos por unidade", "R$"],
  ["fee", "Taxas de venda", "%"],
  ["tax", "Impostos sobre a venda", "%"],
  ["target", "Margem de contribuição desejada", "%"],
  ["price", "Preço de venda para simular", "R$"],
  ["quantity", "Unidades vendidas no período", "un."],
  ["fixed", "Despesas fixas do período", "R$"],
];
export function Calculator() {
  const [input, setInput] = useState<PricingInput>({
    cost: 0,
    freight: 0,
    packaging: 0,
    other: 0,
    fee: 0,
    tax: 0,
    target: 30,
    price: 0,
    quantity: 1,
    fixed: 0,
  });
  let result: ReturnType<typeof pricing> | undefined;
  let error = "";
  try {
    result = pricing(input);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div className="calculator-layout">
      <section className="panel">
        <h2>Quanto sua venda realmente deixa?</h2>
        <p>
          Informe custos por unidade. Taxas e impostos incidem sobre o preço de
          venda.
        </p>
        <div className="form-grid">
          {fields.map(([key, label, unit]) => (
            <label key={key}>
              {label} <small>({unit})</small>
              <input
                type="number"
                min="0"
                step={key === "quantity" ? "1" : "0.01"}
                value={input[key]}
                onChange={(e) =>
                  setInput({
                    ...input,
                    [key]: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="fine-print">
          Simulação gerencial, não apuração contábil. Informe as taxas e
          tributos aplicáveis ao seu negócio; nada é presumido.
        </p>
      </section>
      <section className="panel calculation" aria-live="polite">
        <span className="eyebrow">SEU CENÁRIO</span>
        <h2>
          Preço com intenção.
          <br />
          Lucro com clareza.
        </h2>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          result && (
            <>
              <div className="featured-value">
                <span>Preço sugerido</span>
                <strong>{money(result.suggested)}</strong>
                <small>Para margem de contribuição de {input.target}%</small>
              </div>
              <dl>
                {[
                  ["Custo variável por unidade", money(result.unitCost)],
                  ["Preço mínimo sem despesas fixas", money(result.floor)],
                  ["Contribuição por unidade", money(result.contribution)],
                  [
                    "Margem no preço simulado",
                    result.margin === null
                      ? "Defina um preço"
                      : result.margin.toFixed(1) + "%",
                  ],
                  ["Resultado após despesas fixas", money(result.result)],
                  [
                    "Ponto de equilíbrio no período",
                    result.breakEven === null
                      ? "Sem contribuição positiva"
                      : result.breakEven + " unidades",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="fine-print">
                Preço sugerido = custo variável ÷ (1 − taxas − impostos − margem
                desejada). O preço mínimo não cobre despesas fixas.
              </p>
            </>
          )
        )}
      </section>
    </div>
  );
}
