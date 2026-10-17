import { describe, it, expect } from "vitest";
import {
  pageSettings,
  validatePageSettings,
  contrast,
  buttonText,
} from "../src/demand/page-settings";
import {
  publicInput,
  validatePublicFields,
} from "../src/demand/PublicPageFields";
import { blankDemand } from "../src/demand/DemandFields";
describe("personalização segura e compatível", () => {
  it("páginas antigas recebem modelo padrão e configurações não compartilham referências", () => {
    const a = pageSettings(),
      b = pageSettings({});
    a.fields[0].label = "Alterado";
    expect(b.fields[0].label).toBe("Produto procurado");
    expect(b.fields).toHaveLength(6);
    expect(() => validatePageSettings(b)).not.toThrow();
  });
  it("descarta estilos, links de imagem e enumerações não permitidos", () => {
    const s = pageSettings({
      primary: "red;display:none",
      logo_path: "javascript:alert(1)",
      layout: "script",
      font: "url(evil)",
    });
    expect(s.primary).toBe("#217958");
    expect(s.logo_path).toBe("");
    expect(s.layout).toBe("split");
  });
  it("preserva ordem sem duplicar campos e mantém produto/contato seguros", () => {
    const s = pageSettings({
      fields: [
        { key: "contact", label: "Retorno", enabled: true, required: true },
        { key: "contact" },
        { key: "label", enabled: false, required: false },
      ],
    });
    expect(s.fields.map((f) => f.key)).toEqual([
      "contact",
      "label",
      "variant",
      "quantity",
      "budget",
      "note",
    ]);
    expect(s.fields[0].required).toBe(false);
    expect(s.fields[1]).toMatchObject({ enabled: true, required: true });
  });
  it("exige contraste de leitura e escolhe texto adequado no botão", () => {
    const s = pageSettings();
    s.text = "#ffffff";
    expect(() => validatePageSettings(s)).toThrow("contraste");
    expect(contrast("#000000", "#ffffff")).toBe(21);
    expect(buttonText("#ffffff")).toBe("#111111");
    expect(buttonText("#000000")).toBe("#ffffff");
  });
  it("campos ocultos são limpos sem expor contato e quantidade recebe padrão", () => {
    const s = pageSettings();
    s.fields = s.fields.map((f) => ({ ...f, enabled: f.key === "label" }));
    const input = publicInput(
      {
        ...blankDemand,
        label: "Café",
        contact: "11999999999",
        contact_consent: true,
        quantity: 20,
        budget: 99,
        note: "Privado",
        variant: "500g",
      },
      s,
    );
    expect(input).toMatchObject({
      contact: "",
      contact_consent: false,
      quantity: 1,
      budget: null,
      note: "",
      variant: "",
    });
  });
  it("perguntas obrigatórias não podem ser omitidas e limites são validados", () => {
    const s = pageSettings();
    s.questions = [
      { id: "q_1", label: "Qual marca?", placeholder: "", required: true },
    ];
    expect(() =>
      validatePublicFields({ ...blankDemand, label: "Café" }, s),
    ).toThrow("Qual marca");
    expect(() =>
      validatePublicFields(
        {
          ...blankDemand,
          label: "Café",
          custom_answers: [{ id: "q_1", value: "Local" }],
        },
        s,
      ),
    ).not.toThrow();
    s.questions[0].label = "";
    expect(() => validatePageSettings(s)).toThrow("perguntas");
  });
});
