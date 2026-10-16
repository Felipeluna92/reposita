import { describe, expect, it } from "vitest";
import { importPreview, parseCsv, csvHeaders } from "../src/lib/csv";
import { summarize, reorder, idleProducts } from "../src/lib/reports";
import { validateImage } from "../src/lib/images";
import type { InventoryData } from "../src/types";
const data: InventoryData = {
  products: [
    {
      id: "p",
      name: "Produto",
      sku: "P1",
      category: "Teste",
      stock: 3,
      min_stock: 5,
      cost: 10,
      price: 20,
      active: true,
      created_at: "2026-01-01T12:00:00Z",
    },
  ],
  movements: [
    {
      id: "a",
      product_id: "p",
      kind: "sale",
      quantity: 2,
      unit_cost: 10,
      unit_price: 25,
      note: "",
      created_at: "2026-09-10T12:00:00Z",
    },
    {
      id: "b",
      product_id: "p",
      kind: "purchase",
      quantity: 5,
      unit_cost: 10,
      unit_price: 0,
      note: "",
      created_at: "2026-10-10T12:00:00Z",
    },
  ],
};
describe("CSV profissional", () => {
  it("interpreta aspas, ponto e vírgula e múltiplas linhas", () =>
    expect(
      parseCsv('Produto;Descrição\r\n"A; B";"Linha 1\nLinha ""2"""'),
    ).toEqual([
      ["Produto", "Descrição"],
      ["A; B", 'Linha 1\nLinha "2"'],
    ]));
  it("importa valores brasileiros e campos avançados", () => {
    const rows = importPreview(
      csvHeaders.join(";") +
        "\nCafé;C1;Geral;10;2;12,50;24,90;123;Fornecedor;A1;Descrição",
      [],
    );
    expect(rows[0].error).toBe("");
    expect(rows[0].input?.cost).toBe(12.5);
    expect(rows[0].input?.supplier).toBe("Fornecedor");
  });
  it("marca SKU já existente e duplicado no lote", () => {
    expect(importPreview("Produto;SKU\nTeste;P1", ["P1"])[0].error).toContain(
      "duplicado",
    );
    expect(importPreview("Produto;SKU\nA;P1\nB;P1", [])[1].error).toContain(
      "duplicado",
    );
  });
  it("recusa negativos e fracionários no estoque", () => {
    expect(importPreview("Produto;Estoque\nA;-1", [])[0].error).not.toBe("");
    expect(importPreview("Produto;Estoque\nA;1,5", [])[0].error).not.toBe("");
  });
  it("recusa arquivo sem coluna de produto, aspas quebradas e mais de 200 itens", () => {
    expect(() => importPreview("SKU\nA", [])).toThrow();
    expect(() => parseCsv('Produto\n"Aberta')).toThrow();
    expect(() =>
      importPreview("Produto\n" + Array(201).fill("A").join("\n"), []),
    ).toThrow("200");
  });
  it("interpreta separador vírgula com valor decimal entre aspas", () =>
    expect(
      importPreview('Produto,SKU,Custo unitário\nTeste,T1,"12,50"', [])[0].input
        ?.cost,
    ).toBe(12.5));
});
describe("relatórios e reposição", () => {
  it("respeita o intervalo e ignora compra como receita", () => {
    expect(summarize(data, "2026-10-01", "2026-10-31")).toMatchObject({
      revenue: 0,
      profit: 0,
      purchase: 50,
      units: 0,
    });
    expect(summarize(data, "2026-09-01", "2026-09-30")).toMatchObject({
      revenue: 50,
      cost: 20,
      profit: 30,
      units: 2,
      margin: 60,
    });
  });
  it("agrega ranking por produto e receita por dia", () => {
    const report = summarize(data, "", "");
    expect(report.ranking[0].units).toBe(2);
    expect(report.daily).toHaveLength(1);
    expect(report.ranking[0].name).toBe("Produto");
  });
  it("não divide por zero e reconhece prejuízo", () => {
    const report = summarize(
      { ...data, movements: [{ ...data.movements[0], unit_price: 0 }] },
      "",
      "",
    );
    expect(report.margin).toBeNull();
    expect(report.profit).toBe(-20);
  });
  it("sugere reposição até duas vezes o mínimo e respeita arquivados", () => {
    expect(reorder(data.products[0])).toBe(7);
    expect(reorder({ ...data.products[0], active: false })).toBe(0);
  });
  it("mede ausência de venda apenas para produtos com idade suficiente", () => {
    expect(
      idleProducts(data, 30, new Date("2026-10-16T12:00:00Z").getTime()),
    ).toHaveLength(1);
    expect(
      idleProducts(
        {
          ...data,
          products: [
            { ...data.products[0], created_at: "2026-10-15T12:00:00Z" },
          ],
          movements: [],
        },
        30,
        new Date("2026-10-16T12:00:00Z").getTime(),
      ),
    ).toHaveLength(0);
  });
});
describe("imagens", () => {
  it("aceita somente JPG, PNG e WebP até 5 MB", () => {
    expect(() =>
      validateImage({ type: "image/jpeg", size: 2000 }),
    ).not.toThrow();
    expect(() => validateImage({ type: "image/svg+xml", size: 100 })).toThrow();
    expect(() =>
      validateImage({ type: "image/png", size: 6 * 1024 * 1024 }),
    ).toThrow();
    expect(() => validateImage({ type: "image/png", size: 0 })).toThrow();
  });
});
