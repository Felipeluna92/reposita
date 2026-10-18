import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "../components/Dialog";
import type {
  BillingAction,
  BillingActionInput,
  BillingActionResult,
  BillingPlan,
  BillingState,
} from "./types";
import "./billing.css";

export type BillingPanelProps = {
  state: BillingState | null;
  error: string;
  loading: boolean;
  busy: boolean;
  demo: boolean;
  userId: string;
  reload: () => Promise<void>;
  run: (
    action: BillingAction,
    input?: BillingActionInput,
  ) => Promise<BillingActionResult>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const configurationFailure =
  /missing[\s_-]*(?:config|migration)|PGRST20[025]|42P01/i;
const statuses: Record<string, string> = {
  trial: "Teste grátis",
  trialing: "Em período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  unpaid: "Pagamento não realizado",
  canceled: "Cancelada",
  cancelled: "Cancelada",
  expired: "Período encerrado",
  trial_expired: "Teste encerrado",
  incomplete: "Pagamento incompleto",
  incomplete_expired: "Pagamento expirado",
  paused: "Pausada",
  owner: "Administrador isento",
  exempt: "Isenta",
  none: "Sem assinatura",
};

function price(plan: BillingPlan) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(plan.amount_cents / 100);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : date.toLocaleDateString("pt-BR");
}

export function BillingPanel({
  state,
  error,
  loading,
  busy,
  demo,
  userId,
  reload,
  run,
}: BillingPanelProps) {
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [supportEmail, setSupportEmail] = useState(
    state?.settings.support_email ?? "",
  );
  const [confirmation, setConfirmation] = useState<
    BillingPlan | "enable" | "disable" | null
  >(null);
  const locked = useRef(false);
  const titleId = useId();
  const emailId = useId();
  const access = state?.access;
  const owner = access?.is_owner === true;
  const ownerExempt = owner && state?.settings.mode === "live";
  const admin = owner ? state?.admin : undefined;
  const disabled = busy || loading || working;
  const setupRequired = Boolean(
    state?.setup_required || state?.owner_setup_needed,
  );
  // Without an owner, the first setup is offered; an existing owner's tools stay private.
  const canSetup =
    !demo &&
    Boolean(
      state &&
        (owner ||
          state.owner_setup_needed ||
          (state.setup_required && !access)),
    );
  const missingConfig =
    configurationFailure.test(error) || configurationFailure.test(actionError);
  const configurationMessage =
    "Assinaturas aguardando configuração. Peça ao administrador para concluir a configuração e atualize os dados.";
  const needsConfiguration =
    !state || !state.configured || setupRequired || missingConfig;
  const plans = [...(state?.plans ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const currentPlan = plans.find((plan) => plan.code === access?.plan_code);
  const subscribed = Boolean(
    access?.plan_code &&
      !["trial", "owner", "exempt"].includes(access.plan_code),
  );
  const gatewayReady = Boolean(
    state?.stripe_ready &&
      (!admin || (admin.ready && admin.gateway_mode === state.settings.mode)),
  );
  const paymentsAvailable =
    !demo &&
    !ownerExempt &&
    !needsConfiguration &&
    gatewayReady &&
    Boolean(state?.settings.mode === "test" || state?.settings.enabled);
  const canEnable = Boolean(
    admin?.ready &&
      admin.has_webhook &&
      admin.prices_ready &&
      admin.gateway_mode === state?.settings.mode &&
      (state?.settings.mode === "test" ||
        (admin.charges_enabled && admin.test_verified)),
  );
  const used = Math.max(0, access?.used ?? 0);
  const limit = access?.product_limit;

  useEffect(() => {
    setSupportEmail(state?.settings.support_email ?? "");
  }, [state?.settings.support_email]);

  async function execute(task: () => Promise<void>) {
    if (demo || disabled || locked.current) return false;
    locked.current = true;
    setWorking(true);
    setNotice("");
    setActionError("");
    try {
      await task();
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir. Tente novamente.",
      );
      return false;
    } finally {
      locked.current = false;
      setWorking(false);
    }
  }

  async function perform(action: BillingAction, input?: BillingActionInput) {
    return execute(async () => {
      const result = await run(action, input);
      setNotice(
        result.notice ||
          (result.pending
            ? "Solicitação recebida. Aguarde a confirmação e sincronize o status."
            : "Solicitação concluída. Atualize os dados para consultar o status."),
      );
      if (result.url) window.location.assign(result.url);
    });
  }

  async function copyUpdate() {
    if (!canSetup || !setupRequired) return;
    await execute(async () => {
      if (!uuidPattern.test(userId)) {
        throw new Error(
          "Entre com uma conta válida para copiar a atualização de assinaturas.",
        );
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error(
          "A cópia não está disponível neste navegador. Abra o aplicativo em uma conexão segura.",
        );
      }
      const response = await fetch("/updates/billing.sql", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Não foi possível carregar a atualização de assinaturas.",
        );
      const sql = await response.text();
      if (!sql.startsWith("-- Reposita")) {
        throw new Error(
          "O arquivo de atualização não tem o cabeçalho esperado. Contate o administrador.",
        );
      }
      await navigator.clipboard.writeText(
        `${sql}\n\ninsert into public.reposita_billing_owners(user_id) values ('${userId}') on conflict do nothing;\n`,
      );
      setNotice(
        "Atualização copiada. Aplique uma vez no SQL Editor do Supabase e clique em Atualizar dados.",
      );
    });
  }

  async function confirmAction() {
    if (!confirmation) return;
    if (confirmation === "enable") {
      if (!owner || !canEnable || state?.settings.enabled) return;
      if (await perform("enable", { confirm: true })) setConfirmation(null);
      return;
    }
    if (confirmation === "disable") {
      if (!owner || !state?.settings.enabled) return;
      if (await perform("disable", { confirm: true })) setConfirmation(null);
      return;
    }
    if (
      !paymentsAvailable ||
      !subscribed ||
      !plans.some((plan) => plan.code === confirmation.code)
    )
      return;
    if (await perform("change", { plan: confirmation.code, confirm: true }))
      setConfirmation(null);
  }

  return (
    <div className="billing-root billing-panel" aria-busy={disabled}>
      <header className="billing-header">
        <div>
          <span className="billing-eyebrow">SUA CONTA, NO SEU RITMO</span>
          <h1>Plano e assinatura</h1>
          <p>Acompanhe seu limite e escolha espaço para o próximo passo.</p>
        </div>
        <button
          type="button"
          className="billing-button billing-button-secondary"
          disabled={disabled || demo}
          onClick={() =>
            void execute(async () => {
              await reload();
              setNotice("Dados atualizados.");
            })
          }
        >
          {loading ? "Carregando…" : "Atualizar dados"}
        </button>
      </header>

      {demo && (
        <div className="billing-message" role="note">
          <strong>Você está na demonstração.</strong> Pagamentos, configuração e
          consultas de rede estão desativados aqui. Para assinar ou gerenciar
          sua assinatura, entre com uma conta real.
        </div>
      )}
      {loading && <p role="status">Consultando assinatura e planos…</p>}
      {error && (
        <div className="billing-message billing-message-error" role="alert">
          {configurationFailure.test(error) ? configurationMessage : error}
        </div>
      )}
      {actionError && (
        <div className="billing-message billing-message-error" role="alert">
          {configurationFailure.test(actionError)
            ? configurationMessage
            : actionError}
        </div>
      )}
      <div className="billing-feedback" role="status" aria-live="polite">
        {notice}
      </div>

      {state && (
        <>
          <section className="billing-summary" aria-labelledby={titleId}>
            <div>
              <span className="billing-eyebrow">PLANO ATUAL</span>
              <h2 id={titleId}>
                {ownerExempt
                  ? "Owner · isento"
                  : currentPlan?.name ||
                    (access?.status === "trial" || access?.status === "trialing"
                      ? "Teste grátis"
                      : access?.plan_code || "Sua conta")}
              </h2>
              <p>
                {ownerExempt
                  ? "A conta do administrador é isenta no ambiente de dinheiro real."
                  : `Teste grátis de ${state.settings.trial_days} dias, com até ${state.settings.trial_products} produtos, sem cartão.`}
              </p>
            </div>
            <span className="billing-badge">
              {demo
                ? "Demonstração"
                : state.settings.mode === "test"
                  ? "Testes · sem dinheiro real"
                  : "Dinheiro real"}
            </span>
            {access ? (
              <>
                <dl className="billing-facts">
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {ownerExempt
                        ? "Isenta"
                        : statuses[access.status] || access.status}
                    </dd>
                  </div>
                  <div>
                    <dt>Produtos usados / limite</dt>
                    <dd>
                      {used.toLocaleString("pt-BR")} /{" "}
                      {ownerExempt || limit === null
                        ? "Sem limite"
                        : limit === undefined
                          ? "Não informado"
                          : limit.toLocaleString("pt-BR")}
                    </dd>
                  </div>
                  <div>
                    <dt>Acesso</dt>
                    <dd>{access.allowed ? "Liberado" : "Requer atenção"}</dd>
                  </div>
                  {access.trial_ends_at && (
                    <div>
                      <dt>Fim do teste grátis</dt>
                      <dd>{dateLabel(access.trial_ends_at)}</dd>
                    </div>
                  )}
                  {access.period_end && (
                    <div>
                      <dt>
                        {access.cancel_at_period_end
                          ? "Acesso até"
                          : "Fim do período atual"}
                      </dt>
                      <dd>{dateLabel(access.period_end)}</dd>
                    </div>
                  )}
                </dl>
                {!ownerExempt && typeof limit === "number" && limit > 0 && (
                  <progress
                    className="billing-progress"
                    max={limit}
                    value={Math.min(used, limit)}
                    aria-label={`${used} de ${limit} produtos usados`}
                  />
                )}
                {typeof limit === "number" && used > limit && !ownerExempt && (
                  <p>
                    Você está acima do limite. Seus dados são preservados;
                    ajuste o uso ou escolha um plano maior.
                  </p>
                )}
                {access.cancel_at_period_end && (
                  <p>Cancelamento agendado para o fim do período atual.</p>
                )}
              </>
            ) : (
              <p>
                Os detalhes de acesso desta conta ainda não estão disponíveis.
                Atualize os dados.
              </p>
            )}
            {owner && state.settings.mode === "test" && (
              <p>
                Como owner, você pode assinar neste ambiente para testar o
                fluxo.
              </p>
            )}
            {!demo && (
              <div className="billing-actions">
                <button
                  type="button"
                  className="billing-button billing-button-secondary"
                  disabled={
                    disabled ||
                    (!subscribed &&
                      !access?.has_customer &&
                      !(owner && state.settings.mode === "test")) ||
                    !state.stripe_ready ||
                    needsConfiguration
                  }
                  onClick={() => void perform("portal")}
                >
                  Atualizar cartão ou cancelar
                </button>
                <button
                  type="button"
                  className="billing-button billing-button-secondary"
                  disabled={
                    disabled || !state.stripe_ready || needsConfiguration
                  }
                  onClick={() => void perform("sync")}
                >
                  Sincronizar assinatura
                </button>
              </div>
            )}
          </section>

          {needsConfiguration && (
            <section className="billing-card">
              <h2>Configuração de assinaturas</h2>
              <p>
                {canSetup
                  ? "Conclua a preparação abaixo para disponibilizar as assinaturas."
                  : "O administrador precisa concluir a configuração das assinaturas. Depois, atualize os dados."}
              </p>
              {canSetup && setupRequired && (
                <>
                  <p>
                    Aplique a atualização uma única vez no SQL Editor do
                    Supabase e clique em Atualizar dados.
                  </p>
                  <button
                    type="button"
                    className="billing-button"
                    disabled={disabled}
                    onClick={() => void copyUpdate()}
                  >
                    Copiar atualização de assinaturas
                  </button>
                </>
              )}
            </section>
          )}

          <section
            className="billing-plans-section"
            aria-labelledby={`${titleId}-plans`}
          >
            <h2 id={`${titleId}-plans`}>Planos para seu negócio</h2>
            <p>
              Cobrança mensal recorrente no cartão. Cancele pelo portal da
              assinatura.
            </p>
            {state.settings.mode === "test" && (
              <p className="billing-message">
                Assinaturas de teste, sem dinheiro real. Use um cartão de teste
                do Stripe; este fluxo não ativa cobranças reais.
              </p>
            )}
            {!state.settings.enabled && (
              <p className="billing-message">
                {state.settings.mode === "test"
                  ? "O controle de assinaturas está desativado. Você ainda pode testar os pagamentos quando o gateway estiver preparado."
                  : "Novas assinaturas estão desativadas pelo administrador."}
              </p>
            )}
            {plans.length > 0 ? (
              <div className="billing-plans">
                {plans.map((plan) => {
                  const current = subscribed && plan.code === access?.plan_code;
                  return (
                    <article
                      className={`billing-card billing-plan${current ? " billing-plan-current" : ""}`}
                      key={plan.code}
                    >
                      <div className="billing-plan-heading">
                        <h3>{plan.name}</h3>
                        {current && (
                          <span className="billing-badge">Plano atual</span>
                        )}
                      </div>
                      <p className="billing-price">
                        <strong>{price(plan)}</strong>
                        <span>/mês</span>
                      </p>
                      <p>
                        Até{" "}
                        <strong>
                          {plan.product_limit.toLocaleString("pt-BR")} produtos
                        </strong>
                      </p>
                      <ul className="billing-benefits">
                        <li>Controle de estoque</li>
                        <li>Procura e oportunidades</li>
                        <li>Organização de compras</li>
                      </ul>
                      <button
                        type="button"
                        className="billing-button"
                        disabled={disabled || !paymentsAvailable || current}
                        aria-label={
                          current
                            ? `${plan.name}, plano atual`
                            : `${subscribed ? "Mudar para" : "Assinar"} ${plan.name}`
                        }
                        onClick={() => {
                          if (!paymentsAvailable || disabled) return;
                          if (subscribed) {
                            setActionError("");
                            setConfirmation(plan);
                          } else void perform("checkout", { plan: plan.code });
                        }}
                      >
                        {current
                          ? "Plano atual"
                          : ownerExempt
                            ? "Owner isento"
                            : demo
                              ? "Use uma conta real"
                              : subscribed
                                ? "Mudar plano"
                                : "Assinar plano"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="billing-message">
                Nenhum plano está disponível no momento. O administrador precisa
                preparar os planos antes de liberar assinaturas.
              </div>
            )}
          </section>

          {!demo && owner && (
            <section
              className="billing-card billing-admin"
              aria-labelledby={`${titleId}-admin`}
            >
              <span className="billing-eyebrow">ADMINISTRAÇÃO</span>
              <h2 id={`${titleId}-admin`}>Configurar cobranças</h2>
              <p>
                <strong>
                  {state.settings.mode === "test"
                    ? "Ambiente de testes: não movimenta dinheiro real."
                    : "Ambiente real: assinaturas geram cobranças de dinheiro real."}
                </strong>
              </p>
              <p>
                Assinaturas{" "}
                {state.settings.enabled ? "ativadas" : "desativadas"}. Preparar
                o Stripe não ativa as cobranças.
              </p>
              {admin ? (
                <>
                  <dl className="billing-checklist">
                    {(
                      [
                        ["Preparação concluída (ready)", admin.ready],
                        [
                          "Conta habilitada para cobrar (charges_enabled)",
                          admin.charges_enabled,
                        ],
                        ["Webhook configurado", admin.has_webhook],
                        ["Preços preparados", admin.prices_ready],
                        [
                          "Teste de pagamento validado (test_verified)",
                          admin.test_verified,
                        ],
                        [
                          "Ambiente do Stripe corresponde à configuração",
                          admin.gateway_mode === state.settings.mode,
                        ],
                      ] as const
                    ).map(([label, ready]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{ready ? "Pronto" : "Pendente"}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Ambiente do Stripe</dt>
                      <dd>
                        {admin.gateway_mode === "live"
                          ? "Dinheiro real"
                          : admin.gateway_mode === "test"
                            ? "Testes"
                            : "Não identificado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Último webhook</dt>
                      <dd>{dateLabel(admin.last_webhook_at)}</dd>
                    </div>
                  </dl>
                  <p>
                    Para ativar, conclua a preparação e confira preços, webhook
                    e ambiente. Para dinheiro real, habilite a conta para
                    cobranças e valide um pagamento de teste confirmado pelo
                    webhook.
                  </p>
                </>
              ) : (
                <p>
                  Os pré-requisitos administrativos ainda não estão disponíveis.
                  Atualize os dados antes de ativar.
                </p>
              )}
              <form
                className="billing-setup-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!setupRequired)
                    void perform("setup", {
                      support_email: supportEmail.trim(),
                    });
                }}
              >
                <label htmlFor={emailId}>E-mail público de suporte</label>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={160}
                  value={supportEmail}
                  disabled={disabled || setupRequired}
                  onChange={(event) => setSupportEmail(event.target.value)}
                  aria-describedby={`${emailId}-help`}
                />
                <p id={`${emailId}-help`}>
                  Este endereço será público para atendimento aos assinantes.
                </p>
                <div className="billing-actions">
                  <button
                    type="submit"
                    className="billing-button"
                    disabled={disabled || setupRequired}
                  >
                    Preparar Stripe
                  </button>
                  <button
                    type="button"
                    className="billing-button"
                    disabled={
                      disabled ||
                      !canEnable ||
                      setupRequired ||
                      state.settings.enabled
                    }
                    onClick={() => {
                      setActionError("");
                      setConfirmation("enable");
                    }}
                  >
                    Ativar assinaturas
                  </button>
                  <button
                    type="button"
                    className="billing-button billing-button-secondary"
                    disabled={disabled || !state.settings.enabled}
                    onClick={() => {
                      setActionError("");
                      setConfirmation("disable");
                    }}
                  >
                    Desativar assinaturas
                  </button>
                </div>
              </form>
            </section>
          )}

          {state.settings.support_email && (
            <p className="billing-support">
              Suporte: <span>{state.settings.support_email}</span>
            </p>
          )}
        </>
      )}

      {!state && !loading && (
        <section className="billing-card">
          <h2>
            {missingConfig
              ? "Configuração de assinaturas"
              : "Assinaturas indisponíveis"}
          </h2>
          <p>
            Não foi possível consultar a configuração. Peça ao administrador
            para verificar o serviço e use Atualizar dados para tentar
            novamente.
          </p>
        </section>
      )}

      {confirmation && !demo && (
        <Dialog
          title={
            confirmation === "enable"
              ? "Ativar assinaturas?"
              : confirmation === "disable"
                ? "Desativar assinaturas?"
                : "Confirmar mudança de plano"
          }
          close={() => {
            if (!disabled) setConfirmation(null);
          }}
          busy={disabled}
          className="billing-root billing-dialog"
        >
          {confirmation === "enable" ? (
            <>
              <p>
                {state?.settings.mode === "live"
                  ? "Você está ativando assinaturas com cobranças recorrentes de dinheiro real no cartão dos clientes."
                  : "Você está ativando assinaturas no ambiente de testes, sem movimentar dinheiro real."}
              </p>
              <p>
                Confirme que os pré-requisitos exibidos foram concluídos antes
                de continuar.
              </p>
            </>
          ) : confirmation === "disable" ? (
            <>
              <p>
                O controle de acesso por assinatura será pausado e o histórico
                será preservado.
              </p>
              <p>
                Isso não cancela assinaturas nem cobranças recorrentes já
                existentes no Stripe. Para cancelar uma assinatura, use o portal
                de pagamentos.
              </p>
            </>
          ) : (
            <>
              <p>
                Alterar para <strong>{confirmation.name}</strong>, por{" "}
                <strong>{price(confirmation)}/mês</strong>, com até{" "}
                {confirmation.product_limit.toLocaleString("pt-BR")} produtos?
              </p>
              <p>
                A mudança é imediata e pode gerar cobrança proporcional ao
                período restante, calculada pelo Stripe.
              </p>
              <p>
                Se o uso atual superar o novo limite, seus dados serão
                preservados, inclusive os produtos acima do limite. Será
                necessário adequar o uso para cadastrar novos produtos.
              </p>
            </>
          )}
          {(actionError || error) && (
            <p className="billing-message billing-message-error" role="alert">
              {missingConfig ? configurationMessage : actionError || error}
            </p>
          )}
          <div className="billing-actions">
            <button
              type="button"
              className="billing-button billing-button-secondary"
              disabled={disabled}
              onClick={() => setConfirmation(null)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="billing-button"
              disabled={
                disabled ||
                (confirmation === "enable"
                  ? !canEnable || Boolean(state?.settings.enabled)
                  : confirmation === "disable"
                    ? !owner || !state?.settings.enabled
                    : !paymentsAvailable)
              }
              onClick={() => void confirmAction()}
            >
              {working || busy
                ? "Processando…"
                : confirmation === "enable"
                  ? "Confirmar ativação"
                  : confirmation === "disable"
                    ? "Confirmar desativação"
                    : "Confirmar mudança"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
