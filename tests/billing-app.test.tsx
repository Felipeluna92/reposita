// @vitest-environment jsdom
import React, { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { billingFixture, response, userId } from "./billing-fixtures";
import type { BillingState } from "../src/billing/types";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  save: vi.fn(),
  move: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  importItems: vi.fn(),
  saveDemand: vi.fn(),
  demandAction: vi.fn(),
  saveTest: vi.fn(),
  testAction: vi.fn(),
  saveStore: vi.fn(),
  customizeStore: vi.fn(),
  downloadCsv: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  configError: "",
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: () => ({
      select: () => ({ limit: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
const product = {
  id: "p",
  name: "Produto preservado",
  sku: "P1",
  category: "Geral",
  stock: 0,
  min_stock: 5,
  cost: 10,
  price: 20,
  active: true,
  image_path: null,
  created_at: "2026-01-01T00:00:00Z",
};
vi.mock("../src/hooks/useInventory", () => ({
  useInventory: () => ({
    products: [
      product,
      {
        ...product,
        id: "archived",
        name: "Produto arquivado",
        sku: "P2",
        active: false,
      },
    ],
    movements: [],
    loading: false,
    busy: false,
    error: "",
    reload: mocks.reload,
    examples: vi.fn(),
    save: mocks.save,
    move: mocks.move,
    archive: mocks.archive,
    restore: mocks.restore,
    importItems: mocks.importItems,
  }),
}));
vi.mock("../src/demand/useDemand", () => ({
  useDemand: () => ({
    demands: [],
    tests: [],
    store: null,
    loading: false,
    busy: false,
    error: "",
    reload: mocks.reload,
    save: mocks.saveDemand,
    action: mocks.demandAction,
    saveTest: mocks.saveTest,
    testAction: mocks.testAction,
    saveStore: mocks.saveStore,
    customizeStore: mocks.customizeStore,
  }),
}));
vi.mock("../src/lib/csv", async () => ({
  ...(await vi.importActual("../src/lib/csv")),
  downloadCsv: mocks.downloadCsv,
}));

let state: BillingState;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [
    mocks.save,
    mocks.move,
    mocks.archive,
    mocks.restore,
    mocks.importItems,
    mocks.saveDemand,
    mocks.demandAction,
    mocks.saveTest,
    mocks.testAction,
    mocks.saveStore,
    mocks.customizeStore,
    mocks.reload,
  ])
    fn.mockResolvedValue(undefined);
  mocks.getSession.mockResolvedValue({
    data: {
      session: {
        access_token: "user-token",
        user: { id: userId, email: "user@example.com" },
      },
    },
    error: null,
  });
  state = billingFixture();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
    response(
      init.method === "POST" ? { notice: "Retorno sincronizado" } : state,
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  localStorage.clear();
  window.history.replaceState({}, "", "/");
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
  window.history.replaceState({}, "", "/");
});
function nav(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Menu principal" }),
    ).getByRole("button", { name, exact: true }),
  );
}
async function workspace() {
  render(<App />);
  await screen.findByRole("navigation", { name: "Menu principal" });
  await waitFor(() =>
    expect(screen.queryByText("Verificando plano…")).toBeNull(),
  );
}

describe("billing integrado ao workspace", () => {
  it("rota pública de planos não abre workspace nem envia bearer", async () => {
    window.history.replaceState({}, "", "/?planos=1");
    render(<App />);
    await screen.findByText("Contratação ainda em preparação");
    expect(
      screen.queryByRole("navigation", { name: "Menu principal" }),
    ).toBeNull();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });

  it.each(["?cadastro=1", "?assinar=small"])(
    "%s abre cadastro, sem iniciar pagamentos",
    async (query) => {
      mocks.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });
      window.history.replaceState({}, "", `/${query}`);
      render(<App />);
      await screen.findByRole("heading", { name: "Crie sua conta" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("conta autenticada com plano escolhido abre billing sem checkout e limpa só o contexto consumido", async () => {
    window.history.replaceState(
      {},
      "",
      "/?assinar=small&cadastro=1&origem=precos#conta",
    );
    await workspace();
    await screen.findByRole("heading", { name: "Plano e assinatura" });
    expect(screen.getByText(/Plano escolhido:/).textContent).toContain(
      "Pequeno",
    );
    expect(
      fetchMock.mock.calls.every(([, init]) => init.method === "GET"),
    ).toBe(true);
    expect(window.location.search).toBe("?origem=precos");
    expect(window.location.hash).toBe("#conta");
  });

  it.each(["success", "manage", "cancel"])(
    "retorno %s sincroniza uma vez a própria conta em StrictMode",
    async (returned) => {
      window.history.replaceState(
        {},
        "",
        `/?billing=${returned}&session_id=untrusted-session&customer_id=untrusted-customer&origem=stripe`,
      );
      render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      await screen.findByText("Retorno sincronizado");
      const posts = fetchMock.mock.calls.filter(
        ([, init]) => init.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(JSON.parse(posts[0][1].body)).toEqual({
        action: "sync",
        request_id: expect.any(String),
      });
      expect(posts[0][1].headers.Authorization).toBe("Bearer user-token");
      expect(window.location.search).toBe("?origem=stripe");
      expect(screen.queryByText(/pagamento aprovado/i)).toBeNull();
    },
  );

  it("acesso vencido preserva catálogo, relatórios, CSV e backup; bloqueia gravação", async () => {
    state = billingFixture({
      access: {
        allowed: false,
        status: "expired",
        trial_ends_at: "2020-01-01T00:00:00Z",
      },
    });
    await workspace();
    fireEvent.click(screen.getByRole("button", { name: /Novo produto/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    nav("Produtos");
    expect(screen.getByText("Produto preservado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      "reposita-catalogo.csv",
      expect.any(Array),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Produto preservado" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    nav("Relatórios");
    expect(screen.getByRole("button", { name: "Exportar" })).toBeTruthy();
    nav("Configurações");
    expect(
      (
        screen.getByRole("button", {
          name: "Baixar cópia dos dados",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it("limite impede criar/restaurar, mas mantém edição e arquivamento existentes", async () => {
    state = billingFixture({ access: { product_limit: 1, used: 1 } });
    await workspace();
    fireEvent.click(screen.getByRole("button", { name: /Novo produto/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    nav("Produtos");
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Produto preservado" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByLabelText("Arquivados"));
    fireEvent.click(
      screen.getByRole("button", { name: "Restaurar Produto arquivado" }),
    );
    await screen.findByText(/Limite de 1 produtos ativos:/);
    expect(mocks.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Arquivados"));
    fireEvent.click(
      screen.getByRole("button", { name: "Arquivar Produto preservado" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Arquivar", exact: true }),
    );
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith("p"));
  });

  it("importação que ultrapassa vagas é bloqueada inteira no callback", async () => {
    state = billingFixture({ access: { product_limit: 2, used: 1 } });
    await workspace();
    nav("Produtos");
    fireEvent.click(
      screen.getByRole("button", { name: "Importar", exact: true }),
    );
    const file = new File(["Produto;SKU\nNovo A;A\nNovo B;B"], "catalogo.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", {
      value: async () => "Produto;SKU\nNovo A;A\nNovo B;B",
    });
    fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
      target: { files: [file] },
    });
    await screen.findByRole("button", { name: "Importar 2 produtos" });
    fireEvent.click(
      screen.getByRole("button", { name: "Importar 2 produtos" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toContain(
        "1 vagas disponíveis",
      ),
    );
    expect(mocks.importItems).not.toHaveBeenCalled();
  });

  it("ausência da migração de billing mantém inventário gravável e orienta administrador", async () => {
    fetchMock.mockResolvedValue(response({ error: "missingmigration" }, 503));
    await workspace();
    nav("Produtos");
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Produto preservado" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    nav("Planos e assinatura");
    expect(
      screen.getByText(
        /O administrador precisa concluir a configuração das assinaturas/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Preparar Stripe" }),
    ).toBeNull();
  });

  it("guarda é reavaliada no envio se o trial vencer com formulário aberto", async () => {
    const realNow = Date.now;
    state = billingFixture({
      access: { trial_ends_at: new Date(realNow() + 60_000).toISOString() },
    });
    await workspace();
    fireEvent.click(screen.getByRole("button", { name: /Novo produto/ }));
    fireEvent.change(screen.getByLabelText("Nome do produto"), {
      target: { value: "Novo" },
    });
    const clock = vi.spyOn(Date, "now").mockReturnValue(realNow() + 120_000);
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toContain(
        "Seu período de acesso terminou",
      ),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    clock.mockRestore();
  });

  it("procura vencida bloqueia callback sem reescrever seus formulários", async () => {
    state = billingFixture({ access: { allowed: false, status: "expired" } });
    await workspace();
    nav("Procura dos clientes");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar procura", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Produto procurado"), {
      target: { value: "Café" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar procura" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog").textContent).toContain(
        "Seu período de acesso terminou",
      ),
    );
    expect(mocks.saveDemand).not.toHaveBeenCalled();
  });
});
