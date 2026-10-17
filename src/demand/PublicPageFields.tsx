import type { DemandInput } from "./types";
import type { PageSettings } from "./page-settings";
export function publicInput(
  value: DemandInput,
  settings: PageSettings,
): DemandInput {
  const next = { ...value };
  for (const field of settings.fields)
    if (!field.enabled) {
      if (field.key === "quantity") next.quantity = 1;
      else if (field.key === "budget") next.budget = null;
      else if (field.key !== "label") next[field.key] = "";
    }
  if (!next.contact) next.contact_consent = false;
  return next;
}
export function validatePublicFields(
  value: DemandInput,
  settings: PageSettings,
) {
  for (const f of settings.fields)
    if (
      f.enabled &&
      f.required &&
      (f.key === "budget"
        ? value.budget === null
        : !String(value[f.key] ?? "").trim())
    )
      throw new Error("Preencha: " + f.label);
  for (const q of settings.questions)
    if (
      q.required &&
      !value.custom_answers?.find((a) => a.id === q.id)?.value.trim()
    )
      throw new Error("Responda: " + q.label);
}
export function PublicPageFields({
  value,
  onChange,
  settings,
}: {
  value: DemandInput;
  onChange: (v: DemandInput) => void;
  settings: PageSettings;
}) {
  function set(key: string, next: string | number | null) {
    onChange({
      ...value,
      [key]: next,
      ...(key === "contact" ? { contact_consent: false } : {}),
    });
  }
  return (
    <>
      {settings.fields
        .filter((f) => f.enabled)
        .map((f) => (
          <label key={f.key}>
            {f.label}
            {f.key === "note" ? (
              <textarea
                required={f.required}
                maxLength={500}
                placeholder={f.placeholder}
                value={value.note}
                onChange={(e) => set(f.key, e.target.value)}
              />
            ) : f.key === "quantity" || f.key === "budget" ? (
              <input
                type="number"
                required={f.required}
                min={f.key === "quantity" ? 1 : 0}
                max={f.key === "quantity" ? 1000 : 1000000}
                step={f.key === "quantity" ? 1 : 0.01}
                placeholder={f.placeholder}
                value={value[f.key] ?? ""}
                onChange={(e) =>
                  set(
                    f.key,
                    e.target.value === "" && f.key === "budget"
                      ? null
                      : e.target.valueAsNumber,
                  )
                }
              />
            ) : (
              <input
                required={f.required && f.key !== "contact"}
                maxLength={f.key === "variant" ? 80 : 160}
                placeholder={f.placeholder}
                value={value[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                autoComplete="off"
              />
            )}
          </label>
        ))}
      {settings.questions.map((q) => (
        <label key={q.id}>
          {q.label}
          <input
            maxLength={240}
            required={q.required}
            placeholder={q.placeholder}
            value={
              value.custom_answers?.find((a) => a.id === q.id)?.value ?? ""
            }
            onChange={(e) =>
              onChange({
                ...value,
                custom_answers: settings.questions.map((question) => ({
                  id: question.id,
                  label: question.label,
                  value:
                    question.id === q.id
                      ? e.target.value
                      : (value.custom_answers?.find((a) => a.id === question.id)
                          ?.value ?? ""),
                })),
              })
            }
          />
        </label>
      ))}
      {value.contact.trim() &&
        settings.fields.find((f) => f.key === "contact")?.enabled && (
          <label className="consent-line">
            <input
              type="checkbox"
              required
              checked={value.contact_consent}
              onChange={(e) =>
                onChange({ ...value, contact_consent: e.target.checked })
              }
            />
            <span>
              Autorizo esta loja a usar meu contato para retornar exclusivamente
              sobre esta solicitação. Posso pedir a exclusão do contato a
              qualquer momento.
            </span>
          </label>
        )}
      <small className="store-data-note">
        Informe apenas o necessário para este pedido. Não inclua documentos nem
        dados sensíveis.
      </small>
    </>
  );
}
