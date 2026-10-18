// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BillingPanel,
  type BillingPanelProps,
} from "../src/billing/BillingPanel";
import { PricingLanding } from "../src/billing/PricingLanding";
import {
  billingFixture,
  readyAdmin,
  response,
  userId,
} from "./billing-fixtures";

let run: ReturnType<typeof vi.fn>;
function panel(input: Partial<BillingPanelProps> = {}) {
  return render(
    <BillingPanel
      state={billingFixture()}
      error=""
      loading={false}
      busy={false}
      demo={false}
      userId={userId}
      reload={vi.fn().mockResolvedValue(undefined)}
      run={run}
      {...input}
    />,
  );
}
beforeEach(() => {
  run = vi.fn().mockResolvedValue({ notice: "Feito" });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("painel de assinaturas", () => {
  it("não inicia mutações ao montar e checkout exige clique", async () => {
    panel();
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Assinar Pequeno" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledExactlyOnceWith("checkout", {
        plan: "small",
      }),
    );
  });

  it("confirma troca com cobrança proporcional e preservação dos dados", async () => {
    panel({
      state: billingFixture({
        access: { status: "active", plan_code: "small" },
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Mudar para Maior" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("imediata");
    expect(dialog.textContent).toContain("proporcional");
    expect(dialog.textContent).toContain("dados serão preservados");
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar mudança" }),
    );
    await waitFor(() =>
      expect(run).toHaveBeenCalledExactlyOnceWith("change", {
        plan: "large",
        confirm: true,
      }),
    );
  });

  it.each([true, false])(
    "test checkout funciona com enabled=false e owner=%s",
    async (owner) => {
      panel({
        state: billingFixture({
          settings: { enabled: false },
          access: { is_owner: owner },
          ...(owner ? { admin: readyAdmin } : {}),
        }),
      });
      expect(screen.getByText(/Use um cartão de teste/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Assinar Pequeno" }));
      await waitFor(() =>
        expect(run).toHaveBeenCalledWith("checkout", { plan: "small" }),
      );
    },
  );

  it("test checkout do owner exige gateway preparado e ambiente correspondente", () => {
    panel({
      state: billingFixture({
        settings: { enabled: false },
        access: { is_owner: true },
        admin: { ...readyAdmin, gateway_mode: "live" },
      }),
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Assinar Pequeno",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("mantém portal disponível para cliente cancelado sem acesso ativo", async () => {
    panel({
      state: billingFixture({
        access: {
          status: "canceled",
          allowed: false,
          plan_code: null,
          has_customer: true,
        },
      }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar cartão ou cancelar" }),
    );
    await waitFor(() =>
      expect(run).toHaveBeenCalledExactlyOnceWith("portal", undefined),
    );
  });
  it("owner pode abrir portal de teste mesmo sem plan_code", async () => {
    panel({
      state: billingFixture({
        settings: { enabled: false },
        access: { is_owner: true, plan_code: null },
        admin: readyAdmin,
      }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar cartão ou cancelar" }),
    );
    await waitFor(() =>
      expect(run).toHaveBeenCalledExactlyOnceWith("portal", undefined),
    );
  });

  it("ativa teste sem habilitação financeira, mas exige confirmação explícita", async () => {
    panel({
      state: billingFixture({
        settings: { enabled: false },
        access: { is_owner: true },
        admin: readyAdmin,
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Ativar assinaturas" }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar ativação" }));
    await waitFor(() =>
      expect(run).toHaveBeenCalledExactlyOnceWith("enable", { confirm: true }),
    );
  });

  it("owner live é isento e ativação real exige conta habilitada e teste verificado", () => {
    panel({
      state: billingFixture({
        settings: { enabled: false, mode: "live" },
        access: { is_owner: true },
        admin: { ...readyAdmin, gateway_mode: "live" },
      }),
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Assinar Pequeno",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Ativar assinaturas",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Owner · isento" }),
    ).toBeTruthy();
  });

  it("desativação exige diálogo e confirm:true, e esclarece assinaturas existentes", async () => {
    panel({
      state: billingFixture({ access: { is_owner: true }, admin: readyAdmin }),
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Desativar assinaturas" }),
    );
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").textContent).toContain(
      "não cancela assinaturas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Desativar assinaturas" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar desativação" }),
    );
    await waitFor(() =>
      expect(run).toHaveBeenCalledExactlyOnceWith("disable", { confirm: true }),
    );
  });

  it("demo não permite pagamentos nem consultas de rede", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    panel({
      demo: true,
      state: billingFixture({
        setup_required: true,
        owner_setup_needed: true,
        access: { is_owner: true },
        admin: readyAdmin,
      }),
    });
    for (const button of screen.getAllByRole("button")) fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", {
        name: "Copiar atualização de assinaturas",
      }),
    ).toBeNull();
  });

  it("não mostra setup para usuário comum quando já existe owner", () => {
    panel({
      state: billingFixture({ configured: false, setup_required: true }),
    });
    expect(
      screen.queryByRole("button", {
        name: "Copiar atualização de assinaturas",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Preparar Stripe" }),
    ).toBeNull();
  });

  it("copia atualização somente com UUID e prefixo válidos", async () => {
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboard },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "-- Reposita update\nselect 1;",
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = billingFixture({
      setup_required: true,
      owner_setup_needed: true,
    });
    const view = panel({ state, userId: "not-a-uuid'); drop table x; --" });
    fireEvent.click(
      screen.getByRole("button", { name: "Copiar atualização de assinaturas" }),
    );
    await screen.findByText(/Entre com uma conta válida/);
    expect(fetchMock).not.toHaveBeenCalled();
    view.rerender(
      <BillingPanel
        state={state}
        demo={false}
        userId={userId}
        error=""
        loading={false}
        busy={false}
        run={run}
        reload={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copiar atualização de assinaturas" }),
    );
    await waitFor(() =>
      expect(clipboard).toHaveBeenCalledWith(
        expect.stringContaining(`values ('${userId}') on conflict do nothing;`),
      ),
    );
    clipboard.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => "<html>error</html>",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Copiar atualização de assinaturas" }),
    );
    await screen.findByText(/cabeçalho esperado/);
    expect(clipboard).not.toHaveBeenCalled();
  });
});

describe("planos públicos", () => {
  it("carrega preços reais sem autenticação e preserva os destinos dos CTAs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response(billingFixture({ settings: { mode: "live" } })),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<PricingLanding />);
    const plan = await screen.findByRole("link", {
      name: "Assinar plano Pequeno",
    });
    expect(plan.getAttribute("href")).toBe("/?assinar=small");
    expect(
      screen
        .getByRole("link", { name: "Começar teste grátis" })
        .getAttribute("href"),
    ).toBe("/?cadastro=1");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(screen.getByText(/19,90/)).toBeTruthy();
  });
  it.each(["test", "live"] as const)(
    "não anuncia checkout real em %s desativado e usa trial configurado",
    async (mode) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          response(
            billingFixture({
              settings: {
                mode,
                enabled: false,
                trial_days: 10,
                trial_products: 80,
              },
            }),
          ),
        ),
      );
      render(<PricingLanding />);
      await screen.findByText("Contratação ainda em preparação");
      expect(
        screen.getByText("10 dias grátis · Até 80 produtos · Sem cartão"),
      ).toBeTruthy();
      expect(screen.queryByRole("link", { name: /Assinar plano/ })).toBeNull();
      expect(
        screen
          .getByRole("link", {
            name: "Criar conta grátis para conhecer Pequeno",
          })
          .getAttribute("href"),
      ).toBe("/?cadastro=1");
      expect(screen.getByText(/19,90/)).toBeTruthy();
    },
  );
  it("missingconfig não inventa preços e orienta o administrador", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: "missingconfig" }, 503)),
    );
    render(<PricingLanding />);
    await screen.findByText("Os planos aguardam configuração.");
    expect(screen.queryByRole("link", { name: /Assinar plano/ })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Acesse o Reposita" })
        .getAttribute("href"),
    ).toBe("/");
  });
});
