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
beforeEach(() => {
  localStorage.clear();
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
