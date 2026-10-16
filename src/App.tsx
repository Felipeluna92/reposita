import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownUp,
  ArrowUpRight,
  Calculator as CalculatorIcon,
  Download,
  LayoutDashboard,
  LogOut,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Archive,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { Auth } from "./components/Auth";
import { Calculator } from "./components/Calculator";
import { ProductForm, MovementForm } from "./components/ProductForms";
import { Dialog } from "./components/Dialog";
import { useInventory } from "./hooks/useInventory";
import { margin, money } from "./lib/finance";
import { csvCell, isEntry, kindLabels } from "./lib/inventory";
import type { Product } from "./types";
const tabs = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "products", label: "Produtos", icon: Package },
  { id: "movements", label: "Movimentações", icon: ArrowDownUp },
  { id: "calculator", label: "Calculadora", icon: CalculatorIcon },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;
type Tab = (typeof tabs)[number]["id"];
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const [error, setError] = useState("");
  const [recover, setRecover] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        setSession(data.session);
        setReady(true);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setReady(true);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecover(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (!ready)
    return (
      <main className="loading" role="status">
        Preparando seu espaço…
      </main>
    );
  return (
    <>
      {error && (
        <div className="error global-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      )}
      {demo || session ? (
        <Workspace
          key={demo ? "demo" : session!.user.id}
          demo={demo}
          email={session?.user.email}
          exit={async () => {
            if (demo) {
              setDemo(false);
              return;
            }
            const { error } = await supabase!.auth.signOut();
            if (error) setError(error.message);
          }}
        />
      ) : (
        <Auth demo={() => setDemo(true)} />
      )}
      {recover && <PasswordRecovery close={() => setRecover(false)} />}
    </>
  );
}
function PasswordRecovery({ close }: { close: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Defina uma nova senha" close={close} busy={busy}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const { error } = await supabase!.auth.updateUser({ password });
            if (error) throw error;
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nova senha
          <input
            required
            autoFocus
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="primary">
          {busy ? "Salvando…" : "Salvar nova senha"}
        </button>
      </form>
    </Dialog>
  );
}
function Workspace({
  demo,
  email,
  exit,
}: {
  demo: boolean;
  email?: string;
  exit: () => Promise<void>;
}) {
  const inventory = useInventory(demo);
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [productForm, setProductForm] = useState<Product | "new" | null>(null);
  const [movementForm, setMovementForm] = useState(false);
  const [archive, setArchive] = useState<Product | null>(null);
  const [actionError, setActionError] = useState("");
  const active = inventory.products.filter((p) => p.active);
  const low = active.filter((p) => p.stock <= p.min_stock);
  const filtered = active.filter(
    (p) =>
      (p.name + " " + p.sku)
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")) &&
      (!category || p.category === category) &&
      (!lowOnly || p.stock <= p.min_stock),
  );
  const costValue = active.reduce((a, p) => a + p.stock * p.cost, 0);
  const saleValue = active.reduce((a, p) => a + p.stock * p.price, 0);
  const sales = inventory.movements.filter((m) => m.kind === "sale");
  const gross = sales.reduce(
    (a, m) => a + m.quantity * (m.unit_price - m.unit_cost),
    0,
  );
  function exportCsv() {
    const rows = [
      [
        "Produto",
        "SKU",
        "Categoria",
        "Estoque",
        "Estoque mínimo",
        "Custo unitário",
        "Preço de venda",
        "Margem bruta %",
      ],
      ...filtered.map((p) => [
        p.name,
        p.sku,
        p.category,
        p.stock,
        p.min_stock,
        p.cost.toFixed(2).replace(".", ","),
        p.price.toFixed(2).replace(".", ","),
        margin(p.cost, p.price)?.toFixed(2).replace(".", ",") ?? "",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `reposita-produtos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const title = tabs.find((t) => t.id === tab)!.label;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setTab("overview")}>
          <b>r.</b>
          <span>reposita</span>
        </a>
        <span className="sidebar-caption">SEU NEGÓCIO</span>
        <nav aria-label="Menu principal">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              title={label}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="side-tip">
          <ShieldCheck size={24} />
          <strong>
            Controle hoje.
            <br />
            Cresça amanhã.
          </strong>
          <p>Um bom resultado começa com um estoque bem cuidado.</p>
        </div>
        <button
          className="account"
          onClick={() => {
            void exit();
          }}
        >
          <span className="avatar">
            {demo ? "D" : email?.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {demo ? "Demonstração" : email}
            <small>{demo ? "Somente neste navegador" : "Conta pessoal"}</small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <main className="workspace">
        <div className="topline">
          <span>
            Workspace <span>/</span> {title}
          </span>
          <span className="mode-badge">
            <i />
            {demo ? "Demo local" : "Supabase conectado"}
          </span>
        </div>
        <header className="page-header">
          <div>
            <span className="eyebrow">CLAREZA PARA DECIDIR</span>
            <h1>
              {tab === "overview" ? "Seu negócio, em perspectiva." : title}
            </h1>
            <p>
              {tab === "overview"
                ? "Enxergue seu estoque. Entenda seu potencial. Dê o próximo passo."
                : "Informações organizadas para você trabalhar melhor."}
            </p>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              title="Atualizar dados"
              aria-label="Atualizar dados"
              disabled={inventory.busy || inventory.loading}
              onClick={() => {
                void inventory.reload();
              }}
            >
              <RefreshCw size={18} />
            </button>
            <button
              className="primary"
              disabled={
                inventory.loading || !!inventory.error || inventory.busy
              }
              onClick={() => setProductForm("new")}
            >
              <Plus size={17} />
              Novo produto
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <strong>Você está no modo demonstração.</strong> Alterações ficam
              salvas apenas neste navegador, não no Supabase.
            </span>
            {!inventory.products.length && (
              <button
                disabled={inventory.loading}
                className="text-button"
                onClick={inventory.examples}
              >
                Carregar exemplos
              </button>
            )}
          </div>
        )}
        {inventory.error ? (
          <div className="panel error" role="alert">
            <h2>Não conseguimos carregar seus dados</h2>
            <p>{inventory.error}</p>
            <button
              className="secondary"
              onClick={() => {
                void inventory.reload();
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : inventory.loading ? (
          <section className="panel loading" role="status">
            Carregando produtos e movimentações…
          </section>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <section className="stats-grid">
                  <Stat
                    label="Estoque a custo"
                    value={money(costValue)}
                    hint={`${active.length} produtos ativos`}
                    icon={<Package />}
                  />
                  <Stat
                    label="Venda potencial"
                    value={money(saleValue)}
                    hint="Se todo o estoque for vendido"
                    icon={<ShoppingBag />}
                  />
                  <Stat
                    label="Lucro bruto potencial"
                    value={money(saleValue - costValue)}
                    hint="Antes de taxas e despesas"
                    icon={<ArrowUpRight />}
                  />
                  <Stat
                    label="Precisam de reposição"
                    value={String(low.length).padStart(2, "0")}
                    hint="No mínimo ou abaixo dele"
                    icon={<ArrowDownUp />}
                    warning={low.length > 0}
                  />
                </section>
                <div className="overview-grid">
                  <section className="panel opportunities">
                    <div className="section-heading">
                      <h2>Seu próximo movimento</h2>
                      <span className="tag">Reposição</span>
                    </div>
                    <p>
                      Priorize produtos com saldo no limite. Sugestão: repor até
                      duas vezes o mínimo configurado.
                    </p>
                    {low.length ? (
                      low.slice(0, 5).map((p) => (
                        <div className="reorder-row" key={p.id}>
                          <div className="product-mark">
                            {p.name.slice(0, 1)}
                          </div>
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {p.stock} em estoque · mínimo {p.min_stock}
                            </small>
                          </div>
                          <span className="badge warning">
                            +{Math.max(p.min_stock * 2 - p.stock, 1)} un.
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="empty-compact">
                        {active.length
                          ? "Nenhum produto abaixo do limite. Estoque em dia."
                          : "Adicione seu primeiro produto para começar."}
                      </div>
                    )}
                    <button
                      className="text-button"
                      onClick={() => {
                        setTab("products");
                        setLowOnly(true);
                      }}
                    >
                      Ver produtos para repor <ArrowUpRight size={15} />
                    </button>
                  </section>
                  <section className="panel dark-panel">
                    <span className="eyebrow">PRECIFICAÇÃO INTELIGENTE</span>
                    <CalculatorIcon size={36} />
                    <h2>
                      O preço certo não
                      <br />
                      nasce do palpite.
                    </h2>
                    <p>
                      Simule custos, taxas e margem antes de colocar seu próximo
                      produto à venda.
                    </p>
                    <button
                      className="mint-button"
                      onClick={() => setTab("calculator")}
                    >
                      Calcular meu preço <ArrowUpRight size={17} />
                    </button>
                  </section>
                </div>
                <section className="panel summary-strip">
                  <div>
                    <small>Vendas registradas · todo o histórico</small>
                    <strong>
                      {money(
                        sales.reduce(
                          (a, m) => a + m.quantity * m.unit_price,
                          0,
                        ),
                      )}
                    </strong>
                  </div>
                  <div>
                    <small>Lucro bruto dessas vendas</small>
                    <strong>{money(gross)}</strong>
                  </div>
                  <p>
                    Baseado nas saídas do tipo venda e no custo informado em
                    cada movimentação. Não representa lucro líquido.
                  </p>
                </section>
              </>
            )}
            {tab === "products" && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Seu catálogo</h2>
                    <p>{filtered.length} produtos encontrados</p>
                  </div>
                  <button
                    className="secondary"
                    disabled={!filtered.length}
                    onClick={exportCsv}
                  >
                    <Download size={16} />
                    Exportar CSV
                  </button>
                </div>
                <div className="filters">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Buscar por nome ou SKU"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar por nome ou SKU…"
                    />
                  </label>
                  <select
                    aria-label="Filtrar categoria"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Todas as categorias</option>
                    {[...new Set(active.map((p) => p.category))]
                      .sort()
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={lowOnly}
                      onChange={(e) => setLowOnly(e.target.checked)}
                    />
                    Somente reposição
                  </label>
                </div>
                {!filtered.length ? (
                  <div className="empty">
                    <Package size={30} />
                    <h3>Nenhum produto por aqui</h3>
                    <p>Adicione um produto ou ajuste seus filtros.</p>
                    <button
                      className="primary"
                      onClick={() => setProductForm("new")}
                    >
                      Adicionar produto
                    </button>
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
                          <th>Margem bruta</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.name}</strong>
                              <small>{p.sku || "Sem SKU"}</small>
                            </td>
                            <td>
                              <span className="tag">{p.category}</span>
                            </td>
                            <td>
                              <span
                                className={
                                  p.stock <= p.min_stock ? "warning-text" : ""
                                }
                              >
                                {p.stock} / {p.min_stock} un.
                              </span>
                            </td>
                            <td>{money(p.cost)}</td>
                            <td>{money(p.price)}</td>
                            <td>
                              {margin(p.cost, p.price)?.toFixed(1) ?? "—"}
                              {p.price > 0 && "%"}
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  aria-label={`Editar ${p.name}`}
                                  onClick={() => setProductForm(p)}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Arquivar ${p.name}`}
                                  onClick={() => {
                                    setArchive(p);
                                    setActionError("");
                                  }}
                                >
                                  <Archive size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {tab === "movements" && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Entradas e saídas</h2>
                    <p>
                      Histórico preservado, inclusive de produtos arquivados.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={!active.length || inventory.busy}
                    onClick={() => setMovementForm(true)}
                  >
                    <Plus size={17} />
                    Registrar
                  </button>
                </div>
                {!inventory.movements.length ? (
                  <div className="empty">
                    <ArrowDownUp size={30} />
                    <h3>Ainda não há movimentações</h3>
                    <p>
                      Cadastre um produto e registre uma compra, venda ou
                      ajuste.
                    </p>
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
                        {inventory.movements.map((m) => (
                          <tr key={m.id}>
                            <td>
                              {new Date(m.created_at).toLocaleString("pt-BR")}
                            </td>
                            <td>
                              {inventory.products.find(
                                (p) => p.id === m.product_id,
                              )?.name ?? "Produto arquivado"}
                            </td>
                            <td>{kindLabels[m.kind]}</td>
                            <td
                              className={isEntry(m.kind) ? "positive-text" : ""}
                            >
                              {isEntry(m.kind) ? "+" : "−"}
                              {m.quantity}
                            </td>
                            <td>{money(m.unit_cost)}</td>
                            <td>
                              {m.kind === "sale" ? money(m.unit_price) : "—"}
                            </td>
                            <td>{m.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {tab === "calculator" && <Calculator />}
            {tab === "settings" && (
              <section className="panel settings-panel">
                <span className="eyebrow">CONEXÃO E SEGURANÇA</span>
                <h2>O lugar dos seus dados</h2>
                <dl>
                  <div>
                    <dt>Modo atual</dt>
                    <dd>{demo ? "Demonstração local" : "Conta Supabase"}</dd>
                  </div>
                  <div>
                    <dt>Autenticação configurada</dt>
                    <dd>{supabase ? "Sim" : "Não"}</dd>
                  </div>
                  <div>
                    <dt>Armazenamento</dt>
                    <dd>
                      {demo
                        ? "localStorage deste navegador"
                        : "Postgres com Row Level Security"}
                    </dd>
                  </div>
                </dl>
                <h3>Conectar o Supabase</h3>
                <ol>
                  <li>
                    Execute a migration SQL do repositório no SQL Editor do seu
                    projeto Supabase.
                  </li>
                  <li>
                    Na Vercel, configure <code>VITE_SUPABASE_URL</code> e{" "}
                    <code>VITE_SUPABASE_ANON_KEY</code>.
                  </li>
                  <li>
                    Ative o login por e-mail no Supabase e configure a URL do
                    site e de redirecionamento.
                  </li>
                  <li>
                    Faça um novo deploy e crie sua conta. Dados de demonstração
                    não migram automaticamente.
                  </li>
                </ol>
                <p className="notice">
                  Use somente a chave pública anon/publishable. Nunca coloque a
                  chave secreta service_role no navegador ou neste repositório.
                </p>
                <a
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                  href="https://github.com/Felipeluna92/reposita#readme"
                >
                  Abrir instruções completas no GitHub ↗
                </a>
              </section>
            )}
          </>
        )}
        <footer>
          Reposita <span>•</span> Clareza no estoque. Confiança nas decisões.
        </footer>
      </main>
      {productForm && (
        <ProductForm
          product={productForm === "new" ? undefined : productForm}
          close={() => setProductForm(null)}
          save={inventory.save}
        />
      )}
      {movementForm && (
        <MovementForm
          products={active}
          close={() => setMovementForm(false)}
          save={inventory.move}
        />
      )}
      {archive && (
        <Dialog
          title="Arquivar produto?"
          close={() => setArchive(null)}
          busy={inventory.busy}
        >
          <p>
            <strong>{archive.name}</strong> sairá do catálogo ativo. Seu
            histórico continuará disponível. É necessário saldo zero: primeiro
            registre uma saída, se apropriado, com justificativa.
          </p>
          {actionError && (
            <p role="alert" className="error">
              {actionError}
            </p>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={inventory.busy}
              onClick={() => setArchive(null)}
            >
              Cancelar
            </button>
            <button
              className="primary"
              disabled={inventory.busy}
              onClick={async () => {
                try {
                  await inventory.archive(archive.id);
                  setArchive(null);
                } catch (e) {
                  setActionError((e as Error).message);
                }
              }}
            >
              Arquivar
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  hint,
  icon,
  warning,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <article className={`stat ${warning ? "stat-warning" : ""}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
