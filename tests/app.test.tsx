// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
vi.mock("../src/lib/supabase", () => ({ supabase: null, configError: "" }));
vi.mock("../src/lib/images", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/images")>(
      "../src/lib/images",
    );
  return {
    ...actual,
    storeImage: vi.fn().mockResolvedValue("data:image/webp;base64,AAAA"),
  };
});
beforeEach(() => {
  localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:test-preview");
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
async function enterDemo() {
  fireEvent.click(
    screen.getByRole("button", { name: "Explorar demonstração" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Carregando produtos e movimentações…"),
    ).toBeNull(),
  );
}
async function createProduct() {
  fireEvent.click(screen.getByRole("button", { name: /Novo produto/ }));
  fireEvent.change(screen.getByLabelText("Nome do produto"), {
    target: { value: "Produto real de teste" },
  });
  fireEvent.change(screen.getByLabelText("Código SKU"), {
    target: { value: "T001" },
  });
  fireEvent.change(screen.getByLabelText("Custo unitário (R$)"), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText("Preço de venda (R$)"), {
    target: { value: "20" },
  });
  fireEvent.change(screen.getByLabelText("Estoque inicial"), {
    target: { value: "10" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
describe("fluxos principais na interface", () => {
  it("alterna tema e preserva preferência", async () => {
    render(<App />);
    await enterDemo();
    fireEvent.click(screen.getByRole("button", { name: "Ativar modo escuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("reposita.theme")).toBe("dark");
  });
  it("salva foto otimizada no produto pelo formulário", async () => {
    render(<App />);
    await enterDemo();
    await createProduct();
    fireEvent.click(
      screen.getByRole("button", { name: "Produtos", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Editar Produto real de teste" }),
    );
    const file = new File(["foto"], "foto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Foto do produto"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar produto" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      JSON.parse(localStorage.getItem("reposita.demo.v2")!).products[0]
        .image_path,
    ).toBe("data:image/webp;base64,AAAA");
  });
  it("importa CSV com prévia e cadastra lote", async () => {
    render(<App />);
    await enterDemo();
    fireEvent.click(
      screen.getByRole("button", { name: "Produtos", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Importar", exact: true }),
    );
    const file = new File(
      ["Produto;SKU;Estoque\nImportado;IMP;7"],
      "catalogo.csv",
      { type: "text/csv" },
    );
    Object.defineProperty(file, "text", {
      value: async () => "Produto;SKU;Estoque\nImportado;IMP;7",
    });
    fireEvent.change(screen.getByLabelText("Arquivo CSV"), {
      target: { files: [file] },
    });
    await screen.findByText("Pronto para importar");
    fireEvent.click(
      screen.getByRole("button", { name: "Importar 1 produtos" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Importado")).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("reposita.demo.v2")!).products[0].stock,
    ).toBe(7);
  });
  it("restaura arquivado preservando cadastro", async () => {
    localStorage.setItem(
      "reposita.demo.v2",
      JSON.stringify({
        products: [
          {
            id: "p",
            name: "Arquivado",
            sku: "ARQ",
            category: "Geral",
            stock: 0,
            min_stock: 5,
            cost: 10,
            price: 20,
            active: false,
            created_at: new Date().toISOString(),
          },
        ],
        movements: [],
      }),
    );
    render(<App />);
    await enterDemo();
    fireEvent.click(
      screen.getByRole("button", { name: "Produtos", exact: true }),
    );
    fireEvent.click(screen.getByLabelText("Arquivados"));
    fireEvent.click(
      screen.getByRole("button", { name: "Restaurar Arquivado" }),
    );
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("reposita.demo.v2")!).products[0]
          .active,
      ).toBe(true),
    );
  });
  it("cria produto e preserva após fechar e reabrir a aplicação", async () => {
    const view = render(<App />);
    await enterDemo();
    await createProduct();
    fireEvent.click(
      screen.getByRole("button", { name: "Produtos", exact: true }),
    );
    expect(screen.getByText("Produto real de teste")).toBeTruthy();
    view.unmount();
    render(<App />);
    await enterDemo();
    fireEvent.click(
      screen.getByRole("button", { name: "Produtos", exact: true }),
    );
    expect(screen.getByText("Produto real de teste")).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem("reposita.demo.v2")!).products[0].stock,
    ).toBe(10);
  });
  it("recusa venda maior que saldo e registra uma venda válida", async () => {
    render(<App />);
    await enterDemo();
    await createProduct();
    fireEvent.click(
      screen.getByRole("button", { name: "Movimentações", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Tipo"), {
      target: { value: "sale" },
    });
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "11" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Estoque insuficiente.",
    );
    fireEvent.change(screen.getByLabelText("Quantidade"), {
      target: { value: "2" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const stored = JSON.parse(localStorage.getItem("reposita.demo.v2")!);
    expect(stored.products[0].stock).toBe(8);
    expect(stored.movements).toHaveLength(2);
  });
  it("abre calculadora funcional e sinaliza percentual impossível", async () => {
    render(<App />);
    await enterDemo();
    fireEvent.click(
      screen.getByRole("button", { name: "Calculadora", exact: true }),
    );
    fireEvent.change(screen.getByLabelText(/Margem de contribuição desejada/), {
      target: { value: "100" },
    });
    expect(screen.getByRole("alert").textContent).toContain("menos de 100%");
  });
});
