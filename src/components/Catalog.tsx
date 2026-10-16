import { useState } from "react";
import {
  Archive,
  Download,
  Eye,
  Grid2X2,
  List,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Upload,
} from "lucide-react";
import type { InventoryData, Product } from "../types";
import { margin, money } from "../lib/finance";
import { csvHeaders, downloadCsv } from "../lib/csv";
import { ProductImage } from "./ProductImage";
import { Dialog } from "./Dialog";
import { isEntry, kindLabels } from "../lib/inventory";
type Props = {
  data: InventoryData;
  initialLow?: boolean;
  edit: (p: Product) => void;
  create: () => void;
  archive: (p: Product) => void;
  restore: (p: Product) => void;
  sale: (p: Product) => void;
  importCsv: () => void;
  busy: boolean;
};
export function Catalog({
  data,
  initialLow = false,
  edit,
  create,
  archive,
  restore,
  sale,
  importCsv,
  busy,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [low, setLow] = useState(initialLow);
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState("name");
  const [grid, setGrid] = useState(true);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Product | null>(null);
  const needle = query.toLocaleLowerCase("pt-BR");
  const filtered = data.products
    .filter(
      (p) =>
        p.active !== archived &&
        (!low || p.stock <= p.min_stock) &&
        (!category || p.category === category) &&
        [p.name, p.sku, p.barcode, p.supplier, p.location].some((v) =>
          v?.toLocaleLowerCase("pt-BR").includes(needle),
        ),
    )
    .sort((a, b) =>
      sort === "stock"
        ? a.stock - b.stock
        : sort === "price"
          ? b.price - a.price
          : sort === "margin"
            ? (margin(b.cost, b.price) ?? -Infinity) -
              (margin(a.cost, a.price) ?? -Infinity)
            : a.name.localeCompare(b.name, "pt-BR"),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 12));
  const current = Math.min(page, totalPages);
  const shown = filtered.slice((current - 1) * 12, current * 12);
  const exportCsv = () =>
    downloadCsv("reposita-catalogo.csv", [
      csvHeaders,
      ...filtered.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.stock,
        p.min_stock,
        p.cost.toFixed(2).replace(".", ","),
        p.price.toFixed(2).replace(".", ","),
        p.barcode ?? "",
        p.supplier ?? "",
        p.location ?? "",
        p.description ?? "",
      ]),
    ]);
  const actions = (p: Product) => (
    <div className="row-actions">
      <button
        className="icon-button"
        title="Ver detalhes"
        aria-label={`Ver ${p.name}`}
        onClick={() => setDetail(p)}
      >
        <Eye size={16} />
      </button>
      {p.active ? (
        <>
          <button
            className="icon-button"
            title="Editar"
            aria-label={`Editar ${p.name}`}
            onClick={() => edit(p)}
          >
            <Pencil size={16} />
          </button>
          <button
            className="icon-button"
            title="Registrar venda"
            aria-label={`Vender ${p.name}`}
            disabled={busy || p.stock === 0}
            onClick={() => sale(p)}
          >
            <ShoppingBag size={16} />
          </button>
          <button
            className="icon-button"
            title="Arquivar"
            aria-label={`Arquivar ${p.name}`}
            disabled={busy}
            onClick={() => archive(p)}
          >
            <Archive size={16} />
          </button>
        </>
      ) : (
        <button
          className="icon-button"
          title="Restaurar"
          aria-label={`Restaurar ${p.name}`}
          disabled={busy}
          onClick={() => restore(p)}
        >
          <RotateCcw size={16} />
        </button>
      )}
    </div>
  );
  return (
    <>
      <section className="panel catalog-panel">
        <div className="section-heading">
          <div>
            <h2>Um catálogo que trabalha por você</h2>
            <p>
              {filtered.length} produtos {archived ? "arquivados" : "ativos"} ·{" "}
              {money(filtered.reduce((a, p) => a + p.stock * p.cost, 0))} a
              custo
            </p>
          </div>
          <div className="toolbar">
            <button className="secondary" disabled={busy} onClick={importCsv}>
              <Upload size={15} />
              Importar
            </button>
            <button
              className="secondary"
              disabled={!filtered.length}
              onClick={exportCsv}
            >
              <Download size={15} />
              Exportar CSV
            </button>
          </div>
        </div>
        <div className="filters">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Buscar por nome ou SKU"
              placeholder="Nome, SKU, código, fornecedor…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filtrar categoria"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as categorias</option>
            {[...new Set(data.products.map((p) => p.category))]
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
          <select
            aria-label="Ordenar produtos"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Nome A–Z</option>
            <option value="stock">Menor estoque</option>
            <option value="price">Maior preço</option>
            <option value="margin">Maior margem</option>
          </select>
        </div>
        <div className="catalog-options">
          <div className="toolbar">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={low}
                onChange={(e) => {
                  setLow(e.target.checked);
                  setPage(1);
                }}
              />
              Somente reposição
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPage(1);
                }}
              />
              Arquivados
            </label>
          </div>
          <div className="view-toggle">
            <button
              aria-label="Visualizar cartões"
              aria-pressed={grid}
              onClick={() => setGrid(true)}
            >
              <Grid2X2 size={17} />
            </button>
            <button
              aria-label="Visualizar lista"
              aria-pressed={!grid}
              onClick={() => setGrid(false)}
            >
              <List size={17} />
            </button>
          </div>
        </div>
        {!shown.length ? (
          <div className="empty">
            <Package size={35} />
            <h3>Nenhum produto encontrado</h3>
            <p>Adicione seu primeiro item ou ajuste os filtros.</p>
            <button className="primary" onClick={create}>
              <Plus size={17} />
              Adicionar produto
            </button>
          </div>
        ) : grid ? (
          <div className="product-grid">
            {shown.map((p) => (
              <article className="product-card" key={p.id}>
                <button
                  className="product-cover"
                  aria-label={`Abrir detalhes de ${p.name}`}
                  onClick={() => setDetail(p)}
                >
                  <ProductImage
                    path={p.image_path}
                    name={p.name}
                    large
                    interactive={false}
                  />
                  {p.stock <= p.min_stock && p.active && (
                    <span className="cover-badge">
                      {p.stock === 0 ? "Esgotado" : "Repor estoque"}
                    </span>
                  )}
                </button>
                <div className="product-card-body">
                  <span className="category-label">{p.category}</span>
                  <h3>{p.name}</h3>
                  <p className="product-code">
                    {p.sku || "Sem SKU"}
                    {p.location && ` · ${p.location}`}
                  </p>
                  <div className="product-pricing">
                    <strong>{money(p.price)}</strong>
                    <span>
                      {margin(p.cost, p.price)?.toFixed(1) ?? "—"}
                      {p.price > 0 ? "% margem" : ""}
                    </span>
                  </div>
                  <div className="stock-meter">
                    <i
                      style={{
                        width: `${Math.min((p.stock / Math.max(p.min_stock * 2, 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="product-card-footer">
                    <span>
                      <b>{p.stock}</b> em estoque
                    </span>
                    {actions(p)}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produto / SKU</th>
                  <th>Categoria</th>
                  <th>Saldo / mínimo</th>
                  <th>Custo</th>
                  <th>Venda</th>
                  <th>Margem</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <ProductImage path={p.image_path} name={p.name} />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.sku || "Sem SKU"}</small>
                        </div>
                      </div>
                    </td>
                    <td>{p.category}</td>
                    <td
                      className={p.stock <= p.min_stock ? "warning-text" : ""}
                    >
                      {p.stock} / {p.min_stock}
                    </td>
                    <td>{money(p.cost)}</td>
                    <td>{money(p.price)}</td>
                    <td>
                      {margin(p.cost, p.price)?.toFixed(1) ?? "—"}
                      {p.price > 0 && "%"}
                    </td>
                    <td>{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="pagination">
            <span>
              {(current - 1) * 12 + 1}–{Math.min(current * 12, filtered.length)}{" "}
              de {filtered.length}
            </span>
            <div>
              <button
                disabled={current === 1}
                className="secondary"
                onClick={() => setPage(current - 1)}
              >
                Anterior
              </button>
              <span>
                {current} / {totalPages}
              </span>
              <button
                disabled={current === totalPages}
                className="secondary"
                onClick={() => setPage(current + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>
      {detail && (
        <Dialog title={detail.name} close={() => setDetail(null)}>
          <ProductImage path={detail.image_path} name={detail.name} large />
          <dl>
            {[
              ["Categoria", detail.category],
              ["SKU", detail.sku || "—"],
              ["Código de barras", detail.barcode || "—"],
              ["Fornecedor", detail.supplier || "—"],
              ["Localização", detail.location || "—"],
              ["Saldo", `${detail.stock} un.`],
              ["Custo", money(detail.cost)],
              ["Venda", money(detail.price)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {detail.description && (
            <p className="product-description">{detail.description}</p>
          )}
          <h3>Últimas movimentações</h3>
          <div className="detail-history">
            {data.movements
              .filter((m) => m.product_id === detail.id)
              .slice(0, 8)
              .map((m) => (
                <div key={m.id}>
                  <span>
                    {kindLabels[m.kind]}
                    <small>
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </small>
                  </span>
                  <strong>
                    {isEntry(m.kind) ? "+" : "−"}
                    {m.quantity}
                  </strong>
                </div>
              ))}
            {!data.movements.some((m) => m.product_id === detail.id) && (
              <p className="fine-print">Sem movimentações registradas.</p>
            )}
          </div>
          <div className="actions">
            <button className="secondary" onClick={() => setDetail(null)}>
              Fechar
            </button>
            {detail.active && (
              <button
                className="primary"
                onClick={() => {
                  setDetail(null);
                  edit(detail);
                }}
              >
                Editar produto
              </button>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
