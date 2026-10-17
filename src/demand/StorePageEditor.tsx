import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  ImagePlus,
  Monitor,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Dialog } from "../components/Dialog";
import { blankDemand } from "./DemandFields";
import {
  pageSettings,
  defaults,
  textLimits,
  validatePageSettings,
  type PageSettings,
} from "./page-settings";
import { StorePageView } from "./StorePageView";
import { PublicPageFields } from "./PublicPageFields";
import { uploadPageImage, publicPageImage } from "./page-images";
import type { PublicStore } from "./types";
export function StorePageEditor({
  store,
  name,
  demo,
  close,
  save,
}: {
  store: PublicStore | null;
  name: string;
  demo: boolean;
  close: () => void;
  save: (name: string, s: PageSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => pageSettings(store?.page_settings)),
    [title, setTitle] = useState(store?.name ?? name),
    [tab, setTab] = useState("appearance"),
    [size, setSize] = useState("mobile"),
    [successPreview, setSuccessPreview] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState(false);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      settings: pageSettings(store?.page_settings),
      name: store?.name ?? name,
    }),
  );
  const dirty = JSON.stringify({ settings: draft, name: title }) !== baseline;
  function update<K extends keyof PageSettings>(
    key: K,
    value: PageSettings[K],
  ) {
    setDraft((s) => ({ ...s, [key]: value }));
    setNotice("");
  }
  function dismiss() {
    if (dirty) setDiscard(true);
    else close();
  }
  async function image(key: "logo_path" | "cover_path", file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      update(key, await uploadPageImage(demo, file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      validatePageSettings(draft);
      await save(title, draft);
      setBaseline(JSON.stringify({ settings: draft, name: title }));
      setNotice(
        store?.enabled
          ? "Alterações publicadas no mesmo link da loja."
          : "Personalização salva. Ative a página em Link da loja para compartilhar.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const copyFields = [
    ["eyebrow", "Texto acima do título"],
    ["headline", "Título principal"],
    ["description", "Descrição da página"],
    ["form_title", "Título do formulário"],
    ["form_description", "Descrição do formulário"],
    ["button", "Texto do botão de envio"],
    ["success_title", "Título de confirmação"],
    ["success_message", "Mensagem de confirmação"],
    ["footer", "Texto do rodapé"],
    ["privacy_note", "Informação adicional de privacidade"],
  ] as const;
  return (
    <Dialog
      title="Personalizar página de sugestões"
      close={dismiss}
      busy={busy}
      className="page-editor-dialog"
    >
      <div className="page-editor-top">
        <p>
          Crie uma página com a identidade da sua loja. A prévia não envia
          solicitações.
        </p>
        <span className="tag">
          {dirty ? "Alterações não salvas" : "Tudo salvo"}
        </span>
      </div>
      {!demo && store && store.page_settings === undefined && (
        <div className="notice">
          <strong>Ative o editor no seu banco uma única vez.</strong>
          <p>
            Copie a atualização abaixo, cole no SQL Editor do Supabase e toque
            em Run. Depois atualize o Reposita. Os links e as sugestões serão
            preservados.
          </p>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                const response = await fetch("/updates/store-pages.sql");
                if (!response.ok) throw new Error("Atualização indisponível.");
                const sql = await response.text();
                if (!sql.startsWith("-- Apply after"))
                  throw new Error("Arquivo inválido.");
                await navigator.clipboard.writeText(sql);
                setNotice(
                  "Atualização copiada. Cole no SQL Editor do Supabase e toque em Run.",
                );
              } catch {
                setError(
                  "Não foi possível copiar. Abra o arquivo da atualização e copie o conteúdo.",
                );
              }
            }}
          >
            Copiar atualização do banco
          </button>{" "}
          <a href="/updates/store-pages.sql" target="_blank" rel="noreferrer">
            Abrir arquivo SQL
          </a>
        </div>
      )}
      <div className="page-editor-layout">
        <section className="page-editor-controls">
          <div className="segmented" aria-label="Seções do editor">
            {[
              ["appearance", "Visual"],
              ["copy", "Textos"],
              ["fields", "Formulário"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={tab === key}
                className={tab === key ? "selected" : ""}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "appearance" && (
            <div className="editor-fields">
              <label>
                Nome público da loja
                <input
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <div className="form-grid">
                <label>
                  Organização
                  <select
                    value={draft.layout}
                    onChange={(e) =>
                      update("layout", e.target.value as PageSettings["layout"])
                    }
                  >
                    <option value="split">Apresentação ao lado</option>
                    <option value="centered">Tudo centralizado</option>
                  </select>
                </label>
                <label>
                  Estilo de fonte
                  <select
                    value={draft.font}
                    onChange={(e) =>
                      update("font", e.target.value as PageSettings["font"])
                    }
                  >
                    <option value="clean">Limpa e acolhedora</option>
                    <option value="elegant">Clássica e elegante</option>
                    <option value="modern">Direta e moderna</option>
                  </select>
                </label>
              </div>
              <label>
                Paleta inicial
                <select
                  value={draft.theme}
                  onChange={(e) => {
                    const dark = e.target.value === "dark";
                    setDraft({
                      ...draft,
                      theme: dark ? "dark" : "light",
                      background: dark ? "#102219" : defaults.background,
                      surface: dark ? "#1b3229" : defaults.surface,
                      text: dark ? "#e0ede1" : defaults.text,
                      primary: dark ? "#a4d5ad" : defaults.primary,
                    });
                  }}
                >
                  <option value="light">Clara</option>
                  <option value="dark">Escura</option>
                </select>
              </label>
              <div className="page-colors">
                {(
                  [
                    ["background", "Fundo da página"],
                    ["surface", "Fundo do formulário"],
                    ["text", "Cor dos textos"],
                    ["primary", "Cor dos botões"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <div>
                      <input
                        type="color"
                        aria-label={label}
                        value={draft[key]}
                        onChange={(e) => update(key, e.target.value)}
                      />
                      <code>{draft[key]}</code>
                    </div>
                  </label>
                ))}
              </div>
              {(
                [
                  ["logo_path", "Logo da loja"],
                  ["cover_path", "Imagem de destaque"],
                ] as const
              ).map(([key, label]) => (
                <div className="editor-image" key={key}>
                  <strong>{label}</strong>
                  {draft[key] && (
                    <img
                      src={publicPageImage(draft[key])}
                      alt={label + " atual"}
                    />
                  )}
                  <label className="secondary">
                    <ImagePlus size={15} />
                    {draft[key] ? "Substituir imagem" : "Enviar imagem"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={label}
                      disabled={busy}
                      onChange={(e) => void image(key, e.target.files?.[0])}
                    />
                  </label>
                  {draft[key] && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy}
                      onClick={() => update(key, "")}
                    >
                      <Trash2 size={14} />
                      Remover da página
                    </button>
                  )}
                </div>
              ))}
              <small>
                JPG, PNG ou WebP, até 5 MB. As imagens serão públicas nesta
                página; use conteúdo que sua loja possa publicar.
              </small>
            </div>
          )}
          {tab === "copy" && (
            <div className="editor-fields">
              <p>
                Use <code>{"{loja}"}</code> no título para inserir o nome da
                loja automaticamente.
              </p>
              {copyFields.map(([key, label]) => (
                <label key={key}>
                  {label}
                  {textLimits[key] > 250 ? (
                    <textarea
                      aria-label={label}
                      maxLength={textLimits[key]}
                      value={draft[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  ) : (
                    <input
                      aria-label={label}
                      maxLength={textLimits[key]}
                      value={draft[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  )}
                  <small>
                    {draft[key].length}/{textLimits[key]}
                  </small>
                </label>
              ))}
              <small>
                O aviso de contato opcional, o consentimento e a explicação de
                que não se trata de compra permanecem visíveis.
              </small>
            </div>
          )}
          {tab === "fields" && (
            <div className="editor-fields">
              <p>
                Altere rótulos, exemplos e ordem. O produto procurado é
                obrigatório; o contato permanece opcional.
              </p>
              {draft.fields.map((field, index) => (
                <div className="editor-field-card" key={field.key}>
                  <div className="section-heading">
                    <strong>{field.label || "Campo sem nome"}</strong>
                    <div className="actions">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"Subir " + field.key}
                        disabled={index === 0}
                        onClick={() => {
                          const fields = [...draft.fields];
                          [fields[index - 1], fields[index]] = [
                            fields[index],
                            fields[index - 1],
                          ];
                          update("fields", fields);
                        }}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"Descer " + field.key}
                        disabled={index === draft.fields.length - 1}
                        onClick={() => {
                          const fields = [...draft.fields];
                          [fields[index + 1], fields[index]] = [
                            fields[index],
                            fields[index + 1],
                          ];
                          update("fields", fields);
                        }}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </div>
                  </div>
                  <label>
                    Nome do campo · {field.key}
                    <input
                      maxLength={80}
                      value={field.label}
                      onChange={(e) =>
                        update(
                          "fields",
                          draft.fields.map((f) =>
                            f.key === field.key
                              ? { ...f, label: e.target.value }
                              : f,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Exemplo no campo · {field.key}
                    <input
                      maxLength={120}
                      value={field.placeholder}
                      onChange={(e) =>
                        update(
                          "fields",
                          draft.fields.map((f) =>
                            f.key === field.key
                              ? { ...f, placeholder: e.target.value }
                              : f,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="actions">
                    <label className="consent-line">
                      <input
                        type="checkbox"
                        checked={field.enabled}
                        disabled={field.key === "label"}
                        onChange={(e) =>
                          update(
                            "fields",
                            draft.fields.map((f) =>
                              f.key === field.key
                                ? { ...f, enabled: e.target.checked }
                                : f,
                            ),
                          )
                        }
                      />
                      Exibir campo
                    </label>
                    <label className="consent-line">
                      <input
                        type="checkbox"
                        checked={field.required}
                        disabled={
                          field.key === "label" ||
                          field.key === "contact" ||
                          !field.enabled
                        }
                        onChange={(e) =>
                          update(
                            "fields",
                            draft.fields.map((f) =>
                              f.key === field.key
                                ? { ...f, required: e.target.checked }
                                : f,
                            ),
                          )
                        }
                      />
                      Obrigatório
                    </label>
                  </div>
                </div>
              ))}
              <h3>Perguntas adicionais</h3>
              <small>
                Até três perguntas de texto. Não solicite documentos ou dados
                sensíveis.
              </small>
              {draft.questions.map((q, i) => (
                <div className="editor-field-card" key={q.id}>
                  <label>
                    Pergunta {i + 1}
                    <input
                      maxLength={80}
                      value={q.label}
                      onChange={(e) =>
                        update(
                          "questions",
                          draft.questions.map((x) =>
                            x.id === q.id ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Exemplo da pergunta {i + 1}
                    <input
                      maxLength={120}
                      value={q.placeholder}
                      onChange={(e) =>
                        update(
                          "questions",
                          draft.questions.map((x) =>
                            x.id === q.id
                              ? { ...x, placeholder: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="consent-line">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) =>
                        update(
                          "questions",
                          draft.questions.map((x) =>
                            x.id === q.id
                              ? { ...x, required: e.target.checked }
                              : x,
                          ),
                        )
                      }
                    />
                    Resposta obrigatória
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      update(
                        "questions",
                        draft.questions.filter((x) => x.id !== q.id),
                      )
                    }
                  >
                    Remover pergunta {i + 1}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                disabled={draft.questions.length >= 3}
                onClick={() =>
                  update("questions", [
                    ...draft.questions,
                    {
                      id: "q_" + crypto.randomUUID().replace(/-/g, ""),
                      label: "",
                      placeholder: "",
                      required: false,
                    },
                  ])
                }
              >
                Adicionar pergunta
              </button>
            </div>
          )}
        </section>
        <section className="page-editor-preview" aria-label="Prévia da página">
          <div className="preview-tools">
            <span>
              <Eye size={15} />
              Prévia ao vivo
            </span>
            <div className="actions">
              <button
                type="button"
                className="icon-button"
                aria-label="Prévia no celular"
                aria-pressed={size === "mobile"}
                onClick={() => setSize("mobile")}
              >
                <Smartphone size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Prévia no computador"
                aria-pressed={size === "desktop"}
                onClick={() => setSize("desktop")}
              >
                <Monitor size={17} />
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSuccessPreview((v) => !v)}
              >
                {successPreview ? "Ver formulário" : "Ver confirmação"}
              </button>
            </div>
          </div>
          <div className={"preview-device " + size}>
            <StorePageView name={title || "Sua loja"} settings={draft} preview>
              {successPreview ? (
                <div className="demand-empty">
                  <h2>{draft.success_title}</h2>
                  <p>{draft.success_message}</p>
                </div>
              ) : (
                <>
                  <h2>{draft.form_title}</h2>
                  {draft.form_description && <p>{draft.form_description}</p>}
                  <fieldset disabled>
                    <PublicPageFields
                      value={blankDemand}
                      onChange={() => {}}
                      settings={draft}
                    />
                    <button type="button" className="primary">
                      {draft.button}
                    </button>
                  </fieldset>
                  <small>
                    Verificação de segurança e aviso de privacidade aparecem na
                    página publicada.
                  </small>
                </>
              )}
            </StorePageView>
          </div>
        </section>
      </div>
      {discard && (
        <div className="notice" role="alert">
          <p>Existem alterações não salvas. Deseja descartá-las?</p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setDiscard(false)}
            >
              Continuar editando
            </button>
            <button type="button" className="text-button" onClick={close}>
              Descartar e voltar
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="editor-save-bar">
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setDraft(pageSettings());
            setNotice(
              "Modelo padrão carregado na prévia. Salve para publicar.",
            );
          }}
        >
          Restaurar modelo padrão
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !dirty}
          onClick={() => void publish()}
        >
          {busy ? "Salvando…" : "Salvar personalização"}
        </button>
      </div>
    </Dialog>
  );
}
