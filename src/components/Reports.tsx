import { useState } from "react";
import { Download, ChartColumn, ShoppingCart } from "lucide-react";
import type { InventoryData } from "../types";
import { dateKey, idleProducts, summarize } from "../lib/reports";
import { money } from "../lib/finance";
import { downloadCsv } from "../lib/csv";
export function Reports({ data }: { data: InventoryData }) {
  const today = new Date();
  const [start, setStart] = useState(
    dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [end, setEnd] = useState(dateKey(today));
  const report = summarize(data, start, end);
  const idle = idleProducts(data);
  const invalid = !!(start && end && start > end);
  const max = Math.max(1, ...report.daily.map((d) => d.revenue));
  return (
    <>
      <section className="panel report-filters">
        <div>
          <span className="eyebrow">NÚMEROS REAIS, DECISÕES MELHORES</span>
          <h2>O resultado do seu período</h2>
        </div>
        <label>
          De
          <input
            aria-label="Início do relatório"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            aria-label="Fim do relatório"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={invalid}
          onClick={() =>
            downloadCsv(`reposita-relatorio-${start}-${end}.csv`, [
              ["Produto", "Unidades", "Receita", "Lucro bruto"],
              ...report.ranking.map((p) => [
                p.name,
                p.units,
                p.revenue.toFixed(2).replace(".", ","),
                p.profit.toFixed(2).replace(".", ","),
              ]),
            ])
          }
        >
          <Download size={16} />
          Exportar
        </button>
      </section>
      {invalid ? (
        <p role="alert" className="error">
          A data inicial não pode ser posterior à final.
        </p>
      ) : (
        <>
          <section className="stats-grid">
            <ReportStat
              label="Receita registrada"
              value={money(report.revenue)}
            />
            <ReportStat label="Lucro bruto" value={money(report.profit)} />
            <ReportStat
              label="Margem bruta"
              value={
                report.margin === null ? "—" : report.margin.toFixed(1) + "%"
              }
            />
            <ReportStat
              label="Compras no período"
              value={money(report.purchase)}
            />
          </section>
          <div className="overview-grid">
            <section className="panel">
              <div className="section-heading">
                <h2>Vendas por dia</h2>
                <ChartColumn size={20} />
              </div>
              <p className="fine-print">
                Receita, antes de taxas e despesas. Valores por dia com venda
                registrada.
              </p>
              {!report.daily.length ? (
                <div className="empty-compact">
                  Ainda não há vendas neste período.
                </div>
              ) : (
                <div className="bar-chart" aria-label="Receita por dia">
                  {report.daily.map((d) => (
                    <div key={d.date} className="chart-row">
                      <span>
                        {d.date.slice(8)}/{d.date.slice(5, 7)}
                      </span>
                      <div>
                        <i
                          style={{
                            width: `${Math.max((d.revenue / max) * 100, 0)}%`,
                          }}
                        />
                      </div>
                      <strong>{money(d.revenue)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <h2>Mais vendidos por receita</h2>
              {!report.ranking.length ? (
                <div className="empty-compact">
                  Registre vendas para visualizar o ranking.
                </div>
              ) : (
                report.ranking.slice(0, 6).map((p, i) => (
                  <div className="ranking-row" key={p.id}>
                    <span className="rank-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {p.units} unidades · lucro bruto {money(p.profit)}
                      </small>
                    </div>
                    <b>{money(p.revenue)}</b>
                  </div>
                ))
              )}
            </section>
          </div>
        </>
      )}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Capital sem giro recente</h2>
            <p>
              Produtos com saldo e sem venda há mais de 30 dias, considerando o
              histórico registrado.
            </p>
          </div>
          <ShoppingCart size={23} />
        </div>
        {!idle.length ? (
          <div className="empty-compact">
            Nenhum produto nesta condição com os dados atuais.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Saldo</th>
                  <th>Capital a custo</th>
                </tr>
              </thead>
              <tbody>
                {idle.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.stock} un.</td>
                    <td>{money(p.stock * p.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="fine-print">
          Lucro bruto = preço vendido − custo informado na movimentação. Não
          considera taxas, impostos ou despesas fixas. Sem vendas registradas
          não é possível medir demanda real.
        </p>
      </section>
    </>
  );
}
function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat">
      <div>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>Período selecionado</small>
    </article>
  );
}
