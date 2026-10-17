import type { DemandInput } from "./types";
import { reasons } from "./logic";
export const blankDemand: DemandInput = {
  label: "",
  variant: "",
  product_id: null,
  reason: "missing",
  quantity: 1,
  budget: null,
  note: "",
  contact: "",
  contact_consent: false,
};
export function DemandFields({
  value,
  onChange,
  publicForm = false,
}: {
  value: DemandInput;
  onChange: (v: DemandInput) => void;
  publicForm?: boolean;
}) {
  function set<K extends keyof DemandInput>(key: K, next: DemandInput[K]) {
    onChange({ ...value, [key]: next });
  }
  return (
    <>
      <label>
        Produto procurado
        <input
          required
          maxLength={160}
          value={value.label}
          onChange={(e) => set("label", e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="form-grid">
        <label>
          Medida, cor ou modelo (opcional)
          <input
            maxLength={80}
            value={value.variant}
            onChange={(e) => set("variant", e.target.value)}
          />
        </label>
        <label>
          Quantidade desejada
          <input
            type="number"
            required
            min={1}
            max={1000}
            step={1}
            value={value.quantity}
            onChange={(e) => set("quantity", e.target.valueAsNumber)}
          />
        </label>
      </div>
      {!publicForm && (
        <label>
          Por que a venda não aconteceu?
          <select
            value={value.reason}
            onChange={(e) =>
              set("reason", e.target.value as DemandInput["reason"])
            }
          >
            {Object.entries(reasons).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Preço esperado por unidade, R$ (opcional)
        <input
          type="number"
          min={0}
          max={1000000}
          step="0.01"
          value={value.budget ?? ""}
          onChange={(e) =>
            set("budget", e.target.value === "" ? null : e.target.valueAsNumber)
          }
        />
      </label>
      <label>
        Observações (opcional)
        <textarea
          maxLength={500}
          value={value.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Detalhes que ajudam a identificar o produto"
        />
      </label>
      <label>
        WhatsApp ou e-mail (opcional)
        <input
          maxLength={160}
          value={value.contact}
          onChange={(e) =>
            onChange({
              ...value,
              contact: e.target.value,
              contact_consent: false,
            })
          }
          autoComplete="off"
        />
      </label>
      {value.contact.trim() && (
        <label className="consent-line">
          <input
            type="checkbox"
            required
            checked={value.contact_consent}
            onChange={(e) => set("contact_consent", e.target.checked)}
          />
          <span>
            {publicForm
              ? "Autorizo esta loja a usar meu contato para retornar exclusivamente sobre esta solicitação. Posso pedir a exclusão do contato a qualquer momento."
              : "O cliente autorizou o uso deste contato para retornar exclusivamente sobre esta solicitação e pode pedir sua exclusão."}
          </span>
        </label>
      )}
      <small>
        Informe apenas o necessário para este pedido. Não inclua documentos nem
        dados sensíveis.
      </small>
    </>
  );
}
