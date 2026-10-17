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
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,AAAA"),
  },
}));
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  localStorage.setItem(
    "reposita.demand.v1",
    JSON.stringify({
      demands: [],
      tests: [],
      store: {
        name: "Loja da Vila",
        enabled: true,
        public_token: "mesmo-token",
      },
    }),
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
async function editor() {
  render(<App />);
  fireEvent.click(
    screen.getByRole("button", { name: "Explorar demonstração" }),
  );
  await screen.findByText(/SEU RADAR DE PROCURA/);
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Menu principal" }),
    ).getByRole("button", { name: "Procura dos clientes" }),
  );
  await screen.findByText("Toda procura merece ser lembrada.");
  fireEvent.click(screen.getByRole("button", { name: "Link da loja" }));
  fireEvent.click(screen.getByRole("button", { name: "Personalizar página" }));
}
describe("editor e publicação da página", () => {
  it("salva textos, cores e pergunta; página usa configurações e preserva o link", async () => {
    await editor();
    fireEvent.change(screen.getByLabelText("Cor dos botões"), {
      target: { value: "#80551c" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Textos", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Título principal"), {
      target: { value: "O que falta na {loja}?" },
    });
    fireEvent.change(screen.getByLabelText("Texto do botão de envio"), {
      target: { value: "Enviar sugestão" },
    });
    fireEvent.change(screen.getByLabelText("Título de confirmação"), {
      target: { value: "Sugestão recebida!" },
    });
    expect(
      screen.getByRole("heading", { name: "O que falta na Loja da Vila?" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Formulário", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Adicionar pergunta" }));
    fireEvent.change(screen.getByLabelText("Pergunta 1"), {
      target: { value: "Qual marca você prefere?" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar personalização" }),
    );
    await screen.findByText("Alterações publicadas no mesmo link da loja.");
    const stored = JSON.parse(localStorage.getItem("reposita.demand.v1")!);
    expect(stored.store.public_token).toBe("mesmo-token");
    expect(stored.store.enabled).toBe(true);
    cleanup();
    window.history.replaceState({}, "", "/?procura=demo");
    render(<App />);
    await screen.findByRole("heading", {
      name: "O que falta na Loja da Vila?",
    });
    fireEvent.change(screen.getByLabelText("Produto procurado"), {
      target: { value: "Café" },
    });
    fireEvent.change(screen.getByLabelText("Qual marca você prefere?"), {
      target: { value: "Produtor local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar sugestão" }));
    await screen.findByText("Sugestão recebida!");
    expect(
      JSON.parse(localStorage.getItem("reposita.demand.v1")!).demands[0]
        .custom_answers[0],
    ).toMatchObject({
      label: "Qual marca você prefere?",
      value: "Produtor local",
    });
  });
  it("avisa antes de descartar alterações e permite continuar editando", async () => {
    await editor();
    fireEvent.change(screen.getByLabelText("Nome público da loja"), {
      target: { value: "Outra loja" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar", exact: true }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "alterações não salvas",
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByLabelText("Nome público da loja")).toHaveProperty(
      "value",
      "Outra loja",
    );
  });
  it("bloqueia publicação com contraste insuficiente", async () => {
    await editor();
    fireEvent.change(screen.getByLabelText("Cor dos textos"), {
      target: { value: "#ffffff" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar personalização" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("contraste");
    expect(
      JSON.parse(localStorage.getItem("reposita.demand.v1")!).store
        .page_settings,
    ).toBeUndefined();
  });
});
