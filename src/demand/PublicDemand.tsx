import { useEffect, useState } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { DemandFields, blankDemand } from "./DemandFields";
import { Turnstile } from "./Turnstile";
import { readDemandDemo, submitDemoDemand } from "./repository";
import { validateDemand } from "./logic";
import type { PublicStore } from "./types";
export function PublicDemand({ token }: { token: string }) {
  const demo = token === "demo";
  const [store, setStore] = useState<PublicStore | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [ready, setReady] = useState(demo),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  const [value, setValue] = useState({ ...blankDemand }),
    [captcha, setCaptcha] = useState(""),
    [reset, setReset] = useState(0),
    [trap, setTrap] = useState(""),
    [id, setId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function load() {
      try {
        let next: PublicStore | null;
        if (demo) {
          next = readDemandDemo().store;
        } else {
          if (!supabase || !/^[0-9a-f-]{36}$/i.test(token))
            throw new Error(
              "Página indisponível. Solicite um link atualizado à loja.",
            );
          const [result, response] = await Promise.all([
            supabase.rpc("reposita_public_store_info", {
              p_token: token,
            }),
            fetch("/api/demand", { signal: controller.signal }),
          ]);
          if (result.error)
            throw new Error("Não foi possível abrir a página desta loja.");
          next = result.data;
          const data = response.ok ? await response.json() : null;
          if (alive)
            setReady(
              !!data?.enabled && !!import.meta.env.VITE_TURNSTILE_SITE_KEY,
            );
        }
        if (!next?.enabled)
          throw new Error(
            "Esta página está desativada. Solicite um link atualizado à loja.",
          );
        if (alive) setStore(next);
      } catch (e) {
        if (alive && !controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [token, demo]);
  return (
    <main className="public-demand">
      <header>
        <a href="/" className="public-brand">
          <b>r.</b>
          <span>
            reposita<small>OUVINDO O SEU PRÓXIMO PEDIDO</small>
          </span>
        </a>
      </header>
      <section className="public-demand-layout">
        <div className="public-intro">
          <span className="eyebrow">UM BOM COMEÇO É OUVIR VOCÊ</span>
          <h1>
            {store
              ? `O que você gostaria de encontrar na ${store.name}?`
              : "Seu próximo pedido começa aqui."}
          </h1>
          <p>
            Conte o que está procurando. A loja recebe seu interesse e pode
            avaliar uma próxima compra.
          </p>
          <div className="public-steps">
            <MessageCircle size={26} />
            <span>
              Sem cadastro. Contato opcional.
              <br />
              Nenhuma compra ou reserva é criada por aqui.
            </span>
          </div>
        </div>
        <section className="panel public-form">
          {loading ? (
            <p role="status">Abrindo página da loja…</p>
          ) : success ? (
            <div className="demand-empty">
              <CheckCircle2 size={42} />
              <h2>Seu interesse foi registrado.</h2>
              <p>
                {value.contact_consent && value.contact
                  ? "A loja poderá retornar sobre este pedido pelo contato autorizado."
                  : "A loja recebeu sua solicitação sem dados de contato."}{" "}
                A disponibilidade e o prazo ainda precisam ser confirmados.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setSuccess(false);
                  setValue({ ...blankDemand });
                  setId(crypto.randomUUID());
                  setCaptcha("");
                  setReset((n) => n + 1);
                }}
              >
                Solicitar outro produto
              </button>
            </div>
          ) : store ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setError("");
                setBusy(true);
                try {
                  validateDemand(value);
                  if (demo) {
                    await submitDemoDemand(value, id);
                  } else {
                    if (!ready || !captcha)
                      throw new Error(
                        "Conclua a verificação de segurança antes de enviar.",
                      );
                    const response = await fetch("/api/demand", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id,
                        store: token,
                        input: value,
                        captcha,
                        website: trap,
                      }),
                      signal: AbortSignal.timeout(15000),
                    });
                    const result = await response.json();
                    if (!response.ok)
                      throw new Error(
                        result.error ??
                          "Não foi possível enviar. Tente novamente.",
                      );
                  }
                  setSuccess(true);
                } catch (e) {
                  setError((e as Error).message);
                  setCaptcha("");
                  setReset((n) => n + 1);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>Conte para a loja</h2>
              {demo && (
                <p className="demo-banner">
                  Demonstração: este pedido ficará somente neste navegador.
                </p>
              )}
              <DemandFields value={value} onChange={setValue} publicForm />
              <div className="honeypot" aria-hidden="true">
                <label>
                  Seu site
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={trap}
                    onChange={(e) => setTrap(e.target.value)}
                  />
                </label>
              </div>
              {!demo &&
                (ready ? (
                  <Turnstile onToken={setCaptcha} reset={reset} />
                ) : (
                  <p className="error">
                    O recebimento está temporariamente indisponível. Fale
                    diretamente com a loja.
                  </p>
                ))}
              <p className="privacy-note">
                Os dados serão usados por {store.name} para avaliar esta
                solicitação. Se você autorizar um retorno, a loja usará o
                contato apenas para este pedido. Para excluir o contato ou
                interromper o retorno, avise a loja pelo mesmo canal. Não é uma
                inscrição em campanhas.
              </p>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="primary"
                disabled={busy || !ready || (!demo && !captcha)}
              >
                {busy ? "Enviando…" : "Registrar meu interesse"}
              </button>
            </form>
          ) : (
            <div role="alert">
              <h2>Não foi possível abrir esta página</h2>
              <p>{error}</p>
            </div>
          )}
        </section>
      </section>
      <footer>Reposita · tecnologia para aproximar lojas e clientes.</footer>
    </main>
  );
}
