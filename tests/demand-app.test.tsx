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
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import App from "../src/App";
vi.mock("../src/lib/supabase", () => ({ supabase: null, configError: "" }));
const product = {
  id: "p",
  name: "Pneu",
  sku: "P1",
  category: "Auto",
  stock: 100,
  min_stock: 5,
  cost: 10,
  price: 30,
  active: true,
  created_at: "2026-01-01T12:00:00Z",
};
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  localStorage.setItem(
    "reposita.demo.v2",
    JSON.stringify({ products: [product], movements: [] }),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const nav = (name: string) =>
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Menu principal" }),
    ).getByRole("button", { name, exact: true }),
  );
const inventory = () => JSON.parse(localStorage.getItem("reposita.demo.v2")!);
const demand = () => JSON.parse(localStorage.getItem("reposita.demand.v1")!);
async function demo() {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: "Explorar demonstração" }),
  );
  await screen.findByText(/SEU RADAR DE PROCURA/i);
}
describe("procura → plano → compra → observação", () => {
  it("percorre o fluxo sem duplicar entrada ou confundir plano com estoque", async () => {
    await demo();
    nav("Procura dos clientes");
    await screen.findByText("Toda procura merece ser lembrada.");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar procura", exact: true }),
    );
    change("Vincular ao catálogo (opcional)", "p");
    change("Quantidade desejada", "2");
    fireEvent.click(screen.getByRole("button", { name: "Salvar procura" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(demand().demands[0].label).toBe("Pneu");
    nav("Oportunidades");
    await screen.findByText("Escute antes de abastecer.");
    fireEvent.click(
      screen.getByRole("button", { name: "Comparar uma compra" }),
    );
    change("Unidades do lote", "10");
    change("Custo por unidade, R$", "20");
    change("Frete total do lote, R$", "10");
    change("Preço de venda planejado, R$", "40");
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar plano de compra" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(inventory().products[0].stock).toBe(100);
    nav("Testes de compra");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar compra do lote" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar compra realizada" }),
    );
    await waitFor(() =>
      expect(inventory().products[0]).toMatchObject({ stock: 110, cost: 11 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(inventory().movements).toHaveLength(1);
    expect(inventory().products[0].price).toBe(30);
    nav("Movimentações");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar", exact: true }),
    );
    change("Tipo", "sale");
    change("Quantidade", "2");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    nav("Testes de compra");
    await screen.findByText("2 unidades vendidas no período");
    expect(inventory().products[0].stock).toBe(108);
  });
  it("contato exige autorização explícita, que pode ser revogada", async () => {
    await demo();
    nav("Procura dos clientes");
    await screen.findByText("Toda procura merece ser lembrada.");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar procura", exact: true }),
    );
    change("Produto procurado", "Bicicleta");
    change("WhatsApp ou e-mail (opcional)", "11999999999");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("autorização"),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar procura" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByRole("link", { name: /Abrir WhatsApp/ }).getAttribute("href"),
    ).toContain("wa.me");
    fireEvent.click(screen.getByRole("button", { name: "Excluir contato" }));
    await waitFor(() => expect(demand().demands[0].contact).toBe(""));
    expect(screen.queryByRole("link", { name: /Abrir WhatsApp/ })).toBeNull();
  });
  it("preço ausente não cria prejuízo potencial fictício", async () => {
    localStorage.setItem(
      "reposita.demo.v2",
      JSON.stringify({ products: [{ ...product, price: 0 }], movements: [] }),
    );
    await demo();
    expect(screen.getByText("Defina os preços")).toBeTruthy();
    expect(screen.getByText("Preço pendente")).toBeTruthy();
    expect(screen.queryByText("-R$ 1.000,00")).toBeNull();
  });
  it("página pública demo recebe interesse sem abrir painel ou exigir contato", async () => {
    localStorage.setItem(
      "reposita.demand.v1",
      JSON.stringify({
        demands: [],
        tests: [],
        store: { name: "Loja da Vila", public_token: "demo", enabled: true },
      }),
    );
    window.history.replaceState({}, "", "/?procura=demo");
    render(<App />);
    await screen.findByRole("heading", { name: "Conte para a loja" });
    expect(
      screen.queryByRole("navigation", { name: "Menu principal" }),
    ).toBeNull();
    change("Produto procurado", "Café sem açúcar");
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar meu interesse" }),
    );
    await screen.findByText("Seu interesse foi registrado.");
    expect(demand().demands[0]).toMatchObject({
      label: "Café sem açúcar",
      source: "public",
      contact: "",
      contact_consent: false,
    });
  });
});
