import { useState } from "react";
import { Download, ExternalLink, Moon, ShieldCheck, Sun } from "lucide-react";
import type { InventoryData } from "../types";
import type { DemandData } from "../demand/types";
export function SettingsPanel({
  demo,
  email,
  name,
  setName,
  theme,
  setTheme,
  data,
  upgraded,
  demand,
}: {
  demo: boolean;
  email?: string;
  name: string;
  setName: (name: string) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  data: InventoryData;
  upgraded: boolean | null;
  demand?: DemandData;
}) {
  const [draft, setDraft] = useState(name);
  const [message, setMessage] = useState("");
  const backup = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 4,
              exported_at: new Date().toISOString(),
              ...data,
              demand,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "reposita-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="settings-grid">
      <section className="panel">
        <span className="eyebrow">DO SEU JEITO</span>
        <h2>Seu espaço de trabalho</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setName(draft.trim() || "Meu negócio");
            setMessage("Nome salvo neste navegador.");
          }}
        >
          <label>
            Nome do negócio
            <input
              maxLength={80}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button className="primary">Salvar nome</button>
          {message && (
            <p className="fine-print" role="status">
              {message}
            </p>
          )}
        </form>
        <p className="fine-print">
          Preferência visual salva neste dispositivo, não um cadastro fiscal da
          empresa.
        </p>
        <h3>Aparência</h3>
        <div className="theme-options">
          <button
            className="secondary"
            aria-pressed={theme === "light"}
            onClick={() => setTheme("light")}
          >
            <Sun size={17} />
            Claro
          </button>
          <button
            className="secondary"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme("dark")}
          >
            <Moon size={17} />
            Escuro
          </button>
        </div>
        <h3>Exportação de segurança</h3>
        <p>
          Baixe produtos, eventos e os dados carregados de procura e testes em
          JSON para guardar uma cópia. Contatos autorizados também serão
          exportados; guarde o arquivo com cuidado. As fotos privadas não são
          incluídas no arquivo; ele contém somente suas referências.
        </p>
        <button className="secondary" onClick={backup}>
          <Download size={16} />
          Baixar cópia dos dados
        </button>
        <p className="fine-print">
          Não há restauração automática de JSON nesta versão. Guarde o arquivo
          em local seguro. Não envie dados comerciais de terceiros sem
          autorização.
        </p>
      </section>
      <section className="panel">
        <div className="section-heading">
          <span className="eyebrow">CONEXÃO E PROTEÇÃO</span>
          <ShieldCheck size={23} />
        </div>
        <h2>Dados sob seu controle</h2>
        <dl>
          <div>
            <dt>Modo</dt>
            <dd>{demo ? "Demonstração local" : "Conta Supabase"}</dd>
          </div>
          <div>
            <dt>Conta</dt>
            <dd className="break-word">{demo ? "Sem conta" : email}</dd>
          </div>
          <div>
            <dt>Fotos e campos avançados</dt>
            <dd>
              {demo
                ? "Disponíveis no modo local"
                : upgraded === null
                  ? "Verificando…"
                  : upgraded
                    ? "Atualização aplicada"
                    : "Atualização SQL necessária"}
            </dd>
          </div>
          <div>
            <dt>Histórico</dt>
            <dd>Movimentações preservadas</dd>
          </div>
        </dl>
        {!demo && upgraded === false && (
          <div className="notice">
            <strong>Ative a atualização profissional</strong>
            <p>
              Execute somente a nova migration{" "}
              <code>202610160002_professional.sql</code> no SQL Editor do
              Supabase. Ela preserva seus produtos e cria o armazenamento
              privado de imagens. Depois, use Atualizar dados.
            </p>
            <a
              className="text-link"
              href="https://github.com/Felipeluna92/reposita/blob/main/supabase/migrations/202610160002_professional.sql"
              target="_blank"
              rel="noreferrer"
            >
              Abrir SQL da atualização <ExternalLink size={13} />
            </a>
          </div>
        )}
        {demo && (
          <p className="notice">
            As fotos e os produtos de demonstração ficam somente neste
            navegador. Para uso real, entre na conta Supabase.
          </p>
        )}
        <h3>Regras importantes</h3>
        <ul className="settings-list">
          <li>Você só acessa os produtos da sua conta.</li>
          <li>As fotos usam bucket privado, sem galeria pública.</li>
          <li>
            Movimentações não são apagadas. Corrija saldos com novos ajustes.
          </li>
          <li>Compras não recalculam o custo médio automaticamente.</li>
          <li>
            Os resultados são gerenciais; não substituem orientação contábil.
          </li>
        </ul>
        <a
          className="text-link"
          target="_blank"
          rel="noreferrer"
          href="https://github.com/Felipeluna92/reposita#readme"
        >
          Documentação e instruções completas ↗
        </a>
      </section>
    </div>
  );
}
