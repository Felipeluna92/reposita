import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ClipboardList,
  FlaskConical,
  MessageCircle,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { Dialog } from "../components/Dialog";
import { money } from "../lib/finance";
import { downloadCsv } from "../lib/csv";
import type { InventoryData } from "../types";
import type {
  Demand,
  DemandStatus,
  PurchaseInput,
  PurchaseTest,
} from "./types";
import {
  opportunities,
  reasons,
  statuses,
  testResult,
  purchaseScenarios,
  whatsappLink,
} from "./logic";
import { DemandFields, blankDemand } from "./DemandFields";
import { PurchaseForm } from "./PurchaseForm";
import { StoreSharing } from "./StoreSharing";
import type { useDemand } from "./useDemand";
type View = "demand" | "opportunities" | "purchase_tests";
type Model = ReturnType<typeof useDemand>;
const testLabels = {
  planned: "Planejado",
  purchased: "Em observação",
  completed: "Concluído",
  canceled: "Cancelado",
};
export function DemandWorkspace({
  view,
  model,
  inventory,
  demo,
  name,
  createProduct,
  reloadInventory,
  go,
}: {
  view: View;
  model: Model;
  inventory: InventoryData;
  demo: boolean;
  name: string;
  createProduct: () => void;
  reloadInventory: () => Promise<void>;
  go: (v: View) => void;
}) {
  const [form, setForm] = useState<Demand | "new" | null>(null),
    [plan, setPlan] = useState<Partial<PurchaseInput> | null>(null),
    [sharing, setSharing] = useState(false);
  const [filter, setFilter] = useState(""),
    [status, setStatus] = useState("open"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{
      test: PurchaseTest;
      action: "purchase" | "complete" | "cancel";
    } | null>(null),
    [outcome, setOutcome] = useState("");
  const groups = useMemo(() => opportunities(model.demands), [model.demands]);
  const products = inventory.products.filter((p) => p.active);
  async function act(fn: () => Promise<unknown>, message: string) {
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  const shown = model.demands.filter(
    (d) =>
      (status === "all" ||
        (status === "open"
          ? !["closed", "ignored"].includes(d.status)
          : d.status === status)) &&
      (d.label + " " + d.variant + " " + d.note)
        .toLocaleLowerCase("pt-BR")
        .includes(filter.toLocaleLowerCase("pt-BR")),
  );
  if (model.loading)
    return (
      <section className="panel loading" role="status">
        Organizando procura e compras…
      </section>
    );
  if (model.error)
    return (
      <section className="panel" role="alert">
        <span className="eyebrow">ATUALIZAÇÃO DO BANCO</span>
        <h2>Ative seu radar de procura</h2>
        <p>{model.error}</p>
        <p>
          Aplique somente o arquivo{" "}
          <a
            href="https://github.com/Felipeluna92/reposita/blob/main/supabase/migrations/202610170003_demand.sql"
            target="_blank"
            rel="noreferrer"
          >
            202610170003_demand.sql
          </a>{" "}
          no SQL Editor do seu Supabase. A atualização preserva produtos, fotos
          e movimentações.
        </p>
        <button className="secondary" onClick={() => void model.reload()}>
          Já apliquei · tentar novamente
        </button>
      </section>
    );
  return (
    <div className="demand-space">
      <section className="demand-hero panel">
        <div>
          <span className="eyebrow">DA PROCURA À PRÓXIMA COMPRA</span>
          <h2>
            {view === "demand"
              ? "Toda procura merece ser lembrada."
              : view === "opportunities"
                ? "Escute antes de abastecer."
                : "Compre pequeno. Aprenda com o resultado."}
          </h2>
          <p>
            {view === "demand"
              ? "Anote o que faltou, receba pedidos pelo link da loja e organize os retornos."
              : view === "opportunities"
                ? "Veja sinais de interesse reunidos por produto. Mais registros ajudam a investigar uma compra, sem garantir vendas."
                : "Compare hipóteses de fornecedores e acompanhe as vendas reais durante um período definido."}
          </p>
        </div>
        <div className="demand-orbit" aria-hidden="true">
          {view === "demand" ? (
            <MessageCircle />
          ) : view === "opportunities" ? (
            <ClipboardList />
          ) : (
            <FlaskConical />
          )}
        </div>
      </section>
      <div className="demand-toolbar">
        <div className="segmented" aria-label="Etapas da procura">
          {(
            [
              ["demand", "Procura"],
              ["opportunities", "Oportunidades"],
              ["purchase_tests", "Testes de compra"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              className={view === id ? "selected" : ""}
              onClick={() => go(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => setSharing(true)}>
            <Share2 size={16} />
            Link da loja
          </button>
          <button
            className="primary"
            disabled={model.busy}
            onClick={() =>
              view === "purchase_tests" ? setPlan({}) : setForm("new")
            }
          >
            <Plus size={16} />
            {view === "purchase_tests"
              ? "Comparar compra"
              : "Registrar procura"}
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {view === "demand" && (
        <>
          <div className="filter-bar">
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Buscar procura"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Produto, modelo ou observação"
              />
            </label>
            <label>
              Situação
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="open">Em aberto</option>
                <option value="all">Todas</option>
                {Object.entries(statuses).map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              disabled={!shown.length}
              onClick={() =>
                downloadCsv("reposita-procura.csv", [
                  [
                    "Produto",
                    "Modelo",
                    "Motivo",
                    "Quantidade desejada",
                    "Preço esperado",
                    "Status",
                    "Origem",
                    "Data",
                  ],
                  ...shown.map((d) => [
                    d.label,
                    d.variant,
                    reasons[d.reason],
                    d.quantity,
                    d.budget ?? "",
                    statuses[d.status],
                    d.source,
                    new Date(d.created_at).toLocaleString("pt-BR"),
                  ]),
                ])
              }
            >
              Exportar CSV
            </button>
          </div>
          <p className="muted">
            {shown.length} registros exibidos · um registro pode conter várias
            unidades; não representa um cliente único.
          </p>
          <div className="demand-cards">
            {shown.map((d) => {
              const link = d.contact_consent
                ? whatsappLink(d.contact, d.label)
                : null;
              return (
                <article className="panel demand-card" key={d.id}>
                  <div className="section-heading">
                    <span className="tag">
                      {d.source === "public" ? "Link da loja" : "Atendimento"}
                    </span>
                    <small>
                      {new Date(d.created_at).toLocaleDateString("pt-BR")}
                    </small>
                  </div>
                  <h3>{d.label}</h3>
                  {d.variant && <p>{d.variant}</p>}
                  <p>{reasons[d.reason]}</p>
                  <div className="demand-facts">
                    <b>{d.quantity} un. desejadas</b>
                    <span>
                      {d.budget === null
                        ? "Preço não informado"
                        : money(d.budget) + "/un. esperado"}
                    </span>
                  </div>
                  {d.note && <p className="request-note">{d.note}</p>}
                  {!!d.custom_answers?.length && (
                    <dl className="request-note">
                      {d.custom_answers.map((a) => (
                        <div key={a.id}>
                          <dt>{a.label || "Resposta adicional"}</dt>
                          <dd>{a.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <label>
                    Situação
                    <select
                      aria-label={"Situação de " + d.label}
                      disabled={model.busy}
                      value={d.status}
                      onChange={(e) =>
                        void act(
                          () =>
                            model.action(d.id, e.target.value as DemandStatus),
                          "Situação atualizada.",
                        )
                      }
                    >
                      {Object.entries(statuses).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {d.contact && (
                    <div className="contact-box">
                      <span>{d.contact}</span>
                      <small>
                        Retorno autorizado sobre este pedido ·{" "}
                        {d.consent_at
                          ? new Date(d.consent_at).toLocaleDateString("pt-BR")
                          : ""}
                      </small>
                      {link && (
                        <a
                          className="secondary"
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir WhatsApp <ArrowUpRight size={14} />
                        </a>
                      )}
                      <button
                        className="text-button"
                        disabled={model.busy}
                        onClick={() =>
                          void act(
                            () => model.action(d.id, "forget_contact"),
                            "Contato excluído. O interesse sem contato foi preservado.",
                          )
                        }
                      >
                        <Trash2 size={13} />
                        Excluir contato
                      </button>
                    </div>
                  )}
                  <button
                    className="text-button"
                    disabled={model.busy}
                    onClick={() => setForm(d)}
                  >
                    Editar registro <ArrowUpRight size={14} />
                  </button>
                </article>
              );
            })}
          </div>
          {!shown.length && (
            <Empty
              title="Ainda há espaço para ouvir."
              text={
                model.demands.length
                  ? "Nenhum registro corresponde aos filtros."
                  : "Registre uma procura no atendimento ou compartilhe o link da sua loja."
              }
              action={() => setForm("new")}
              label="Registrar primeira procura"
            />
          )}
        </>
      )}
      {view === "opportunities" && (
        <>
          <div className="mini-metrics panel">
            <div>
              <small>Grupos em aberto</small>
              <strong>{groups.length}</strong>
            </div>
            <div>
              <small>Registros de procura</small>
              <strong>
                {groups.reduce((n, g) => n + g.records.length, 0)}
              </strong>
            </div>
            <div>
              <small>Unidades desejadas</small>
              <strong>{groups.reduce((n, g) => n + g.units, 0)}</strong>
            </div>
          </div>
          <p className="muted">
            Ordenação: quantidade de registros, depois atividade mais recente.
            Grafias e variantes diferentes podem formar grupos separados; edite
            o vínculo com o catálogo para reuni-los.
          </p>
          <div className="demand-cards">
            {groups.map((g) => {
              const p = inventory.products.find((p) => p.id === g.product_id);
              return (
                <article className="panel demand-card" key={g.key}>
                  <span className="eyebrow">SINAL DE INTERESSE</span>
                  <h3>{g.label}</h3>
                  {g.variant && <p>{g.variant}</p>}
                  <div className="opportunity-number">
                    {g.records.length}
                    <small> registros em aberto</small>
                  </div>
                  <p>
                    {g.units} unidades desejadas · {g.contacts} contatos
                    autorizados
                  </p>
                  <p>
                    {p
                      ? `${p.name}: saldo atual ${p.stock} un.`
                      : "Produto ainda sem vínculo no catálogo."}
                  </p>
                  <p>
                    {g.budget === null
                      ? "Preço esperado ainda não informado."
                      : `Preço esperado médio informado: ${money(g.budget)}/un. Não é preço validado.`}
                  </p>
                  <div className="reason-chips">
                    {[...new Set(g.records.map((d) => d.reason))].map((r) => (
                      <span className="badge" key={r}>
                        {reasons[r]}
                      </span>
                    ))}
                  </div>
                  <small>
                    O interesse pode mudar. Confirme especificações e condições
                    antes de comprar.
                  </small>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (!products.length) {
                        createProduct();
                        return;
                      }
                      setPlan({
                        demand_key: g.key,
                        ...(p?.active
                          ? {
                              product_id: p.id,
                              unit_cost: p.cost,
                              sale_price: p.price,
                            }
                          : {}),
                        title: "Oferta · " + g.label,
                      });
                    }}
                  >
                    Comparar uma compra <ArrowUpRight size={15} />
                  </button>
                </article>
              );
            })}
          </div>
          {!groups.length && (
            <Empty
              title="Seu próximo produto começa com uma pergunta."
              text="As procuras em aberto formarão grupos aqui. Registre o que falta para seus clientes."
              action={() => go("demand")}
              label="Ver procura"
            />
          )}
        </>
      )}
      {view === "purchase_tests" && (
        <>
          <p className="muted">
            Planos não alteram o estoque. Ao confirmar uma compra, o lote entra
            uma única vez e seu custo médio é atualizado com o frete rateado.
          </p>
          <div className="demand-cards">
            {model.tests.map((t) => {
              const scenario = purchaseScenarios(t);
              const observed = testResult(t, inventory);
              const p = inventory.products.find((p) => p.id === t.product_id);
              return (
                <article className="panel demand-card" key={t.id}>
                  <span className="tag">{testLabels[t.status]}</span>
                  <h3>{t.title}</h3>
                  <p>
                    {p?.name ?? "Produto"} · lote de {t.quantity} un.
                  </p>
                  <div className="demand-facts">
                    <b>{money(scenario.investment)} de investimento</b>
                    <span>
                      {money(scenario.contribution)}/un. de contribuição
                      planejada
                    </span>
                  </div>
                  <p>
                    Meta informada: {t.expected_units} un. em {t.days} dias ·
                    preço planejado {money(t.sale_price)}
                  </p>
                  <small>
                    Custo unitário {money(t.unit_cost)} · frete{" "}
                    {money(t.freight)} · embalagem {money(t.packaging)}/un. ·
                    taxas e impostos {t.fee + t.tax}%
                  </small>
                  {t.note && <p className="request-note">{t.note}</p>}
                  {(t.status === "purchased" || t.status === "completed") && (
                    <div className="observed-result">
                      <strong>
                        {observed.units} unidades vendidas no período
                      </strong>
                      <span>
                        {money(observed.revenue)} em vendas ·{" "}
                        {money(observed.gross)} de lucro bruto registrado
                      </span>
                      <small>
                        Janela iniciada em{" "}
                        {new Date(t.started_at!).toLocaleDateString("pt-BR")},
                        limitada a {t.days} dias ou ao encerramento. Inclui
                        todas as vendas deste produto, mesmo de saldo anterior;
                        não identifica o lote nem prova o efeito da compra.
                        Lucro bruto usa custos de cada venda, antes de taxas e
                        despesas.
                      </small>
                    </div>
                  )}
                  {t.outcome_note && <p>Aprendizado: {t.outcome_note}</p>}
                  <div className="actions">
                    {t.status === "planned" && (
                      <>
                        <button
                          className="primary"
                          disabled={model.busy}
                          onClick={() => {
                            setOutcome("");
                            setConfirm({ test: t, action: "purchase" });
                          }}
                        >
                          Registrar compra do lote
                        </button>
                        <button
                          className="text-button"
                          disabled={model.busy}
                          onClick={() => {
                            setOutcome("");
                            setConfirm({ test: t, action: "cancel" });
                          }}
                        >
                          Cancelar plano
                        </button>
                      </>
                    )}
                    {t.status === "purchased" && (
                      <button
                        className="secondary"
                        disabled={model.busy}
                        onClick={() => {
                          setOutcome("");
                          setConfirm({ test: t, action: "complete" });
                        }}
                      >
                        Concluir e registrar aprendizado
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!model.tests.length && (
            <Empty
              title="Uma compra com propósito."
              text="Comece comparando as condições de um fornecedor. Você decide quando registrar a compra de verdade."
              label="Comparar primeira compra"
              action={() => setPlan({})}
            />
          )}
        </>
      )}
      {sharing && (
        <StoreSharing
          demo={demo}
          model={model}
          name={name}
          close={() => setSharing(false)}
        />
      )}
      {form && (
        <DemandEditor
          record={form}
          products={products}
          save={model.save}
          close={() => setForm(null)}
        />
      )}
      {plan &&
        (products.length ? (
          <PurchaseForm
            products={products}
            initial={plan}
            save={model.saveTest}
            close={() => setPlan(null)}
          />
        ) : (
          <Dialog
            title="Primeiro, vincule um produto"
            close={() => setPlan(null)}
          >
            <p>
              Cadastre o produto para acompanhar custo, saldo e vendas. Se ainda
              não comprou, use estoque inicial zero.
            </p>
            <button
              className="primary"
              onClick={() => {
                setPlan(null);
                createProduct();
              }}
            >
              Cadastrar produto
            </button>
          </Dialog>
        ))}
      {confirm && (
        <Dialog
          title={
            confirm.action === "purchase"
              ? "Confirmar compra e entrada no estoque?"
              : confirm.action === "complete"
                ? "O que você aprendeu?"
                : "Cancelar este plano?"
          }
          close={() => setConfirm(null)}
          busy={model.busy}
        >
          <p>
            <strong>{confirm.test.title}</strong>
            {confirm.action === "purchase"
              ? ` adicionará ${confirm.test.quantity} unidades por ${money(purchaseScenarios(confirm.test).investment)} ao custo. Confirme somente se a compra aconteceu. O preço do catálogo será preservado.`
              : confirm.action === "complete"
                ? " terá suas premissas e vendas do período preservadas."
                : " será encerrado sem alterar o estoque."}
          </p>
          {confirm.action !== "purchase" && (
            <label>
              Aprendizado / motivo (opcional)
              <textarea
                maxLength={500}
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            disabled={model.busy}
            className="primary"
            onClick={() =>
              void act(
                async () => {
                  await model.testAction(
                    confirm.test.id,
                    confirm.action,
                    outcome,
                  );
                  if (confirm.action === "purchase") await reloadInventory();
                  setConfirm(null);
                },
                confirm.action === "purchase"
                  ? "Compra registrada. Saldo e custo atualizados."
                  : "Plano atualizado.",
              )
            }
          >
            {model.busy
              ? "Salvando…"
              : confirm.action === "purchase"
                ? "Confirmar compra realizada"
                : "Confirmar"}
          </button>
        </Dialog>
      )}
    </div>
  );
}
function Empty({
  title,
  text,
  label,
  action,
}: {
  title: string;
  text: string;
  label: string;
  action: () => void;
}) {
  return (
    <section className="panel demand-empty">
      <ClipboardList size={35} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="secondary" onClick={action}>
        {label}
      </button>
    </section>
  );
}
function DemandEditor({
  record,
  products,
  close,
  save,
}: {
  record: Demand | "new";
  products: InventoryData["products"];
  close: () => void;
  save: Model["save"];
}) {
  const [id] = useState(() =>
      record === "new" ? crypto.randomUUID() : record.id,
    ),
    [value, setValue] = useState(
      record === "new" ? { ...blankDemand } : record,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title={record === "new" ? "Registrar procura" : "Editar procura"}
      close={close}
      busy={busy}
    >
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
        <label>
          Vincular ao catálogo (opcional)
          <select
            value={value.product_id ?? ""}
            onChange={(e) => {
              const p = products.find((p) => p.id === e.target.value);
              setValue({
                ...value,
                product_id: p?.id ?? null,
                ...(p ? { label: p.name } : {}),
              });
            }}
          >
            <option value="">Produto ainda fora do catálogo</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <DemandFields value={value} onChange={setValue} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar procura"}
        </button>
      </form>
    </Dialog>
  );
}
