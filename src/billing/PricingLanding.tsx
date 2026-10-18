import { useEffect, useId, useState } from "react";
import type { BillingPlan, BillingState } from "./types";
import "./billing.css";

function isPlan(value: unknown): value is BillingPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<BillingPlan>;
  return (
    typeof plan.code === "string" &&
    plan.code.length > 0 &&
    typeof plan.name === "string" &&
    typeof plan.amount_cents === "number" &&
    Number.isSafeInteger(plan.amount_cents) &&
    plan.amount_cents >= 0 &&
    typeof plan.currency === "string" &&
    plan.currency.toLowerCase() === "brl" &&
    typeof plan.product_limit === "number" &&
    Number.isSafeInteger(plan.product_limit) &&
    plan.product_limit > 0 &&
    typeof plan.sort_order === "number" &&
    Number.isFinite(plan.sort_order)
  );
}

export function PricingLanding() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [configurationRequired, setConfigurationRequired] = useState(false);
  const [settings, setSettings] = useState<BillingState["settings"] | null>(
    null,
  );
  const [configured, setConfigured] = useState(false);
  const plansTitleId = useId();
  const trialDays = settings?.trial_days ?? 7;
  const trialProducts = settings?.trial_products ?? 50;
  const liveCheckout =
    configured && settings?.mode === "live" && settings.enabled;

  useEffect(() => {
    const controller = new AbortController();
    async function loadPlans() {
      try {
        const response = await fetch("/api/billing", {
          method: "GET",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object")
          throw new Error("Planos indisponíveis");
        if ("error" in payload && payload.error) {
          throw new Error(
            typeof payload.error === "string"
              ? payload.error
              : "Planos indisponíveis",
          );
        }
        if (!response.ok) throw new Error("Planos indisponíveis");
        // Accept the state directly, or the API's state envelope, without inventing prices.
        const data = (
          "state" in payload ? payload.state : payload
        ) as Partial<BillingState> | null;
        if (
          !controller.signal.aborted &&
          data?.settings &&
          typeof data.settings.enabled === "boolean" &&
          ["test", "live"].includes(data.settings.mode) &&
          Number.isSafeInteger(data.settings.trial_days) &&
          data.settings.trial_days > 0 &&
          Number.isSafeInteger(data.settings.trial_products) &&
          data.settings.trial_products > 0
        ) {
          setSettings(data.settings);
          setConfigured(data.configured === true && !data.setup_required);
        }
        if (!data || !Array.isArray(data.plans))
          throw new Error("Planos indisponíveis");
        const available = data.plans
          .filter(isPlan)
          .sort((a, b) => a.sort_order - b.sort_order);
        if (!available.length) throw new Error("Planos indisponíveis");
        if (!controller.signal.aborted) {
          setPlans(available);
          setUnavailable(false);
          setConfigurationRequired(false);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setPlans([]);
          setUnavailable(true);
          setConfigurationRequired(
            cause instanceof Error &&
              /missing[\s_-]*config/i.test(cause.message),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadPlans();
    return () => controller.abort();
  }, []);

  return (
    <main className="billing-root billing-landing">
      <nav className="billing-public-nav" aria-label="Navegação principal">
        <a className="billing-brand" href="/" aria-label="Reposita, início">
          <span aria-hidden="true">r</span>Reposita
        </a>
        <a className="billing-button billing-button-secondary" href="/">
          Entrar
        </a>
      </nav>

      <header className="billing-hero">
        <span className="billing-eyebrow">
          DO PRIMEIRO PRODUTO AO PRÓXIMO PEDIDO
        </span>
        <h1>
          Estoque, procura e compras.
          <br />
          <em>Seu negócio em ordem.</em>
        </h1>
        <p>
          Saiba o que tem, acompanhe o que seus clientes procuram e organize as
          próximas compras em um só lugar.
        </p>
        <a className="billing-button" href="/?cadastro=1">
          Começar teste grátis
        </a>
        <p className="billing-hero-note">
          {trialDays} dias grátis · Até {trialProducts} produtos · Sem cartão
        </p>
        <ul className="billing-feature-strip">
          <li>Controle de estoque</li>
          <li>Acompanhamento da procura</li>
          <li>Planejamento de compras</li>
        </ul>
      </header>

      <section
        className="billing-public-plans"
        aria-labelledby={plansTitleId}
        aria-busy={loading}
      >
        <div className="billing-section-intro">
          <span className="billing-eyebrow">ESPAÇO PARA CRESCER</span>
          <h2 id={plansTitleId}>Escolha o plano para seu momento</h2>
          <p>
            Preços em reais por mês. Cobrança recorrente no cartão, cancelável
            pelo portal da assinatura.
          </p>
        </div>
        {!loading && !liveCheckout && (
          <div className="billing-message">
            <strong>Contratação ainda em preparação</strong>
            <p>
              {settings?.mode === "test"
                ? "O gateway está em ambiente de testes, sem dinheiro real. "
                : "As assinaturas reais ainda não foram liberadas. "}
              Você pode criar uma conta gratuitamente para conhecer o Reposita.
              Os preços exibidos são os planos cadastrados para contratação
              quando disponível.
            </p>
          </div>
        )}
        {loading && (
          <p className="billing-message" role="status">
            Consultando planos e preços…
          </p>
        )}
        {unavailable && (
          <div className="billing-message" role="status">
            <strong>
              {configurationRequired
                ? "Os planos aguardam configuração."
                : "Os planos estão indisponíveis no momento."}
            </strong>
            <p>
              {configurationRequired
                ? "O administrador precisa concluir a configuração das assinaturas. "
                : "Não foi possível consultar os preços atuais. "}
              <a href="/">Acesse o Reposita</a> para entrar ou tentar novamente
              mais tarde.
            </p>
          </div>
        )}
        {!loading && plans.length > 0 && (
          <div className="billing-plans">
            {plans.map((plan) => (
              <article className="billing-card billing-plan" key={plan.code}>
                <h3>{plan.name}</h3>
                <p className="billing-price">
                  <strong>
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(plan.amount_cents / 100)}
                  </strong>
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
                <a
                  className="billing-button"
                  href={
                    liveCheckout
                      ? `/?assinar=${encodeURIComponent(plan.code)}`
                      : "/?cadastro=1"
                  }
                  aria-label={
                    liveCheckout
                      ? `Assinar plano ${plan.name}`
                      : `Criar conta grátis para conhecer ${plan.name}`
                  }
                >
                  {liveCheckout
                    ? `Escolher ${plan.name}`
                    : "Criar conta grátis"}
                </a>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="billing-trial-callout">
        <div>
          <h2>Comece pelo que você já tem.</h2>
          <p>
            Experimente por {trialDays} dias com até {trialProducts} produtos.
            Sem informar cartão para testar.
          </p>
        </div>
        <a className="billing-button" href="/?cadastro=1">
          Criar minha conta
        </a>
      </section>
      <footer className="billing-public-footer">
        <span>Reposita · Estoque, procura e compras</span>
        <a href="/">Entrar na minha conta</a>
      </footer>
    </main>
  );
}
