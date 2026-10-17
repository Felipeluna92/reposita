import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownUp,
  ArrowUpRight,
  BarChart3,
  Bell,
  Calculator as CalculatorIcon,
  CheckCircle2,
  Download,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sun,
  X,
  MessageCircle,
  Radar,
  FlaskConical,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { Auth } from "./components/Auth";
import { Calculator } from "./components/Calculator";
import { ProductForm, MovementForm } from "./components/ProductForms";
import { Dialog } from "./components/Dialog";
import { Catalog } from "./components/Catalog";
import { Reports } from "./components/Reports";
import { Movements } from "./components/Movements";
import { SettingsPanel } from "./components/SettingsPanel";
import { ImportDialog } from "./components/ImportDialog";
import { ProductImage } from "./components/ProductImage";
import { useInventory } from "./hooks/useInventory";
import { money } from "./lib/finance";
import { reorder, summarize } from "./lib/reports";
import { downloadCsv } from "./lib/csv";
import { clearImageCache } from "./lib/images";
import type { MovementKind, Product } from "./types";
import { useDemand } from "./demand/useDemand";
import { DemandWorkspace } from "./demand/DemandWorkspace";
import { PublicDemand } from "./demand/PublicDemand";
import "./demand/demand.css";
const tabs = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "products", label: "Produtos", icon: Package },
  { id: "movements", label: "Movimentações", icon: ArrowDownUp },
  { id: "reports", label: "Relatórios", icon: BarChart3 },
  { id: "demand", label: "Procura dos clientes", icon: MessageCircle },
  { id: "opportunities", label: "Oportunidades", icon: Radar },
  { id: "purchase_tests", label: "Testes de compra", icon: FlaskConical },
  { id: "calculator", label: "Calculadora", icon: CalculatorIcon },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;
type Tab = (typeof tabs)[number]["id"];
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
export class AppBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not emit user data to third-party logs. */
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <div className="panel">
          <h1>Vamos recuperar seu espaço.</h1>
          <p>
            O aplicativo encontrou um erro inesperado. Seus dados no Supabase
            não foram apagados.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Recarregar aplicativo
          </button>
        </div>
      </main>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const token = new URLSearchParams(window.location.search).get("procura");
  return token ? <PublicDemand token={token} /> : <PrivateApp />;
}
function PrivateApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(!supabase);
  const [error, setError] = useState("");
  const [recover, setRecover] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    preference("reposita.theme", "light") === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("reposita.theme", theme);
    } catch {
      /* Only a preference. */
    }
  }, [theme]);
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
      if (event === "SIGNED_OUT") clearImageCache();
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
          userId={demo ? "demo" : session!.user.id}
          theme={theme}
          setTheme={setTheme}
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
  userId,
  theme,
  setTheme,
  exit,
}: {
  demo: boolean;
  email?: string;
  userId: string;
  theme: "light" | "dark";
  setTheme: (value: "light" | "dark") => void;
  exit: () => Promise<void>;
}) {
  const inventory = useInventory(demo);
  const demand = useDemand(demo);
  const [tab, setTab] = useState<Tab>("overview");
  const [lowFilter, setLowFilter] = useState(false);
  const [productForm, setProductForm] = useState<Product | "new" | null>(null);
  const [movementForm, setMovementForm] = useState<{
    product?: string;
    kind?: MovementKind;
  } | null>(null);
  const [archive, setArchive] = useState<Product | null>(null);
  const [actionError, setActionError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [upgraded, setUpgraded] = useState<boolean | null>(demo ? true : null);
  const [name, setName] = useState(() =>
    preference("reposita.business." + userId, "Meu negócio"),
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (demo || !supabase) return;
    let alive = true;
    supabase
      .from("reposita_products")
      .select("image_path")
      .limit(1)
      .then(({ error }) => {
        if (alive) setUpgraded(!error);
      });
    return () => {
      alive = false;
    };
  }, [demo, inventory.loading]);
  const active = inventory.products.filter((p) => p.active);
  const low = active.filter((p) => reorder(p) > 0);
  const costValue = active.reduce((a, p) => a + p.stock * p.cost, 0);
  const saleValue = active.reduce((a, p) => a + p.stock * p.price, 0);
  const priced = active.filter((p) => p.price > 0);
  const missingPrice = active.filter((p) => p.price <= 0 && p.stock > 0).length;
  const potentialProfit = priced.reduce(
    (a, p) => a + p.stock * (p.price - p.cost),
    0,
  );
  const report = summarize(inventory, "", "");
  const title = tabs.find((t) => t.id === tab)!.label;
  function goProducts(lowOnly = false) {
    setLowFilter(lowOnly);
    setTab("products");
  }
  function exportReorder() {
    downloadCsv("reposita-lista-de-compras.csv", [
      [
        "Produto",
        "SKU",
        "Fornecedor",
        "Saldo",
        "Mínimo",
        "Quantidade sugerida",
        "Custo estimado",
      ],
      ...low.map((p) => [
        p.name,
        p.sku,
        p.supplier ?? "",
        p.stock,
        p.min_stock,
        reorder(p),
        (reorder(p) * p.cost).toFixed(2).replace(".", ","),
      ]),
    ]);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setTab("overview")}>
          <b>r.</b>
          <span>
            reposita<small>BUSINESS WORKSPACE</small>
          </span>
        </a>
        <span className="sidebar-caption">ORGANIZE. ENTENDA. CRESÇA.</span>
        <nav aria-label="Menu principal">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                if (id === "products") setLowFilter(false);
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "products" && low.length > 0 && (
                <i className="nav-count">{low.length}</i>
              )}
            </button>
          ))}
        </nav>
        <div className="side-tip">
          <ShieldCheck size={24} />
          <strong>
            Seu próximo nível
            <br />
            começa no controle.
          </strong>
          <p>
            Estoque, preço e resultado.
            <br />
            Tudo no lugar certo.
          </p>
          <span className="version-label">REPOSITA · PROFESSIONAL</span>
        </div>
        <button
          className="account"
          title="Sair"
          onClick={() => {
            void exit();
          }}
        >
          <span className="avatar">
            {demo ? "D" : email?.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {demo ? "Demonstração" : email}
            <small>
              {demo ? "Somente neste navegador" : "Conta protegida"}
            </small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <main className="workspace" id="main-content">
        <div className="topline">
          <span>
            {name}
            <span>/</span>
            {title}
          </span>
          <div className="topline-actions">
            <button
              className="icon-button"
              aria-label={
                theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"
              }
              title="Trocar tema"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button
              className="icon-button notification-button"
              title={`${low.length} produtos para repor`}
              aria-label="Ver alertas de reposição"
              onClick={() => goProducts(true)}
            >
              <Bell size={17} />
              {low.length > 0 && <i />}
            </button>
            <span className="mode-badge">
              <i />
              {demo
                ? "Demo local"
                : inventory.error
                  ? "Verificar conexão"
                  : "Conta conectada"}
            </span>
          </div>
        </div>
        <header className="page-header">
          <div>
            <span className="eyebrow">
              {tab === "overview"
                ? "VISÃO CLARA. DECISÕES MELHORES."
                : "SEU NEGÓCIO, BEM ORGANIZADO."}
            </span>
            <h1>
              {tab === "overview"
                ? "Mais controle. Mais possibilidades."
                : title}
            </h1>
            <p>
              {tab === "overview"
                ? "O essencial do seu negócio, com a clareza que ele merece."
                : "Uma operação mais simples, do primeiro produto ao próximo crescimento."}
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
                void demand.reload();
              }}
            >
              <RefreshCw
                size={18}
                className={inventory.loading ? "spin" : ""}
              />
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
              <strong>Seu ambiente de demonstração.</strong> Produtos e fotos
              ficam somente neste navegador.
            </span>
            {!inventory.products.length && (
              <button
                className="text-button"
                disabled={inventory.loading}
                onClick={inventory.examples}
              >
                Carregar exemplos
              </button>
            )}
          </div>
        )}
        {!demo && upgraded === false && !inventory.error && (
          <div className="upgrade-banner">
            <div>
              <strong>Tem novidade no seu Reposita.</strong>
              <span>
                Ative fotos privadas, campos avançados e importação aplicando a
                atualização SQL — sem apagar seus dados.
              </span>
            </div>
            <button className="secondary" onClick={() => setTab("settings")}>
              Ver instruções <ArrowUpRight size={15} />
            </button>
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
            <div className="loader" />
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
                    value={
                      missingPrice && saleValue === 0
                        ? "Defina os preços"
                        : money(saleValue)
                    }
                    hint={
                      missingPrice
                        ? `Parcial · ${missingPrice} produtos com saldo sem preço`
                        : "Se todo o saldo for vendido"
                    }
                    icon={<ShoppingBag />}
                  />
                  <Stat
                    label="Lucro bruto potencial"
                    value={
                      missingPrice && priced.every((p) => p.stock === 0)
                        ? "Preço pendente"
                        : money(potentialProfit)
                    }
                    hint={
                      missingPrice
                        ? "Parcial · somente itens com preço definido"
                        : "Antes de taxas e despesas"
                    }
                    icon={<ArrowUpRight />}
                  />
                  <Stat
                    label="Alertas de reposição"
                    value={String(low.length).padStart(2, "0")}
                    hint="No mínimo ou abaixo dele"
                    icon={<ArrowDownUp />}
                    warning={low.length > 0}
                  />
                </section>
                <section className="panel demand-overview">
                  <div>
                    <span className="eyebrow">SEU RADAR DE PROCURA</span>
                    <h2>O próximo produto pode estar na conversa de hoje.</h2>
                    <p>
                      Registre o que seus clientes pedem e transforme interesse
                      em compras mais conscientes.
                    </p>
                  </div>
                  <button className="primary" onClick={() => setTab("demand")}>
                    Abrir procura dos clientes <ArrowUpRight size={17} />
                  </button>
                </section>
                <div className="overview-grid">
                  <section className="panel opportunities">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">SEU PRÓXIMO MOVIMENTO</span>
                        <h2>O que merece atenção agora?</h2>
                      </div>
                      <span className="tag">Reposição</span>
                    </div>
                    <p>
                      Priorize o que está no limite. Quantidade sugerida: saldo
                      até duas vezes o mínimo.
                    </p>
                    {low.length ? (
                      low.slice(0, 5).map((p) => (
                        <div className="reorder-row" key={p.id}>
                          <ProductImage path={p.image_path} name={p.name} />
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {p.stock} em estoque · mínimo {p.min_stock}
                            </small>
                          </div>
                          <span className="badge warning">
                            +{reorder(p)} un.
                          </span>
                          <button
                            className="icon-button"
                            title="Registrar compra"
                            aria-label={`Comprar ${p.name}`}
                            onClick={() =>
                              setMovementForm({
                                product: p.id,
                                kind: "purchase",
                              })
                            }
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-compact">
                        <CheckCircle2 size={26} />
                        <span>
                          {active.length
                            ? "Tudo em dia por aqui. Nenhum produto abaixo do limite."
                            : "Seu novo começo está aqui. Cadastre o primeiro produto."}
                        </span>
                      </div>
                    )}
                    <div className="section-bottom">
                      <button
                        className="text-button"
                        onClick={() => goProducts(true)}
                      >
                        Ver itens para repor <ArrowUpRight size={15} />
                      </button>
                      <button
                        className="text-button"
                        disabled={!low.length}
                        onClick={exportReorder}
                      >
                        <Download size={14} />
                        Lista de compras
                      </button>
                    </div>
                  </section>
                  <section className="panel dark-panel">
                    <span className="eyebrow">DÊ VALOR AO SEU RESULTADO</span>
                    <div className="calc-3d">
                      <CalculatorIcon size={35} />
                    </div>
                    <h2>
                      Um preço bem pensado.
                      <br />
                      Um negócio mais forte.
                    </h2>
                    <p>
                      Frete, taxas, despesas e margem. Descubra quanto sua venda
                      realmente deixa.
                    </p>
                    <button
                      className="mint-button"
                      onClick={() => setTab("calculator")}
                    >
                      Encontrar meu preço <ArrowUpRight size={17} />
                    </button>
                  </section>
                </div>
                <section className="panel summary-strip">
                  <div>
                    <small>Vendas registradas · todo o histórico</small>
                    <strong>{money(report.revenue)}</strong>
                  </div>
                  <div>
                    <small>Lucro bruto dessas vendas</small>
                    <strong>{money(report.profit)}</strong>
                  </div>
                  <div>
                    <small>Unidades vendidas</small>
                    <strong>{report.units}</strong>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setTab("reports")}
                  >
                    Explorar relatórios <ArrowUpRight size={16} />
                  </button>
                </section>
                <div className="quick-actions">
                  <button onClick={() => goProducts()}>
                    <Package size={21} />
                    <span>
                      <strong>Organize seu catálogo</strong>
                      <small>Fotos, preços e informações completas</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                  <button
                    disabled={!active.length}
                    onClick={() => setMovementForm({})}
                  >
                    <ArrowDownUp size={21} />
                    <span>
                      <strong>Registre uma movimentação</strong>
                      <small>Compra, venda ou ajuste de saldo</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </>
            )}
            {tab === "products" && (
              <Catalog
                key={String(lowFilter)}
                data={inventory}
                initialLow={lowFilter}
                edit={setProductForm}
                create={() => setProductForm("new")}
                archive={(p) => {
                  setArchive(p);
                  setActionError("");
                }}
                restore={async (p) => {
                  try {
                    await inventory.restore(p.id);
                    setToast("Produto restaurado.");
                  } catch (e) {
                    setActionError((e as Error).message);
                  }
                }}
                sale={(p) => setMovementForm({ product: p.id, kind: "sale" })}
                importCsv={() => setImportOpen(true)}
                busy={inventory.busy}
              />
            )}
            {(tab === "demand" ||
              tab === "opportunities" ||
              tab === "purchase_tests") && (
              <DemandWorkspace
                view={tab}
                model={demand}
                inventory={inventory}
                demo={demo}
                name={name}
                createProduct={() => setProductForm("new")}
                reloadInventory={inventory.reload}
                go={setTab}
              />
            )}
            {tab === "movements" && (
              <Movements
                data={inventory}
                create={() => setMovementForm({})}
                busy={inventory.busy}
              />
            )}
            {tab === "reports" && <Reports data={inventory} />}
            {tab === "calculator" && <Calculator />}
            {tab === "settings" && (
              <SettingsPanel
                demo={demo}
                email={email}
                name={name}
                setName={(value) => {
                  setName(value);
                  try {
                    localStorage.setItem("reposita.business." + userId, value);
                  } catch {
                    setToast(
                      "Nome alterado, mas não foi possível salvar a preferência local.",
                    );
                  }
                }}
                theme={theme}
                setTheme={setTheme}
                data={inventory}
                upgraded={upgraded}
                demand={
                  demand.error || demand.loading
                    ? undefined
                    : {
                        demands: demand.demands,
                        tests: demand.tests,
                        store: demand.store,
                      }
                }
              />
            )}
          </>
        )}
        {actionError && !archive && (
          <p role="alert" className="error">
            {actionError}
            <button className="text-button" onClick={() => setActionError("")}>
              Fechar
            </button>
          </p>
        )}
        <footer>
          <span className="footer-brand">reposita</span>
          <span>•</span>Clareza no estoque. Confiança nas decisões.
          <span className="footer-version">v0.5</span>
        </footer>
      </main>
      {productForm && (
        <ProductForm
          demo={demo}
          product={productForm === "new" ? undefined : productForm}
          close={() => setProductForm(null)}
          save={async (input, id) => {
            await inventory.save(input, id);
            setToast("Produto salvo com sucesso.");
          }}
        />
      )}
      {movementForm && (
        <MovementForm
          products={active}
          initialProduct={movementForm.product}
          initialKind={movementForm.kind}
          close={() => setMovementForm(null)}
          save={async (movement) => {
            await inventory.move(movement);
            setToast("Movimentação registrada. Saldo atualizado.");
          }}
        />
      )}
      {importOpen && (
        <ImportDialog
          products={inventory.products}
          close={() => setImportOpen(false)}
          save={async (items, request) => {
            await inventory.importItems(items, request);
            setToast(`${items.length} produtos importados.`);
          }}
        />
      )}
      {archive && (
        <Dialog
          title="Arquivar produto?"
          close={() => setArchive(null)}
          busy={inventory.busy}
        >
          <p>
            <strong>{archive.name}</strong> sairá do catálogo ativo, mas o
            histórico será preservado. O saldo precisa estar zerado antes de
            arquivar. Você poderá restaurá-lo depois.
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
                  setToast("Produto arquivado. Histórico preservado.");
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
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button aria-label="Fechar notificação" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
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
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <article className={`stat ${warning ? "stat-warning" : ""}`}>
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>
        <i />
        {hint}
      </small>
    </article>
  );
}
