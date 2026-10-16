import { useMemo, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Dialog } from "./Dialog";
import { csvHeaders, downloadCsv, importPreview } from "../lib/csv";
import type { Product, ProductInput } from "../types";
export function ImportDialog({
  products,
  save,
  close,
}: {
  products: Product[];
  save: (items: ProductInput[], request: string) => Promise<void>;
  close: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [request] = useState(() => crypto.randomUUID());
  const preview = useMemo(() => {
    try {
      return text
        ? {
            rows: importPreview(
              text,
              products.map((p) => p.sku),
            ),
            error: "",
          }
        : { rows: [], error: "" };
    } catch (e) {
      return { rows: [], error: (e as Error).message };
    }
  }, [text, products]);
  const errors = preview.rows.filter((row) => row.error);
  const valid = preview.rows.length > 0 && !errors.length && !preview.error;
  return (
    <Dialog title="Importar catálogo CSV" close={close} busy={busy}>
      <p>
        Revise tudo antes de importar. Somente novos produtos; SKUs existentes
        não são sobrescritos. Até 200 linhas por arquivo.
      </p>
      <button
        disabled={busy}
        className="secondary"
        onClick={() =>
          downloadCsv("reposita-modelo.csv", [
            csvHeaders,
            [
              "Produto exemplo",
              "SKU-001",
              "Geral",
              10,
              5,
              "12,50",
              "24,90",
              "",
              "Fornecedor",
              "Prateleira A",
              "Descrição opcional",
            ],
          ])
        }
      >
        <Download size={16} />
        Baixar modelo
      </button>
      <label className="import-drop">
        <FileUp size={30} />
        <strong>Escolher arquivo CSV</strong>
        <span>Até 2 MB · separador ponto e vírgula ou vírgula</span>
        <input
          disabled={busy}
          aria-label="Arquivo CSV"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            try {
              if (file.size > 2 * 1024 * 1024)
                throw new Error("O CSV deve ter até 2 MB.");
              setText(await file.text());
            } catch (error) {
              setError((error as Error).message);
            }
            e.target.value = "";
          }}
        />
      </label>
      {preview.rows.length > 0 && (
        <div className="import-preview">
          <h3>
            {preview.rows.length} linhas · {errors.length} com erro
          </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Produto</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td>{row.input?.name || "—"}</td>
                    <td className={row.error ? "danger-text" : "positive-text"}>
                      {row.error || "Pronto para importar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(preview.error || error) && (
        <p className="error" role="alert">
          {preview.error || error}
        </p>
      )}
      <p className="fine-print">
        A importação no Supabase é transacional: se uma linha falhar, nenhuma
        linha do lote é salva. Imagens são adicionadas depois, no cadastro.
      </p>
      <div className="actions">
        <button disabled={busy} className="secondary" onClick={close}>
          Cancelar
        </button>
        <button
          className="primary"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await save(
                preview.rows.map((row) => row.input!),
                request,
              );
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Importando…"
            : `Importar ${preview.rows.length || ""} produtos`}
        </button>
      </div>
    </Dialog>
  );
}
