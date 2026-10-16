import { useState } from "react";
import { ArrowDownUp, Download, Plus, Search } from "lucide-react";
import type { InventoryData } from "../types";
import { money } from "../lib/finance";
import { isEntry, kindLabels } from "../lib/inventory";
import { inPeriod } from "../lib/reports";
import { downloadCsv } from "../lib/csv";
export function Movements({
  data,
  create,
  busy,
}: {
  data: InventoryData;
  create: () => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const products = new Map(data.products.map((p) => [p.id, p]));
  const filtered = data.movements.filter(
    (m) =>
      (!kind || m.kind === kind) &&
      inPeriod(m, start, end) &&
      ((products.get(m.product_id)?.name ?? "") + " " + m.note)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const current = Math.min(page, pages);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Cada movimento, um registro.</h2>
          <p>
            {filtered.length} eventos encontrados. O histórico não é apagado ao
            arquivar produtos.
          </p>
        </div>
        <div className="toolbar">
          <button
            className="secondary"
            disabled={!filtered.length}
            onClick={() =>
              downloadCsv("reposita-movimentacoes.csv", [
                [
                  "Data",
                  "Produto",
                  "Tipo",
                  "Quantidade",
                  "Custo unitário",
                  "Preço vendido",
                  "Observação",
                ],
                ...filtered.map((m) => [
                  new Date(m.created_at).toLocaleString("pt-BR"),
                  products.get(m.product_id)?.name ?? "",
                  kindLabels[m.kind],
                  m.quantity,
                  m.unit_cost.toFixed(2).replace(".", ","),
                  m.kind === "sale"
                    ? m.unit_price.toFixed(2).replace(".", ",")
                    : "",
                  m.note,
                ]),
              ])
            }
          >
            <Download size={15} />
            Exportar
          </button>
          <button
            className="primary"
            disabled={busy || !data.products.some((p) => p.active)}
            onClick={create}
          >
            <Plus size={16} />
            Registrar
          </button>
        </div>
      </div>
      <div className="filters movement-filters">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar movimentações"
            placeholder="Produto ou observação…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label="Tipo de movimentação"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(kindLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <label>
          De
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {!filtered.length ? (
        <div className="empty">
          <ArrowDownUp size={32} />
          <h3>Nenhuma movimentação encontrada</h3>
          <p>Registre sua primeira compra ou venda, ou ajuste os filtros.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Produto</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Custo un.</th>
                <th>Venda un.</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice((current - 1) * 30, current * 30).map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                  <td>
                    {products.get(m.product_id)?.name ?? "Produto arquivado"}
                  </td>
                  <td>
                    <span
                      className={`badge ${isEntry(m.kind) ? "" : "warning"}`}
                    >
                      {kindLabels[m.kind]}
                    </span>
                  </td>
                  <td className={isEntry(m.kind) ? "positive-text" : ""}>
                    {isEntry(m.kind) ? "+" : "−"}
                    {m.quantity}
                  </td>
                  <td>{money(m.unit_cost)}</td>
                  <td>{m.kind === "sale" ? money(m.unit_price) : "—"}</td>
                  <td className="note-cell">{m.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="pagination">
          <span>
            Página {current} de {pages}
          </span>
          <div>
            <button
              className="secondary"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Anterior
            </button>
            <button
              className="secondary"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
