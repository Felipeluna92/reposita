export const fieldKeys = [
  "label",
  "variant",
  "quantity",
  "budget",
  "note",
  "contact",
] as const;
export type FieldKey = (typeof fieldKeys)[number];
export type PageField = {
  key: FieldKey;
  label: string;
  placeholder: string;
  enabled: boolean;
  required: boolean;
};
export type PageQuestion = {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
};
export type PageSettings = {
  version: 1;
  layout: "split" | "centered";
  theme: "light" | "dark";
  font: "clean" | "elegant" | "modern";
  background: string;
  surface: string;
  text: string;
  primary: string;
  eyebrow: string;
  headline: string;
  description: string;
  form_title: string;
  form_description: string;
  button: string;
  success_title: string;
  success_message: string;
  footer: string;
  privacy_note: string;
  logo_path: string;
  cover_path: string;
  fields: PageField[];
  questions: PageQuestion[];
};
export const defaultFields: PageField[] = [
  {
    key: "label",
    label: "Produto procurado",
    placeholder: "Qual produto você gostaria de encontrar?",
    enabled: true,
    required: true,
  },
  {
    key: "variant",
    label: "Medida, cor ou modelo (opcional)",
    placeholder: "Ex.: aro 15, azul, tamanho M",
    enabled: true,
    required: false,
  },
  {
    key: "quantity",
    label: "Quantidade desejada",
    placeholder: "",
    enabled: true,
    required: true,
  },
  {
    key: "budget",
    label: "Preço esperado por unidade, R$ (opcional)",
    placeholder: "",
    enabled: true,
    required: false,
  },
  {
    key: "note",
    label: "Observações (opcional)",
    placeholder: "Detalhes que ajudam a identificar o produto",
    enabled: true,
    required: false,
  },
  {
    key: "contact",
    label: "WhatsApp ou e-mail (opcional)",
    placeholder: "",
    enabled: true,
    required: false,
  },
];
export const defaults: PageSettings = {
  version: 1,
  layout: "split",
  theme: "light",
  font: "clean",
  background: "#f4f7f4",
  surface: "#ffffff",
  text: "#203d30",
  primary: "#217958",
  eyebrow: "UM BOM COMEÇO É OUVIR VOCÊ",
  headline: "O que você gostaria de encontrar na {loja}?",
  description:
    "Conte o que está procurando. A loja recebe seu interesse e pode avaliar uma próxima compra.",
  form_title: "Conte para a loja",
  form_description: "",
  button: "Registrar meu interesse",
  success_title: "Seu interesse foi registrado.",
  success_message:
    "A disponibilidade e o prazo ainda precisam ser confirmados.",
  footer: "Reposita · tecnologia para aproximar lojas e clientes.",
  privacy_note: "",
  logo_path: "",
  cover_path: "",
  fields: defaultFields,
  questions: [],
};
export const textLimits = {
  eyebrow: 100,
  headline: 200,
  description: 800,
  form_title: 100,
  form_description: 400,
  button: 60,
  success_title: 150,
  success_message: 500,
  footer: 200,
  privacy_note: 500,
} as const;
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function pageSettings(raw?: unknown): PageSettings {
  const v = object(raw),
    out = {
      ...defaults,
      fields: defaultFields.map((f) => ({ ...f })),
      questions: [],
    } as PageSettings;
  for (const key of Object.keys(textLimits) as (keyof typeof textLimits)[])
    if (typeof v[key] === "string")
      out[key] = (v[key] as string).slice(0, textLimits[key]);
  for (const key of ["background", "surface", "text", "primary"] as const)
    if (typeof v[key] === "string" && /^#[0-9a-f]{6}$/i.test(v[key] as string))
      out[key] = v[key] as string;
  if (v.layout === "centered") out.layout = "centered";
  if (v.theme === "dark") out.theme = "dark";
  if (v.font === "elegant" || v.font === "modern") out.font = v.font;
  for (const key of ["logo_path", "cover_path"] as const)
    if (
      typeof v[key] === "string" &&
      (/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|webp|jpe?g)$/i.test(
        v[key] as string,
      ) ||
        /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
          v[key] as string,
        ))
    )
      out[key] = v[key] as string;
  if (Array.isArray(v.fields)) {
    const seen = new Set();
    const fields: PageField[] = [];
    for (const raw of v.fields) {
      const f = object(raw),
        base = defaultFields.find((item) => item.key === f.key);
      if (!base || seen.has(base.key)) continue;
      seen.add(base.key);
      fields.push({
        ...base,
        label: typeof f.label === "string" ? f.label.slice(0, 80) : base.label,
        placeholder:
          typeof f.placeholder === "string"
            ? f.placeholder.slice(0, 120)
            : base.placeholder,
        enabled: base.key === "label" || f.enabled !== false,
        required:
          base.key === "label" ||
          (base.key !== "contact" && f.required === true),
      });
    }
    out.fields = [
      ...fields,
      ...defaultFields.filter((f) => !seen.has(f.key)).map((f) => ({ ...f })),
    ];
  }
  if (Array.isArray(v.questions))
    out.questions = v.questions
      .slice(0, 3)
      .map(object)
      .filter(
        (q) => typeof q.id === "string" && /^q_[a-z0-9]{1,32}$/.test(q.id),
      )
      .map((q) => ({
        id: String(q.id),
        label: typeof q.label === "string" ? q.label.slice(0, 80) : "",
        placeholder:
          typeof q.placeholder === "string" ? q.placeholder.slice(0, 120) : "",
        required: q.required === true,
      }))
      .filter((q, i, all) => all.findIndex((x) => x.id === q.id) === i);
  return out;
}
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((c) => {
      const x = parseInt(c, 16) / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function buttonText(primary: string) {
  return contrast(primary, "#ffffff") >= contrast(primary, "#111111")
    ? "#ffffff"
    : "#111111";
}
export function validatePageSettings(s: PageSettings) {
  for (const key of Object.keys(textLimits) as (keyof typeof textLimits)[])
    if (s[key].length > textLimits[key])
      throw new Error("Texto muito longo: " + key);
  for (const key of [
    "headline",
    "form_title",
    "button",
    "success_title",
  ] as const)
    if (!s[key].trim())
      throw new Error(
        "Preencha título, título do formulário, botão e confirmação.",
      );
  for (const key of ["background", "surface", "text", "primary"] as const)
    if (!/^#[0-9a-f]{6}$/i.test(s[key]))
      throw new Error("Use cores no formato HEX, como #217958.");
  if (contrast(s.text, s.background) < 4.5 || contrast(s.text, s.surface) < 4.5)
    throw new Error(
      "A cor do texto precisa de mais contraste com o fundo e o formulário. Ajuste as cores para manter a leitura acessível.",
    );
  if (
    s.fields.length !== 6 ||
    new Set(s.fields.map((f) => f.key)).size !== 6 ||
    s.fields.some(
      (f) =>
        !fieldKeys.includes(f.key) ||
        !f.label.trim() ||
        f.label.length > 80 ||
        f.placeholder.length > 120,
    )
  )
    throw new Error("Revise os nomes dos campos do formulário.");
  if (
    !s.fields.find((f) => f.key === "label")?.enabled ||
    !s.fields.find((f) => f.key === "label")?.required ||
    s.fields.find((f) => f.key === "contact")?.required
  )
    throw new Error(
      "O produto é obrigatório e o contato deve continuar opcional.",
    );
  if (
    s.questions.length > 3 ||
    new Set(s.questions.map((q) => q.id)).size !== s.questions.length ||
    s.questions.some(
      (q) =>
        !/^q_[a-z0-9]{1,32}$/.test(q.id) ||
        !q.label.trim() ||
        q.label.length > 80 ||
        q.placeholder.length > 120,
    )
  )
    throw new Error("Revise as perguntas adicionais (até três).");
}
